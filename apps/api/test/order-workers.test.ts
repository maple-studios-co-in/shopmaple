import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createOrderWorkers, type KeeriDeliveryRequest } from "../src/orders/workers.js";
import { createOrderService } from "../src/orders/service.js";
import { createRazorpayGateway } from "../src/payments/razorpay.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw new Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
let now: Date;
const clock = () => new Date(now);
const payload = (id: string, merchantScope = "maple:test") => ({
  version: 1, attemptId: id, merchantScope, providerOrderId: `order_${id}`,
  paymentId: `pay_${id}`, amountPaise: 10000, currency: "INR", reservationId: `reservation_${id}`,
  snapshot: { version: 1, currency: "INR", policyId: "test", items: [], subtotalPaise: 10000, shippingPaise: 0, taxPaise: 0 },
});
async function captured(id: string, merchantScope = "maple:test") {
  const body = payload(id, merchantScope);
  await db.checkoutAttempt.create({ data: {
    id, cartId: `cart_${id}`, merchantScope, idempotencyKey: `key_${id}`, receipt: `receipt_${id}`,
    snapshot: body.snapshot, amountPaise: body.amountPaise, state: "captured", providerOrderId: body.providerOrderId,
    paymentId: body.paymentId, reservationId: body.reservationId, capturedAt: clock(),
  } });
  return db.orderOutbox.create({ data: { id: `outbox_${id}`, attemptId: id, kind: "keeri.order.captured.v1", payload: body } });
}
function ack(input: KeeriDeliveryRequest) {
  return { accepted: true as const, merchantScope: input.merchantScope, attemptId: input.attemptId,
    idempotencyKey: input.idempotencyKey, payloadSha256: input.payloadSha256, externalOrderId: `keeri_${input.attemptId}` };
}
function worker(deliverCapturedOrder?: (input: KeeriDeliveryRequest) => Promise<ReturnType<typeof ack>>, extra = {}) {
  return createOrderWorkers(db, { merchantScope: "maple:test", now: clock, leaseMs: 1000, retryDelayMs: 1000,
    maxAttempts: 3, ...(deliverCapturedOrder ? { keeri: { deliverCapturedOrder } } : {}), ...extra });
}
before(async () => { await db.$connect(); });
beforeEach(async () => {
  await db.orderOutbox.deleteMany(); await db.paymentWebhookInbox.deleteMany(); await db.checkoutAttempt.deleteMany();
  now = new Date("2030-01-01T00:00:00Z");
});
after(async () => { await db.$disconnect(); });

