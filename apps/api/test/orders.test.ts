import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createRazorpayGateway } from "../src/payments/razorpay.js";
import { createOrderService, type ReservationPort } from "../src/orders/service.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
const token = "a".repeat(64);
const secret = "orders-test-webhook-secret";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let now = new Date("2026-10-25T12:00:00Z");
let posts: Array<Record<string, unknown>>;
let failCreation: boolean;
let paymentOverrides: Record<string, unknown>;
let reservationValid: boolean;
let reserveCalls: number;
let reservations: ReservationPort;

function gateway() {
  return createRazorpayGateway(
    { keyId: "rzp_test_fixture", keySecret: "api-test-secret", webhookSecret: secret },
    {
      fetch: async (path, options) => {
        if (options.method === "POST") {
          const body = JSON.parse(String(options.body)) as Record<string, unknown>;
          posts.push(body);
          if (failCreation) throw new Error("lost response after provider accepted request");
          return Response.json({
            entity: "order", id: `order_fixture${posts.length}`, ...body,
            status: "created", amount_paid: 0, amount_due: body.amount,
          });
        }
        const paymentId = path.split("/").at(-1);
        return Response.json({
          entity: "payment", id: paymentId, order_id: "order_fixture1",
          amount: 25190, currency: "INR", status: "captured", captured: true,
          amount_refunded: 0, refund_status: null, ...paymentOverrides,
        });
      },
    },
  );
}
function service(options: { reserve?: boolean; merchantScope?: string } = {}) {
  return createOrderService(db, {
    merchantScope: options.merchantScope ?? "maple:test",
    gateway: gateway(),
    reservations: options.reserve === false ? undefined : reservations,
    quote: () => ({ shippingPaise: 500, taxPaise: 0, policyId: "fixture-tax-inclusive-v1" }),
    now: () => new Date(now),
  });
}
function webhook(orderId = "order_fixture1", paymentId = "pay_fixture1", event = "payment.captured") {
  const body = Buffer.from(JSON.stringify({
    entity: "event", event,
    payload: { payment: { entity: { entity: "payment", id: paymentId, order_id: orderId } } },
  }));
  return { body, signature: createHmac("sha256", secret).update(body).digest("hex") };
}
async function awaiting() {
  const flow = service();
  const attempt = await flow.freezeCart(token, "checkout-request-1");
  return { flow, attempt: await flow.createProviderOrder(token, attempt.id) };
}
before(async () => { await db.$connect(); });
beforeEach(async () => {
  await db.orderOutbox.deleteMany();
  await db.paymentWebhookInbox.deleteMany();
  await db.checkoutAttempt.deleteMany();
  await db.cartItem.deleteMany({ where: { cartId: "orders-cart" } });
  await db.cart.deleteMany({ where: { id: "orders-cart" } });
  await db.product.deleteMany({ where: { id: "orders-chair" } });
  await db.product.create({ data: {
    id: "orders-chair", handle: "orders-chair", title: "Chair", description: "",
    category: "chairs", images: [], published: true, source: "test",
    sourceUpdatedAt: new Date("2026-10-25"),
    variants: { create: { id: "orders-variant", title: "Cream", sku: "CHAIR-CREAM",
      pricePaise: 12345, published: true, available: true, stockPolicy: "stocked" } },
  } });
  now = new Date("2026-10-25T12:00:00Z");
  await db.cart.create({ data: {
    id: "orders-cart", tokenHash: hash(token), expiresAt: new Date("2026-11-25"),
    items: { create: { variantId: "orders-variant", quantity: 2 } },
  } });
  posts = []; failCreation = false; paymentOverrides = {}; reservationValid = true; reserveCalls = 0;
  reservations = {
    reserve: async (request) => {
      reserveCalls++;
      return { ...request, reservationId: `reservation-${request.attemptId}`,
        verified: true, expiresAt: new Date(now.getTime() + 60_000) };
    },
    verify: async () => reservationValid,
  };
});
after(async () => { await db.$disconnect(); });

