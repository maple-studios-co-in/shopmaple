import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type OrderOutbox, type PaymentWebhookInbox } from "@prisma/client";

export interface KeeriDeliveryRequest {
  merchantScope: string;
  attemptId: string;
  /** Stable across retries and process restarts; the receiving system must deduplicate it. */
  idempotencyKey: string;
  payloadSha256: string;
  payload: Prisma.JsonValue;
}
export interface KeeriDeliveryAcknowledgement {
  accepted: true;
  merchantScope: string;
  attemptId: string;
  idempotencyKey: string;
  payloadSha256: string;
  externalOrderId: string;
}
export interface KeeriOrderDeliveryPort {
  /** No production adapter exists: this is an explicit capability, not an inferred Keeri endpoint.
   * Must atomically deduplicate idempotencyKey, reject changed payloads for that key, and
   * return the original acknowledgement on replay. Network adapters need a bounded timeout. */
  deliverCapturedOrder(input: KeeriDeliveryRequest): Promise<KeeriDeliveryAcknowledgement>;
}
export interface PaymentProcessingPort {
  /** Must fence ALL business writes with this live lease (createOrderService does so). */
  processWebhook(inboxId: string, claim: { leaseToken: string }): Promise<unknown>;
}
interface Options {
  merchantScope: string;
  payments?: PaymentProcessingPort;
  keeri?: KeeriOrderDeliveryPort;
  now?: () => Date;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}
export class OrderWorkerError extends Error {
  constructor(public readonly code: string) { super(`Order worker: ${code}`); this.name = "OrderWorkerError"; }
}
function canonical(value: Prisma.JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}
type Claimed<T> = T & { previousAttempts: number };
interface BatchResult { claimed: number; complete: number; retried: number; failed: number; lostLease: number }