test("concurrent database claims deliver once and isolate another merchant", async () => {
  await captured("one"); await captured("other", "other:test");
  const delivered: string[] = [];
  const port = async (input: KeeriDeliveryRequest) => { delivered.push(input.attemptId); return ack(input); };
  await Promise.all([worker(port).runKeeriBatch(), worker(port).runKeeriBatch()]);
  assert.deepEqual(delivered, ["one"]);
  assert.equal((await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_one" } })).state, "delivered");
  assert.equal((await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_other" } })).state, "pending");
});

test("transient failures back off, retain idempotency across restarts and stop at the retry budget", async () => {
  await captured("retry");
  const keys: string[] = [];
  const port = async (input: KeeriDeliveryRequest) => { keys.push(input.idempotencyKey); throw new Error("secret-token and customer@example.test"); };
  await worker(port).runKeeriBatch(1);
  const scheduled = await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_retry" } });
  assert.equal(scheduled.nextAttemptAt.toISOString(), "2030-01-01T00:00:01.000Z");
  await worker(port).runKeeriBatch();
  assert.equal(keys.length, 1);
  now = new Date(now.getTime() + 1000); await worker(port).runKeeriBatch();
  now = new Date(now.getTime() + 1000); await worker(port).runKeeriBatch(); assert.equal(keys.length, 2);
  now = new Date(now.getTime() + 1000); await worker(port).runKeeriBatch();
  now = new Date(now.getTime() + 100000); await worker(port).runKeeriBatch();
  assert.equal(keys.length, 3); assert.equal(new Set(keys).size, 1);
  const row = await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_retry" } });
  assert.equal(row.state, "failed"); assert.equal(row.failureCode, "DELIVERY_UNAVAILABLE");
  assert.equal(row.deliveryAttempts, 3); assert.equal(row.leaseToken, null);
});

test("acknowledgements must bind merchant, attempt, idempotency and frozen payload", async () => {
  for (const [index, override] of [{ merchantScope: "other:test" }, { attemptId: "other" }, { idempotencyKey: "wrong" }, { payloadSha256: "0".repeat(64) }, { accepted: false }, { externalOrderId: "" }].entries()) {
    await captured(`ack${index}`);
    await worker(async input => ({ ...ack(input), ...override } as ReturnType<typeof ack>)).runKeeriBatch();
    const row = await db.orderOutbox.findUniqueOrThrow({ where: { id: `outbox_ack${index}` } });
    assert.equal(row.state, "failed"); assert.equal(row.failureCode, "ACKNOWLEDGEMENT_MISMATCH");
  }
});

test("an expired slow worker cannot overwrite a newer acknowledgement", async () => {
  await captured("slow");
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  let oldKey = ""; let newKey = "";
  const old = worker(async input => { oldKey = input.idempotencyKey; entered(); await wait; throw new Error("late failure"); }).runKeeriBatch();
  await started;
  now = new Date(now.getTime() + 1001);
  await worker(async input => { newKey = input.idempotencyKey; return ack(input); }).runKeeriBatch();
  release(); await old;
  const row = await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_slow" } });
  assert.equal(row.state, "delivered"); assert.equal(row.failureCode, null); assert.equal(row.deliveryAttempts, 2);
  assert.equal(oldKey, newKey);
});

test("a crashed claim is recoverable but a crash on the final attempt is quarantined", async () => {
  await captured("crash"); await captured("exhausted");
  await db.orderOutbox.updateMany({ data: { state: "processing", leaseToken: "dead-worker", leaseExpiresAt: new Date(now.getTime() - 1), deliveryAttempts: 1 } });
  await db.orderOutbox.update({ where: { id: "outbox_exhausted" }, data: { deliveryAttempts: 3 } });
  const delivered: string[] = [];
  await worker(async input => { delivered.push(input.attemptId); return ack(input); }).runKeeriBatch();
  assert.deepEqual(delivered, ["crash"]);
  const exhausted = await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_exhausted" } });
  assert.equal(exhausted.state, "failed"); assert.equal(exhausted.failureCode, "RETRY_BUDGET_EXHAUSTED");
});

test("batch bounds and missing delivery capability do not silently consume work", async () => {
  await captured("bound1"); await captured("bound2");
  await assert.rejects(worker().runKeeriBatch(), { code: "KEERI_DELIVERY_NOT_CONFIGURED" });
  const delivered: string[] = [];
  const runner = worker(async input => { delivered.push(input.attemptId); return ack(input); });
  for (const size of [0, 101, -1, 1.5]) await assert.rejects(runner.runKeeriBatch(size), { code: "INVALID_BATCH_SIZE" });
  assert.equal(await db.orderOutbox.count({ where: { state: "pending" } }), 2);
  await runner.runKeeriBatch(1); assert.equal(delivered.length, 1);
  assert.equal(await db.orderOutbox.count({ where: { state: "pending" } }), 1);
});

test("outbox delivery rejects altered money or cross-merchant payloads before invoking a port", async () => {
  await captured("tampered"); await captured("wrongmerchant");
  await db.orderOutbox.update({ where: { id: "outbox_tampered" }, data: { payload: { ...payload("tampered"), amountPaise: 1 } } });
  await db.orderOutbox.update({ where: { id: "outbox_wrongmerchant" }, data: { payload: payload("wrongmerchant", "other:test") } });
  let deliveries = 0;
  await worker(async input => { deliveries++; return ack(input); }).runKeeriBatch();
  assert.equal(deliveries, 0);
  assert.equal(await db.orderOutbox.count({ where: { state: "failed", failureCode: "OUTBOX_BINDING_MISMATCH" } }), 2);
});

async function paymentFixture(id: string) {
  await captured(id);
  await db.orderOutbox.deleteMany();
  await db.checkoutAttempt.update({ where: { id }, data: { state: "awaiting_payment", paymentId: null,
    capturedAt: null, reservationExpiresAt: new Date(now.getTime() + 60000) } });
  return db.paymentWebhookInbox.create({ data: { id: `inbox_${id}`, merchantScope: "maple:test", eventId: `event_${id}`,
    bodySha256: id.padEnd(64, "0"), eventType: "payment.captured", providerOrderId: `order_${id}`, paymentId: `pay_${id}` } });
}
function paymentService(id: string, fetchPayment?: () => Promise<Response>) {
  return createOrderService(db, { merchantScope: "maple:test", now: clock,
    quote: () => ({ shippingPaise: 0, taxPaise: 0, policyId: "test" }),
    reservations: { reserve: async () => { throw new Error("Worker must never create a reservation"); }, verify: async () => true },
    gateway: createRazorpayGateway({ keyId: "rzp_test_fixture", keySecret: "test-secret", webhookSecret: "test-webhook" }, {
      fetch: async (_url, options) => {
        assert.equal(options.method, "GET", "Workers must never create provider orders");
        return fetchPayment ? fetchPayment() : Response.json({ entity: "payment", id: `pay_${id}`, order_id: `order_${id}`,
          amount: 10000, currency: "INR", status: "captured", captured: true, amount_refunded: 0, refund_status: null });
      },
    }),
  });
}

test("payment workers use a single database claim and commit capture plus one handoff", async () => {
  const inbox = await paymentFixture("capture");
  const service = paymentService("capture");
  const options = { payments: service };
  await Promise.all([worker(undefined, options).runPaymentBatch(), worker(undefined, options).runPaymentBatch()]);
  assert.equal((await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } })).state, "processed");
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: "capture" } })).state, "captured");
  assert.equal(await db.orderOutbox.count(), 1);
  assert.equal((await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } })).deliveryAttempts, 1);
});