test("freezes database prices and server charges once across concurrent idempotent submissions and restarts", async () => {
  const attempts = await Promise.all([service().freezeCart(token, "checkout-request-1"), service().freezeCart(token, "checkout-request-1")]);
  assert.equal(attempts[0]!.id, attempts[1]!.id);
  assert.equal(attempts[0]!.amountPaise, 25190);
  await db.variant.update({ where: { id: "orders-variant" }, data: { pricePaise: 99999 } });
  await db.cartItem.update({ where: { cartId_variantId: { cartId: "orders-cart", variantId: "orders-variant" } }, data: { quantity: 1 } });
  const restarted = await service().freezeCart(token, "checkout-request-1");
  assert.equal(restarted.amountPaise, 25190);
  assert.deepEqual(restarted.snapshot, {
    version: 1, currency: "INR", policyId: "fixture-tax-inclusive-v1", shippingPaise: 500, taxPaise: 0, subtotalPaise: 24690,
    items: [{ variantId: "orders-variant", productId: "orders-chair", title: "Chair", variantTitle: "Cream", sku: "CHAIR-CREAM", quantity: 2, unitPricePaise: 12345, lineTotalPaise: 24690 }],
  });
  assert.equal(await db.checkoutAttempt.count(), 1);
});

test("an unknown catalogue price cannot become a frozen zero-priced checkout or provider order", async () => {
  await db.variant.update({where:{id:"orders-variant"},data:{pricePaise:null}});
  await assert.rejects(service().freezeCart(token,"unpriced-checkout"),{code:"INVALID_TOTAL"});
  assert.equal(await db.checkoutAttempt.count(),0);
  assert.equal(posts.length,0);
  assert.equal(reserveCalls,0);
});

test("unknown and expired guest credentials cannot freeze or access another checkout", async () => {
  await assert.rejects(service().freezeCart("b".repeat(64), "checkout-request-1"), { code: "CART_NOT_FOUND" });
  const frozen = await service().freezeCart(token, "checkout-request-1");
  await assert.rejects(service().createProviderOrder("b".repeat(64), frozen.id), { code: "CART_NOT_FOUND" });
  await db.cart.update({ where: { id: "orders-cart" }, data: { expiresAt: new Date("2020-01-01") } });
  await assert.rejects(service().createProviderOrder(token, frozen.id), { code: "CART_NOT_FOUND" });
  assert.equal(posts.length, 0);
});

test("unverified stock, retired products, empty carts and overflowing totals cannot create attempts", async () => {
  for (const data of [{ stockPolicy: "unverified" }, { stockPolicy: "made_to_order" }, { available: false }, { published: false }]) {
    await db.variant.update({ where: { id: "orders-variant" }, data });
    await assert.rejects(service().freezeCart(token, "checkout-request-1"), { code: "RESERVATION_NOT_ELIGIBLE" });
    await db.variant.update({ where: { id: "orders-variant" }, data: { stockPolicy: "stocked", available: true, published: true } });
  }
  await db.variant.update({ where: { id: "orders-variant" }, data: { pricePaise: 2147483647 } });
  await assert.rejects(service().freezeCart(token, "checkout-request-1"), { code: "INVALID_TOTAL" });
  await db.cartItem.deleteMany({ where: { cartId: "orders-cart" } });
  await assert.rejects(service().freezeCart(token, "checkout-request-1"), { code: "EMPTY_CART" });
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("missing reservation capability keeps the frozen attempt blocked and makes no provider request", async () => {
  const flow = service({ reserve: false });
  const frozen = await flow.freezeCart(token, "checkout-request-1");
  await assert.rejects(flow.createProviderOrder(token, frozen.id), { code: "RESERVATION_REQUIRED" });
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } })).state, "reservation_required");
  assert.equal(posts.length, 0);
});

test("reservation must bind the exact frozen snapshot before a provider order is requested", async () => {
  reservations.reserve = async (input) => ({ ...input, snapshotSha256: "wrong", verified: true, reservationId: "wrong-reservation", expiresAt: new Date(now.getTime() + 60_000) });
  const flow = service();
  const frozen = await flow.freezeCart(token, "checkout-request-1");
  await assert.rejects(flow.createProviderOrder(token, frozen.id), { code: "RESERVATION_INVALID" });
  assert.equal(posts.length, 0);
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } })).state, "reconciliation_required");
});

test("provider creation is single flight and uses frozen totals even after price changes", async () => {
  const flow = service();
  const frozen = await flow.freezeCart(token, "checkout-request-1");
  await db.variant.update({ where: { id: "orders-variant" }, data: { pricePaise: 15000 } });
  await Promise.allSettled([flow.createProviderOrder(token, frozen.id), service().createProviderOrder(token, frozen.id)]);
  const result = await service().createProviderOrder(token, frozen.id);
  assert.equal(result.state, "awaiting_payment");
  assert.equal(result.providerOrderId, "order_fixture1");
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.amount, 25190);
  assert.equal(reserveCalls, 1);
});

