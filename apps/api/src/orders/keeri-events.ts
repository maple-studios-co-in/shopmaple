import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../cart.js";

/**
 * Order progress from Keeri. After Keeri accepts a paid order it reports what happens to it: status moves, delivery,
 * cancellation, a declined cancellation request and the refund. Keeri posts each as a signed event (its
 * `STOREFRONT_WEBHOOKS` endpoint for this store), oldest first per order, retrying for about a day and a half.
 *
 * The store keeps every event as received and derives the buyer's view from them when an order page is read, so a
 * late or repeated event never needs a second write. Nothing here changes a payment or an order's own state.
 */

/** `X-Keeri-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
const signatureHeader = /^t=([0-9]{1,12}),v1=([a-f0-9]{64})$/;
/** Keeri signs when it sends, and one run posts up to 50 events with an 8-second timeout each, so a late post in a slow
 * run is still genuine. A replay inside the window changes nothing: an event is stored once, by its body. */
export const signatureToleranceSeconds = 10 * 60;

export function verifyKeeriSignature(secret: string, rawBody: Buffer, header: string | undefined, now: Date): boolean {
  const match = signatureHeader.exec(header ?? "");
  if (!match) return false;
  const [, t, given] = match;
  if (Math.abs(Math.floor(now.getTime() / 1000) - Number(t)) > signatureToleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
  const supplied = Buffer.from(given!, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const remoteId = z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/);
const at = z.iso.datetime({ offset: true });
const paise = z.number().int().min(0).max(2_147_483_647);
// Loose objects: Keeri may add fields to an event without the store refusing it. `order.delivered` carries exactly
// these three (Keeri keeps that shape fixed).
const events = {
  "order.status_changed": z.looseObject({ externalOrderId: remoteId, status: z.string().min(1).max(40), changedAt: at }),
  "order.delivered": z.looseObject({ externalOrderId: remoteId, deliveredAt: at }),
  "order.cancelled": z.looseObject({
    externalOrderId: remoteId,
    cancelledAt: at,
    refund: z.looseObject({ status: z.string().max(40), amountPaise: paise }).optional(),
  }),
  // `note` is staff's note to the buyer (Keeri asks 3 to 500 characters); kept optional so an older Keeri still lands.
  "order.cancellation_declined": z.looseObject({ externalOrderId: remoteId, decidedAt: at, note: z.string().max(500).nullable().optional() }),
  "order.refunded": z.looseObject({ externalOrderId: remoteId, amountPaise: paise, refundedAt: at }),
} as const;
export type KeeriOrderEventType = keyof typeof events;
const isKnown = (type: string): type is KeeriOrderEventType => Object.hasOwn(events, type);
const when = { "order.status_changed": "changedAt", "order.delivered": "deliveredAt", "order.cancelled": "cancelledAt",
  "order.cancellation_declined": "decidedAt", "order.refunded": "refundedAt" } as const satisfies Record<KeeriOrderEventType, string>;

export type IngestOutcome = "stored" | "duplicate" | "ignored";

/**
 * Stores one authenticated event. The same body is stored once, so Keeri's retries and a replay are harmless. An event
 * type the store does not know yet is acknowledged and not stored, so a new Keeri event never blocks the ones behind it.
 * A body that is not a Keeri order event is refused (400), which Keeri records against the event.
 */
export async function ingestKeeriOrderEvent(db: PrismaClient, merchantScope: string, rawBody: Buffer): Promise<IngestOutcome> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_ORDER_EVENT", "Invalid order event.");
  }
  const type = z.object({ event: z.string().min(1).max(100) }).safeParse(body);
  if (!type.success) throw new HttpError(400, "INVALID_ORDER_EVENT", "Invalid order event.");
  if (!isKnown(type.data.event)) return "ignored";
  const parsed = events[type.data.event].safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_ORDER_EVENT", "Invalid order event.");
  const payload = parsed.data as Record<string, unknown> & { externalOrderId: string };
  try {
    await db.keeriOrderEvent.create({
      data: {
        merchantScope,
        externalOrderId: payload.externalOrderId,
        type: type.data.event,
        bodySha256: createHash("sha256").update(rawBody).digest("hex"),
        payload: payload as Prisma.InputJsonObject,
        occurredAt: new Date(payload[when[type.data.event]] as string),
      },
    });
    return "stored";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}

/** Where a confirmed order stands for the buyer, as Keeri last reported it. */
export type OrderStage = "confirmed" | "preparing" | "dispatched" | "delivered" | "cancelled";
export type OrderRefund = { status: "pending" | "refunded"; amountPaise: number; refundedAt: Date | null };
export type OrderProgress = {
  /** Null when Keeri has reported nothing the buyer's view uses (the order is simply confirmed). */
  stage: OrderStage | null;
  preparingAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  /** When staff last declined the buyer's cancellation request in Keeri; null when never. */
  cancellationDeclinedAt: Date | null;
  /** Staff's note to the buyer with that decision, when Keeri sent one. */
  cancellationDeclinedNote: string | null;
  refund: OrderRefund | null;
};

// Keeri's order statuses as the buyer hears them. In production and ready are both "preparing"; a draft never reaches a
// store order, and an unknown status is left out rather than guessed.
const stages: Record<string, OrderStage> = {
  confirmed: "confirmed", in_production: "preparing", ready: "preparing", dispatched: "dispatched", delivered: "delivered", cancelled: "cancelled",
};
const stageOrder: OrderStage[] = ["confirmed", "preparing", "dispatched", "delivered"];

type StoredEvent = { type: string; payload: unknown; occurredAt: Date };

/**
 * The buyer's view from an order's events, in the order they happened. Cancelled and delivered are final. Each stage
 * keeps the first time it was reached, and a later stage implies the earlier ones (an order Keeri marks dispatched
 * without a production step was still prepared).
 */
export function orderProgress(rows: readonly StoredEvent[]): OrderProgress {
  const progress: OrderProgress = { stage: null, preparingAt: null, dispatchedAt: null, deliveredAt: null, cancelledAt: null, cancellationDeclinedAt: null, cancellationDeclinedNote: null, refund: null };
  const reach = (stage: OrderStage, on: Date) => {
    if (stage === "cancelled") { progress.cancelledAt ??= on; return; }
    if (stage === "preparing") progress.preparingAt ??= on;
    if (stage === "dispatched") progress.dispatchedAt ??= on;
    if (stage === "delivered") progress.deliveredAt ??= on;
    if (!progress.stage || stageOrder.indexOf(stage) > stageOrder.indexOf(progress.stage)) progress.stage = stage;
  };
  for (const row of [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (row.type === "order.status_changed") {
      const stage = typeof payload.status === "string" ? stages[payload.status] : undefined;
      if (stage) reach(stage, row.occurredAt);
    } else if (row.type === "order.delivered") reach("delivered", row.occurredAt);
    else if (row.type === "order.cancelled") {
      reach("cancelled", row.occurredAt);
      const refund = payload.refund as { amountPaise?: unknown } | undefined;
      if (refund && typeof refund.amountPaise === "number" && progress.refund?.status !== "refunded")
        progress.refund = { status: "pending", amountPaise: refund.amountPaise, refundedAt: null };
    } else if (row.type === "order.cancellation_declined") {
      progress.cancellationDeclinedAt = row.occurredAt;
      progress.cancellationDeclinedNote = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null;
    }
    else if (row.type === "order.refunded" && typeof payload.amountPaise === "number")
      progress.refund = { status: "refunded", amountPaise: payload.amountPaise, refundedAt: row.occurredAt };
  }
  if (progress.cancelledAt) progress.stage = "cancelled";
  return progress;
}

/** Progress for several orders at once, by the id Keeri gave each. Orders Keeri has said nothing about are absent. */
export async function loadOrderProgress(
  db: PrismaClient,
  merchantScope: string | undefined,
  externalOrderIds: readonly string[],
): Promise<Map<string, OrderProgress>> {
  if (!externalOrderIds.length) return new Map();
  const rows = await db.keeriOrderEvent.findMany({
    where: { externalOrderId: { in: [...new Set(externalOrderIds)] }, ...(merchantScope ? { merchantScope } : {}) },
    orderBy: [{ occurredAt: "asc" }, { receivedAt: "asc" }],
    select: { externalOrderId: true, type: true, payload: true, occurredAt: true },
  });
  const byOrder = new Map<string, StoredEvent[]>();
  for (const row of rows) byOrder.set(row.externalOrderId, [...(byOrder.get(row.externalOrderId) ?? []), row]);
  return new Map([...byOrder].map(([id, list]) => [id, orderProgress(list)]));
}

export type KeeriOrderEventsConfig = { secret: string; merchantScope: string };

/** `KEERI_DELIVERY_WEBHOOK_SECRET` (the secret Keeri signs with, at least 32 characters) and the store's merchant scope.
 * Without both the route does not exist and Keeri keeps its events queued. A short secret stops startup. */
export function loadKeeriOrderEventsConfig(env: NodeJS.ProcessEnv, merchantScope: string | undefined): KeeriOrderEventsConfig | null {
  const secret = env.KEERI_DELIVERY_WEBHOOK_SECRET?.trim();
  if (!secret) return null;
  if (secret.length < 32 || secret.length > 512) throw new Error("KEERI_DELIVERY_WEBHOOK_SECRET must be 32 to 512 characters");
  if (!merchantScope) throw new Error("KEERI_DELIVERY_WEBHOOK_SECRET needs KEERI_MERCHANT_SCOPE");
  return { secret, merchantScope };
}

/**
 * `POST /api/integrations/keeri/order-events`. Register before JSON parsing and browser Origin enforcement: the route
 * is authenticated by Keeri's signature over the raw bytes, and no other route gains an exemption. It answers 200 only
 * once the event is stored (or was already), so Keeri retries anything the store did not keep.
 */
export function registerKeeriOrderEvents(
  app: Express,
  config: KeeriOrderEventsConfig,
  ingest: (rawBody: Buffer) => Promise<IngestOutcome>,
  now: () => Date = () => new Date(),
) {
  app.post(
    /^\/api\/integrations\/keeri\/order-events$/,
    (req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      if (!req.is("application/json") || (req.get("content-encoding") && req.get("content-encoding") !== "identity"))
        throw new HttpError(415, "UNSUPPORTED_CONTENT_TYPE", "Send uncompressed application/json.");
      next();
    },
    express.raw({ type: "application/json", limit: "64kb", inflate: false }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !verifyKeeriSignature(config.secret, req.body, req.get("x-keeri-signature"), now()))
        throw new HttpError(401, "INVALID_SIGNATURE", "Invalid signature.");
      res.status(200).json({ accepted: true, outcome: await ingest(req.body) });
    },
  );
}