test("business reconciliation is terminal for automatic payment delivery", async () => {
  const inbox = await paymentFixture("cancelled");
  await db.checkoutAttempt.update({ where: { id: "cancelled" }, data: { state: "cancelled" } });
  const service = paymentService("cancelled");
  await worker(undefined, { payments: service }).runPaymentBatch();
  now = new Date(now.getTime() + 100000);
  await worker(undefined, { payments: service }).runPaymentBatch();
  const row = await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } });
  assert.equal(row.state, "reconciliation_required"); assert.equal(row.deliveryAttempts, 1);
  assert.equal(row.failureCode, "ORDER_STATE_REQUIRES_RECONCILIATION"); assert.equal(await db.orderOutbox.count(), 0);
});

test("payment operational failures are sanitized and bounded without changing business state", async () => {
  const inbox = await paymentFixture("databasefailure");
  const payments = { processWebhook: async () => { await db.$queryRaw`SELECT 1/0`; } };
  for (const seconds of [0, 1, 3, 7]) {
    now = new Date(new Date("2030-01-01T00:00:00Z").getTime() + seconds * 1000);
    await worker(undefined, { payments }).runPaymentBatch();
  }
  const row = await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } });
  assert.equal(row.state, "pending"); assert.equal(row.workerState, "failed"); assert.equal(row.deliveryAttempts, 3);
  assert.equal(row.workerFailureCode, "PAYMENT_PROCESSING_UNAVAILABLE");
});

test("stale and unleased payment calls cannot overwrite a newer claim's terminal state", async () => {
  const inbox = await paymentFixture("fenced");
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const oldService = paymentService("fenced", async () => { entered(); await wait; throw new Error("late provider failure"); });
  const old = worker(undefined, { payments: oldService }).runPaymentBatch();
  await started;
  await assert.rejects(paymentService("fenced").processWebhook(inbox.id), { code: "WORKER_LEASE_REQUIRED" });
  now = new Date(now.getTime() + 1001);
  await worker(undefined, { payments: paymentService("fenced") }).runPaymentBatch();
  release(); await old;
  const row = await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } });
  assert.equal(row.state, "processed"); assert.equal(row.failureCode, null); assert.equal(row.workerState, "complete");
  assert.equal(row.deliveryAttempts, 2); assert.equal(await db.orderOutbox.count(), 1);
});

test("a payment lease rejects direct callers and replaced lease identities", async () => {
  const inbox = await paymentFixture("lease");
  await db.paymentWebhookInbox.update({ where: { id: inbox.id }, data: { leaseToken: "current-worker", leaseExpiresAt: new Date(now.getTime() + 1000) } });
  await assert.rejects(paymentService("lease").processWebhook(inbox.id), { code: "WORKER_LEASE_REQUIRED" });
  await assert.rejects(paymentService("lease").processWebhook(inbox.id, { leaseToken: "old-worker" }), { code: "WORKER_LEASE_LOST" });
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: "lease" } })).state, "awaiting_payment");
  assert.equal(await db.orderOutbox.count(), 0);
});

test("a worker cannot reclaim an unexpired lease while delivery is still in progress", async () => {
  await captured("active");
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const first = worker(async input => { entered(); await wait; return ack(input); }).runKeeriBatch(1);
  await started;
  try {
    const second = await worker(async input => ack(input)).runKeeriBatch(1);
    assert.equal(second.claimed, 0);
  } finally { release(); await first; }
  assert.equal((await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_active" } })).deliveryAttempts, 1);
});

test("new work is immediately due independently of the database session timezone", async () => {
  await db.$executeRaw`INSERT INTO "OrderOutbox" ("id", "attemptId", "kind", "payload")
    VALUES ('outbox_clock', 'clock', 'keeri.order.captured.v1', '{}'::jsonb)`;
  const row = await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_clock" } });
  assert.ok(Math.abs(row.nextAttemptAt.getTime() - Date.now()) < 5000, "Due time must be UTC rather than the database's local wall clock");
});

test("lowering the retry budget quarantines a crash without reducing its attempt history", async () => {
  await captured("history");
  await db.orderOutbox.update({ where: { id: "outbox_history" }, data: {
    state: "processing", deliveryAttempts: 5, leaseToken: "crashed", leaseExpiresAt: new Date(now.getTime() - 1),
  } });
  await worker(async input => ack(input)).runKeeriBatch();
  const row = await db.orderOutbox.findUniqueOrThrow({ where: { id: "outbox_history" } });
  assert.equal(row.state, "failed"); assert.equal(row.deliveryAttempts, 5);
});