test("ambiguous provider creation is durable and cannot automatically create another order", async () => {
  failCreation = true;
  const flow = service();
  const frozen = await flow.freezeCart(token, "checkout-request-1");
  await assert.rejects(flow.createProviderOrder(token, frozen.id), { code: "PROVIDER_CREATION_UNCERTAIN" });
  failCreation = false;
  await assert.rejects(service().createProviderOrder(token, frozen.id), { code: "ATTEMPT_REQUIRES_RECONCILIATION" });
  const stored = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } });
  assert.equal(stored.state, "reconciliation_required");
  assert.equal(stored.receipt, frozen.receipt);
  assert.equal(posts.length, 1);
});

test("raw-body signatures precede durable inbox writes and replay is deduplicated by both header and digest", async () => {
  const flow = service();
  const { body, signature } = webhook();
  await assert.rejects(flow.ingestWebhook(Buffer.concat([body, Buffer.from(" ")]), signature, "event-one"), { code: "INVALID_SIGNATURE" });
  assert.equal(await db.paymentWebhookInbox.count(), 0);
  const a = await flow.ingestWebhook(body, signature, "event-one");
  const b = await flow.ingestWebhook(body, signature, "event-replay-with-new-header");
  assert.equal(a.id, b.id);
  const changed = webhook("order_other", "pay_other");
  await assert.rejects(flow.ingestWebhook(changed.body, changed.signature, "event-one"), { code: "WEBHOOK_ID_COLLISION" });
  assert.equal(await db.paymentWebhookInbox.count(), 1);
  assert.equal((await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: a.id } })).state, "pending");
});

test("captured payment commits order state, inbox completion and exactly one Keeri handoff atomically", async () => {
  const { flow, attempt } = await awaiting();
  const event = webhook();
  const inbox = await flow.ingestWebhook(event.body, event.signature, "event-one");
  await Promise.all([flow.processWebhook(inbox.id), service().processWebhook(inbox.id)]);
  const order = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(order.state, "captured");
  assert.equal(order.paymentId, "pay_fixture1");
  assert.equal((await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } })).state, "processed");
  assert.equal(await db.orderOutbox.count(), 1);
  const outbox = await db.orderOutbox.findFirstOrThrow();
  assert.equal(outbox.state, "pending");
  assert.equal(outbox.kind, "keeri.order.captured.v1");
  assert.equal((outbox.payload as { amountPaise: number }).amountPaise, 25190);
  const paid = webhook("order_fixture1", "pay_fixture1", "order.paid");
  const later = await flow.ingestWebhook(paid.body, paid.signature, "event-two");
  await flow.processWebhook(later.id);
  assert.equal(await db.orderOutbox.count(), 1);
});

test("failed, authorized and out-of-order events cannot downgrade an already captured order", async () => {
  const { flow, attempt } = await awaiting();
  for (const name of ["payment.captured", "payment.failed", "payment.authorized"]) {
    const event = webhook("order_fixture1", "pay_fixture1", name);
    const inbox = await flow.ingestWebhook(event.body, event.signature, name.replaceAll(".", "-"));
    await flow.processWebhook(inbox.id);
  }
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "captured");
  assert.equal(await db.orderOutbox.count(), 1);
});

test("mismatched, authorized and refunded fetched payments require reconciliation without a handoff", async () => {
  const { flow, attempt } = await awaiting();
  for (const [index, override] of [{ amount: 1 }, { order_id: "order_wrong" }, { status: "authorized", captured: false }, { amount_refunded: 1 }].entries()) {
    paymentOverrides = override;
    const event = webhook("order_fixture1", `pay_bad${index}`);
    const inbox = await flow.ingestWebhook(event.body, event.signature, `bad-${index}`);
    const result = await flow.processWebhook(inbox.id);
    assert.equal(result.state, "reconciliation_required");
  }
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "awaiting_payment");
  assert.equal(await db.orderOutbox.count(), 0);
});

