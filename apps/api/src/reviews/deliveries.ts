import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { quoteSnapshotSchema, type QuoteSnapshot } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { newInvitationId, reviewLinkLifetimeMs } from "./links.js";

/** The Keeri order a confirmed checkout produced; the same row names the order to staff and buyers. */
export const confirmedOrderKind = "keeri.order.captured.v2";

const bindingsSchema = z.object({
  items: z.array(z.object({ localVariantId: z.string().min(1), localProductId: z.string().min(1), sourceVariantId: z.string().min(1) }).passthrough()),
}).passthrough();

export interface DeliveryInput {
  source: "staff" | "keeri";
  deliveredAt: Date;
  /** The staff member recording it; required for staff, absent for Keeri. */
  actorId?: string;
}

const notConfirmed = () => new HttpError(409, "ORDER_NOT_CONFIRMED", "Only a paid order Keeri has confirmed can be marked delivered.");
export const orderMissing = () => new HttpError(404, "ORDER_NOT_FOUND", "This order could not be found.");

/** A paid checkout Keeri confirmed, with the buyer's quote; throws for anything else. */
export async function confirmedOrder(tx: Prisma.TransactionClient, attemptId: string) {
  const attempt = await tx.checkoutAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw orderMissing();
  const outbox = await tx.orderOutbox.findUnique({ where: { attemptId_kind: { attemptId, kind: confirmedOrderKind } } });
  const quote = quoteSnapshotSchema.safeParse(attempt.snapshot);
  if (attempt.state !== "captured" || outbox?.state !== "delivered" || !outbox.externalOrderId || !quote.success) throw notConfirmed();
  return { attempt, quote: quote.data, reference: outbox.externalOrderId };
}

/** Each order line with the local product it was bought as. A line the catalogue no longer knows is skipped. */
async function orderLines(tx: Prisma.TransactionClient, quote: QuoteSnapshot, rawBindings: unknown) {
  const bindings = bindingsSchema.safeParse(rawBindings);
  const lines = [];
  for (const item of quote.items) {
    const bound = bindings.success ? bindings.data.items.find((b) => b.sourceVariantId === item.variantId) : undefined;
    const variantId = bound?.localVariantId
      ?? (await tx.variantSourceIdentity.findFirst({ where: { externalId: item.variantId }, select: { variantId: true } }))?.variantId;
    if (!variantId) continue;
    const variant = await tx.variant.findUnique({ where: { id: variantId }, select: { id: true, product: { select: { id: true, handle: true } } } });
    if (!variant || (bound && bound.localProductId !== variant.product.id)) continue;
    lines.push({ variantId: variant.id, productId: variant.product.id, productHandle: variant.product.handle, productTitle: item.title, variantTitle: item.variantTitle });
  }
  return lines;
}

/**
 * Record that a confirmed order reached the buyer and invite one review per line. Idempotent:
 * the first record wins (its time and source stay), and a line is invited at most once, so a
 * repeated staff click or a redelivered Keeri event changes nothing and sends no second email.
 */
export async function recordDelivery(tx: Prisma.TransactionClient, attemptId: string, input: DeliveryInput) {
  await tx.$queryRaw`SELECT "id" FROM "CheckoutAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  const { attempt, quote } = await confirmedOrder(tx, attemptId);
  const existing = await tx.orderDelivery.findUnique({ where: { attemptId } });
  if (existing) return existing;
  const delivery = await tx.orderDelivery.create({
    data: { attemptId, deliveredAt: input.deliveredAt, source: input.source, recordedById: input.source === "staff" ? input.actorId : null },
  });
  // The window starts when the buyer is told, however late the delivery was reported.
  const expiresAt = new Date(Date.now() + reviewLinkLifetimeMs);
  const lines = await orderLines(tx, quote, attempt.catalogueBindings);
  await tx.productReviewInvitation.createMany({
    data: lines.map((line) => ({ id: newInvitationId(), attemptId, ...line, expiresAt })),
    skipDuplicates: true,
  });
  return delivery;
}