/** Explicit one-batch invocation only. No timer, environment configuration, or production network adapter. */
export function createOrderWorkers(db: PrismaClient, options: Options) {
  const { merchantScope } = options;
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  const maxAttempts = options.maxAttempts ?? 5;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(merchantScope) ||
      !Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300_000 ||
      !Number.isInteger(retryDelayMs) || retryDelayMs < 1000 || retryDelayMs > 3_600_000 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
    throw new OrderWorkerError("INVALID_WORKER_CONFIGURATION");
  function batchSize(size: number) {
    if (!Number.isInteger(size) || size < 1 || size > 100) throw new OrderWorkerError("INVALID_BATCH_SIZE");
  }
  const retryAt = (attempt: number) => new Date(now().getTime() + Math.min(3_600_000, retryDelayMs * 2 ** (attempt - 1)));
  const result = (): BatchResult => ({ claimed: 0, complete: 0, retried: 0, failed: 0, lostLease: 0 });

  // Prisma DateTime columns store UTC without a time zone. Explicit string casts avoid
  // session timezone conversion of raw timestamptz parameters during comparison/assignment.
  async function claimOutbox(): Promise<Claimed<OrderOutbox> | undefined> {
    const at = now(); const token = randomUUID(); const expires = new Date(at.getTime() + leaseMs);
    const rows = await db.$queryRaw<Array<Claimed<OrderOutbox>>>`
      WITH candidate AS (
        SELECT o."id", o."deliveryAttempts" AS "previousAttempts" FROM "OrderOutbox" o
        JOIN "CheckoutAttempt" a ON a."id" = o."attemptId"
        WHERE a."merchantScope" = ${merchantScope} AND o."state" IN ('pending', 'processing')
          AND o."nextAttemptAt" <= ${at.toISOString()}::timestamp AND (o."leaseExpiresAt" IS NULL OR o."leaseExpiresAt" <= ${at.toISOString()}::timestamp)
        ORDER BY o."createdAt", o."id" LIMIT 1 FOR UPDATE OF o SKIP LOCKED
      ) UPDATE "OrderOutbox" o SET "state" = 'processing', "leaseToken" = ${token}, "leaseExpiresAt" = ${expires.toISOString()}::timestamp,
        "deliveryAttempts" = CASE WHEN o."deliveryAttempts" < ${maxAttempts} THEN o."deliveryAttempts" + 1 ELSE o."deliveryAttempts" END
      FROM candidate WHERE o."id" = candidate."id" RETURNING o.*, candidate."previousAttempts"`;
    return rows[0];
  }
  async function claimPayment(): Promise<Claimed<PaymentWebhookInbox> | undefined> {
    const at = now(); const token = randomUUID(); const expires = new Date(at.getTime() + leaseMs);
    const rows = await db.$queryRaw<Array<Claimed<PaymentWebhookInbox>>>`
      WITH candidate AS (
        SELECT "id", "deliveryAttempts" AS "previousAttempts" FROM "PaymentWebhookInbox"
        WHERE "merchantScope" = ${merchantScope} AND "workerState" IN ('pending', 'processing')
          AND ("state" = 'pending' OR "workerState" = 'processing')
          AND "nextAttemptAt" <= ${at.toISOString()}::timestamp AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${at.toISOString()}::timestamp)
        ORDER BY "receivedAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE "PaymentWebhookInbox" p SET "workerState" = 'processing', "leaseToken" = ${token}, "leaseExpiresAt" = ${expires.toISOString()}::timestamp,
        "deliveryAttempts" = CASE WHEN p."deliveryAttempts" < ${maxAttempts} THEN p."deliveryAttempts" + 1 ELSE p."deliveryAttempts" END
      FROM candidate WHERE p."id" = candidate."id" RETURNING p.*, candidate."previousAttempts"`;
    return rows[0];
  }
  async function finishOutbox(row: OrderOutbox, data: Prisma.OrderOutboxUpdateManyMutationInput) {
    return (await db.orderOutbox.updateMany({
      where: { id: row.id, state: "processing", leaseToken: row.leaseToken, leaseExpiresAt: { gt: now() } },
      data: { ...data, leaseToken: null, leaseExpiresAt: null },
    })).count === 1;
  }
  async function finishPayment(row: PaymentWebhookInbox, data: Prisma.PaymentWebhookInboxUpdateManyMutationInput) {
    return (await db.paymentWebhookInbox.updateMany({
      where: { id: row.id, merchantScope, workerState: "processing", leaseToken: row.leaseToken, leaseExpiresAt: { gt: now() } },
      data: { ...data, leaseToken: null, leaseExpiresAt: null },
    })).count === 1;
  }
  function record(stats: BatchResult, applied: boolean, outcome: "complete" | "retried" | "failed") {
    stats[applied ? outcome : "lostLease"]++;
  }
  async function requestFor(row: OrderOutbox): Promise<KeeriDeliveryRequest> {
    const attempt = await db.checkoutAttempt.findFirst({ where: { id: row.attemptId, merchantScope, state: "captured" } });
    if (!attempt || row.kind !== "keeri.order.captured.v1" || !attempt.paymentId || !attempt.providerOrderId || !attempt.reservationId)
      throw new OrderWorkerError("OUTBOX_BINDING_MISMATCH");
    const expected = { version: 1, attemptId: attempt.id, merchantScope, providerOrderId: attempt.providerOrderId,
      paymentId: attempt.paymentId, amountPaise: attempt.amountPaise, currency: attempt.currency,
      reservationId: attempt.reservationId, snapshot: attempt.snapshot };
    const serialized = canonical(row.payload);
    if (serialized !== canonical(expected)) throw new OrderWorkerError("OUTBOX_BINDING_MISMATCH");
    return { merchantScope, attemptId: attempt.id, idempotencyKey: `shopmaple:keeri:${merchantScope}:${row.id}`,
      payloadSha256: createHash("sha256").update(serialized).digest("hex"), payload: structuredClone(row.payload) };
  }
  async function runKeeriBatch(size = 10) {
    batchSize(size);
    const port = options.keeri;
    if (!port) throw new OrderWorkerError("KEERI_DELIVERY_NOT_CONFIGURED");
    const stats = result();
    for (let index = 0; index < size; index++) {
      const row = await claimOutbox(); if (!row) break; stats.claimed++;
      if (row.previousAttempts >= maxAttempts) {
        record(stats, await finishOutbox(row, { state: "failed", failureCode: "RETRY_BUDGET_EXHAUSTED" }), "failed"); continue;
      }
      try {
        const request = await requestFor(row);
        const acknowledgement = await port.deliverCapturedOrder(request);
        if (!acknowledgement || acknowledgement.accepted !== true || acknowledgement.merchantScope !== merchantScope ||
            acknowledgement.attemptId !== request.attemptId || acknowledgement.idempotencyKey !== request.idempotencyKey ||
            acknowledgement.payloadSha256 !== request.payloadSha256 || typeof acknowledgement.externalOrderId !== "string" ||
            !/^[A-Za-z0-9:_-]{1,200}$/.test(acknowledgement.externalOrderId)) throw new OrderWorkerError("ACKNOWLEDGEMENT_MISMATCH");
        record(stats, await finishOutbox(row, { state: "delivered", deliveredAt: now(), externalOrderId: acknowledgement.externalOrderId, failureCode: null }), "complete");
      } catch (error) {
        // No raw exception text, response bodies, customer data, or credentials are persisted.
        const permanent = error instanceof OrderWorkerError && ["OUTBOX_BINDING_MISMATCH", "ACKNOWLEDGEMENT_MISMATCH"].includes(error.code);
        const exhausted = permanent || row.deliveryAttempts >= maxAttempts;
        record(stats, await finishOutbox(row, { state: exhausted ? "failed" : "pending",
          failureCode: permanent ? (error as OrderWorkerError).code : "DELIVERY_UNAVAILABLE", nextAttemptAt: retryAt(row.deliveryAttempts) }), exhausted ? "failed" : "retried");
      }
    }
    return stats;
  }
  async function runPaymentBatch(size = 10) {
    batchSize(size);
    const port = options.payments;
    if (!port) throw new OrderWorkerError("PAYMENT_PROCESSING_NOT_CONFIGURED");
    const stats = result();
    for (let index = 0; index < size; index++) {
      const row = await claimPayment(); if (!row) break; stats.claimed++;
      if (["processed", "ignored", "reconciliation_required"].includes(row.state)) {
        record(stats, await finishPayment(row, { workerState: "complete", workerFailureCode: null }), "complete"); continue;
      }
      if (row.previousAttempts >= maxAttempts) {
        record(stats, await finishPayment(row, { workerState: "failed", workerFailureCode: "RETRY_BUDGET_EXHAUSTED" }), "failed"); continue;
      }
      try {
        await port.processWebhook(row.id, { leaseToken: row.leaseToken! });
        const current = await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: row.id } });
        if (!["processed", "ignored", "reconciliation_required"].includes(current.state)) throw new OrderWorkerError("PAYMENT_PROCESSING_INCOMPLETE");
        record(stats, await finishPayment(row, { workerState: "complete", workerFailureCode: null }), "complete");
      } catch {
        const exhausted = row.deliveryAttempts >= maxAttempts;
        record(stats, await finishPayment(row, { workerState: exhausted ? "failed" : "pending",
          workerFailureCode: "PAYMENT_PROCESSING_UNAVAILABLE", nextAttemptAt: retryAt(row.deliveryAttempts) }), exhausted ? "failed" : "retried");
      }
    }
    return stats;
  }
  return { runKeeriBatch, runPaymentBatch };
}