test("expired or revoked reservations never turn a captured provider payment into fulfilment", async () => {
  const { flow, attempt } = await awaiting();
  reservationValid = false;
  const event = webhook();
  const inbox = await flow.ingestWebhook(event.body, event.signature, "event-revoked");
  assert.equal((await flow.processWebhook(inbox.id)).state, "reconciliation_required");
  assert.equal(await db.orderOutbox.count(), 0);
  reservationValid = true;
  now = new Date(now.getTime() + 120_000);
  assert.equal((await flow.processWebhook(inbox.id)).state, "reconciliation_required");
  assert.notEqual((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "captured");
});

test("unknown provider mappings can reconcile later while another merchant cannot process the inbox", async () => {
  const flow = service();
  const event = webhook();
  const inbox = await flow.ingestWebhook(event.body, event.signature, "event-early");
  assert.equal((await flow.processWebhook(inbox.id)).failureCode, "UNKNOWN_PROVIDER_ORDER");
  await assert.rejects(service({ merchantScope: "other:test" }).processWebhook(inbox.id), { code: "WEBHOOK_NOT_FOUND" });
  await awaiting();
  assert.equal((await flow.processWebhook(inbox.id)).state, "processed");
  assert.equal(await db.orderOutbox.count(), 1);
});

test("a second payment identity for an already captured order is quarantined without overwriting evidence", async () => {
  const { flow, attempt } = await awaiting();
  for (const paymentId of ["pay_fixture1", "pay_fixture2"]) {
    const event = webhook("order_fixture1", paymentId);
    const inbox = await flow.ingestWebhook(event.body, event.signature, paymentId);
    await flow.processWebhook(inbox.id);
  }
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).paymentId, "pay_fixture1");
  assert.equal(await db.orderOutbox.count(), 1);
  assert.equal((await db.paymentWebhookInbox.findFirstOrThrow({ where: { paymentId: "pay_fixture2" } })).failureCode, "PAYMENT_ID_CONFLICT");
});

test("outbox failure rolls back capture and inbox completion so the same durable event can retry", async () => {
  const { flow, attempt } = await awaiting();
  const event = webhook();
  const inbox = await flow.ingestWebhook(event.body, event.signature, "event-rollback");
  // Exercise a real SQL uniqueness failure after the capture update inside the transaction.
  const collision = await db.orderOutbox.create({ data: {
    attemptId: attempt.id, kind: "keeri.order.captured.v1", payload: { fixture: "force-insert-failure" },
  } });
  await flow.processWebhook(inbox.id);
  const rolledBack = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(rolledBack.state, "awaiting_payment");
  assert.equal(rolledBack.paymentId, null);
  assert.equal(rolledBack.capturedAt, null);
  assert.equal((await db.paymentWebhookInbox.findUniqueOrThrow({ where: { id: inbox.id } })).processedAt, null);
  await db.orderOutbox.delete({ where: { id: collision.id } });
  assert.equal((await service().processWebhook(inbox.id)).state, "processed");
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "captured");
  assert.equal(await db.orderOutbox.count(), 1);
});

test("cancelled attempts quarantine later capture without restoring the order", async () => {
  const { flow, attempt } = await awaiting();
  await db.checkoutAttempt.update({ where: { id: attempt.id }, data: { state: "cancelled" } });
  const event = webhook();
  const inbox = await flow.ingestWebhook(event.body, event.signature, "event-late-cancelled");
  assert.equal((await flow.processWebhook(inbox.id)).failureCode, "ORDER_STATE_REQUIRES_RECONCILIATION");
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "cancelled");
  assert.equal(await db.orderOutbox.count(), 0);
});

test("merchant scope isolates both guest attempts and authenticated order mappings", async () => {
  const { attempt } = await awaiting();
  const other = service({ merchantScope: "other:test" });
  await assert.rejects(other.createProviderOrder(token, attempt.id), { code: "ATTEMPT_NOT_FOUND" });
  await assert.rejects(other.freezeCart(token, "checkout-request-1"), { code: "ATTEMPT_NOT_FOUND" });
  const event = webhook();
  const inbox = await other.ingestWebhook(event.body, event.signature, "other-merchant-event");
  assert.equal((await other.processWebhook(inbox.id)).failureCode, "UNKNOWN_PROVIDER_ORDER");
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "awaiting_payment");
  assert.equal(await db.orderOutbox.count(), 0);
});

test("publication is rechecked before reservation even when the commercial snapshot already exists", async () => {
  const flow = service();
  const attempt = await flow.freezeCart(token, "checkout-request-1");
  await db.product.update({ where: { id: "orders-chair" }, data: { published: false } });
  await assert.rejects(flow.createProviderOrder(token, attempt.id), { code: "RESERVATION_NOT_ELIGIBLE" });
  assert.equal(reserveCalls, 0);
  assert.equal(posts.length, 0);
});
