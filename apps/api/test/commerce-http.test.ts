import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOrderService } from "../src/orders/service.js";
import { createRazorpayGateway } from "../src/payments/razorpay.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const config = { webOrigin: origin, catalogMode: "preview", secureCookies: false } as const;
const token = "c".repeat(64);
const cookie = `maple_cart=${token}`;
const secret = "http-test-webhook-secret";
let paymentCaptured = false;
const flow = createOrderService(db, {
  merchantScope: "maple:http-test",
  gateway: createRazorpayGateway({ keyId: "rzp_test_fixture", keySecret: "api-test-secret", webhookSecret: secret }, {
    fetch: async (path, options) => {
      if (options.method === "POST") {
        const body = JSON.parse(String(options.body));
        return Response.json({ entity: "order", id: "order_http1", ...body, status: "created", amount_paid: 0, amount_due: body.amount });
      }
      return Response.json({ entity: "payment", id: path.split("/").at(-1), order_id: "order_http1", amount: 25190,
        currency: "INR", status: paymentCaptured ? "captured" : "authorized", captured: paymentCaptured, amount_refunded: 0, refund_status: null });
    },
  }),
  reservations: {
    reserve: async input => ({ ...input, reservationId: `hold-${input.attemptId}`, verified: true, expiresAt: new Date(Date.now() + 60_000) }),
    verify: async () => true,
  },
  quote: () => ({ shippingPaise: 500, taxPaise: 0, policyId: "http-test-inclusive-v1" }),
});
const app = createApp(db, config, flow);
function freeze() {
  return request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie)
    .set("Idempotency-Key", "checkout-request-1").send({});
}
before(async () => { await db.$connect(); });
beforeEach(async () => {
  await db.orderOutbox.deleteMany();
  await db.paymentWebhookInbox.deleteMany();
  await db.checkoutAttempt.deleteMany();
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.product.deleteMany({ where: { id: "http-chair" } });
  await db.product.create({ data: {
    id: "http-chair", handle: "http-chair", title: "Chair", description: "", category: "chairs", images: [], published: true,
    source: "test", sourceUpdatedAt: new Date("2026-10-25"),
    variants: { create: { id: "http-chair-v", title: "Cream", sku: "PRIVATE-SKU", pricePaise: 12345, published: true, available: true, stockPolicy: "stocked" } },
  } });
  await db.cart.create({ data: { id: "http-cart", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000),
    items: { create: { variantId: "http-chair-v", quantity: 2 } } } });
  paymentCaptured = false;
});
after(async () => { await db.$disconnect(); });

test("HTTP freeze persists server totals, replays one attempt and exposes only the public receipt", async () => {
  const response = await freeze();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { id: response.body.id, state: "reservation_required", amountPaise: 25190, currency: "INR", paid: false, providerOrderId: null, payBy: null });
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.equal((await freeze()).body.id, response.body.id);
  assert.equal(await db.checkoutAttempt.count(), 1);
  assert.equal((await db.checkoutAttempt.findFirstOrThrow()).amountPaise, 25190);
});

test("checkout rejects browser-controlled money, merchant, credentials and invalid idempotency keys before persistence", async () => {
  for (const body of [{ amountPaise: 1 }, { merchantScope: "other" }, { cartToken: token }, { paid: true }, [], null]) {
    const res = await request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", "valid-key-1").send(body ?? "null");
    assert.equal(res.status, 400);
  }
  for (const key of [undefined, "", "short", "with spaces!", "x".repeat(129)]) {
    let req = request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie);
    if (key !== undefined) req = req.set("Idempotency-Key", key);
    assert.equal((await req.send({})).status, 400);
  }
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("freeze requires a current guest cookie and rejects duplicate cookie ambiguity", async () => {
  for (const credential of [undefined, "maple_cart=invalid", `maple_cart=${"d".repeat(64)}`, `${cookie}; maple_cart=${"d".repeat(64)}`]) {
    let req = request(app).post("/api/checkout").set("Origin", origin).set("Idempotency-Key", "checkout-request-1");
    if (credential) req = req.set("Cookie", credential);
    assert.equal((await req.send({})).status, 404);
  }
  await db.cart.update({ where: { id: "http-cart" }, data: { expiresAt: new Date(0) } });
  assert.equal((await freeze()).status, 404);
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("provider creation and status enforce ownership and never return internal snapshots", async () => {
  const frozen = await freeze();
  assert.equal(frozen.status, 200);
  const id = frozen.body.id;
  await db.cart.create({ data: { tokenHash: createHash("sha256").update("d".repeat(64)).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
  for (const credential of ["", `maple_cart=${"d".repeat(64)}`]) {
    assert.equal((await request(app).get(`/api/checkout/${id}`).set("Cookie", credential)).status, 404);
    assert.equal((await request(app).post(`/api/checkout/${id}/payment-order`).set("Origin", origin).set("Cookie", credential).send({})).status, 404);
  }
  assert.equal((await request(app).post(`/api/checkout/${id}/payment-order`).set("Origin", origin).set("Cookie", cookie).send({ amountPaise: 1 })).status, 400);
  const created = await request(app).post(`/api/checkout/${id}/payment-order`).set("Origin", origin).set("Cookie", cookie).send({});
  assert.equal(created.status, 200);
  const held = await db.checkoutAttempt.findUniqueOrThrow({ where: { id } });
  assert.deepEqual(created.body, { id, state: "awaiting_payment", amountPaise: 25190, currency: "INR", paid: false, providerOrderId: "order_http1",
    payBy: new Date(held.reservationExpiresAt!.getTime() - 120_000).toISOString() });
  const status = await request(app).get(`/api/checkout/${id}`).set("Cookie", cookie);
  assert.deepEqual(status.body, created.body);
  assert.match(String(status.headers["cache-control"]), /no-store/);
  assert.equal((await request(app).get("/api/checkout/not-a-uuid").set("Cookie", cookie)).status, 400);
});

function event() {
  const body = JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: { entity: "payment", id: "pay_http1", order_id: "order_http1" } } } });
  return { body, signature: createHmac("sha256", secret).update(body).digest("hex") };
}
function sendEvent(body: string, signature: string, id = "event-http-1") {
  return request(app).post("/api/webhooks/razorpay").set("Content-Type", "application/json")
    .set("x-razorpay-signature", signature).set("x-razorpay-event-id", id).send(body);
}

test("webhook authentication uses exact bytes before storage, accepts no Origin, and deduplicates retries", async () => {
  const payload = event();
  assert.equal((await sendEvent(payload.body + " ", payload.signature)).status, 401);
  assert.equal(await db.paymentWebhookInbox.count(), 0);
  const accepted = await sendEvent(payload.body, payload.signature);
  assert.equal(accepted.status, 202);
  assert.deepEqual(accepted.body, { accepted: true });
  assert.equal((await sendEvent(payload.body, payload.signature)).status, 202);
  assert.equal((await sendEvent(payload.body, payload.signature, "different-header")).status, 202);
  assert.equal(await db.paymentWebhookInbox.count(), 1);
  assert.equal((await db.paymentWebhookInbox.findFirstOrThrow()).state, "pending");
  assert.equal(await db.orderOutbox.count(), 0);
});

test("webhook receipt does not claim payment until captured evidence is independently verified", async () => {
  const frozen = await freeze();
  assert.equal(frozen.status, 200);
  await request(app).post(`/api/checkout/${frozen.body.id}/payment-order`).set("Origin", origin).set("Cookie", cookie).send({});
  const payload = event();
  assert.equal((await sendEvent(payload.body, payload.signature)).status, 202);
  const inbox = await db.paymentWebhookInbox.findFirstOrThrow();
  await flow.processWebhook(inbox.id);
  const statusUrl = `/api/checkout/${frozen.body.id}`;
  assert.equal((await request(app).get(statusUrl).set("Cookie", cookie)).body.paid, false);
  assert.equal(await db.orderOutbox.count(), 0);
  paymentCaptured = true;
  await flow.processWebhook(inbox.id);
  const status = await request(app).get(statusUrl).set("Cookie", cookie);
  assert.equal(status.body.paid, true);
  assert.equal(status.body.state, "captured");
  assert.equal(await db.orderOutbox.count(), 1);
});

test("webhook rejects missing headers, invalid signed JSON, unsupported content and oversized bodies", async () => {
  const payload = event();
  assert.equal((await request(app).post("/api/webhooks/razorpay").set("Content-Type", "application/json").send(payload.body)).status, 400);
  const invalid = "{broken";
  assert.equal((await sendEvent(invalid, createHmac("sha256", secret).update(invalid).digest("hex"))).status, 400);
  assert.equal((await request(app).post("/api/webhooks/razorpay").set("Content-Type", "text/plain").send(payload.body)).status, 415);
  assert.equal((await sendEvent("x".repeat(65_537), payload.signature)).status, 413);
  assert.equal(await db.paymentWebhookInbox.count(), 0);
});

test("only exact machine route bypasses Origin; checkout and ordinary writes retain CSRF protection", async () => {
  for (const path of ["/api/checkout", "/api/enquiries", "/api/webhooks/razorpay/extra", "/api/webhooks/razorpay/"]) {
    assert.equal((await request(app).post(path).send({})).status, 403);
    assert.equal((await request(app).post(path).set("Origin", "https://evil.example").send({})).status, 403);
  }
  assert.equal((await request(app).put("/api/cart/items/http-chair-v").send({ quantity: 1 })).status, 403);
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("uninjected application remains fail closed with no payment or webhook side effects", async () => {
  const preview = createApp(db, config);
  assert.equal((await request(preview).post("/api/checkout").set("Origin", origin).send({})).status, 503);
  assert.equal((await request(preview).get("/api/health")).body.checkoutEnabled, false);
  assert.equal((await request(preview).post("/api/webhooks/razorpay").send({})).status, 403);
  assert.equal(await db.checkoutAttempt.count(), 0);
  assert.equal(await db.paymentWebhookInbox.count(), 0);
});

test("secure checkout uses the host credential consistently through freeze, payment and status", async () => {
  const secureApp = createApp(db, { ...config, secureCookies: true }, flow);
  const hostCookie = `__Host-maple_cart=${token}`;
  const other = "d".repeat(64);
  await db.cart.create({ data: { tokenHash: createHash("sha256").update(other).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
  for (const credentials of [`maple_cart=${other}; ${hostCookie}`, `${hostCookie}; maple_cart=${other}; maple_cart=${other}`]) {
    const frozen = await request(secureApp).post("/api/checkout").set("Origin", origin).set("Cookie", credentials).set("Idempotency-Key", "secure-request-1").send({});
    assert.equal(frozen.status, 200);
    assert.equal(frozen.body.amountPaise, 25190);
    const created = await request(secureApp).post(`/api/checkout/${frozen.body.id}/payment-order`).set("Origin", origin).set("Cookie", credentials).send({});
    assert.equal(created.status, 200);
    assert.equal(created.body.providerOrderId, "order_http1");
    const status = await request(secureApp).get(`/api/checkout/${frozen.body.id}`).set("Cookie", credentials);
    assert.equal(status.status, 200);
    assert.equal(status.body.id, frozen.body.id);
    assert.equal(status.body.amountPaise, 25190);
  }
  assert.equal(await db.checkoutAttempt.count(), 1);
});

test("secure checkout rejects legacy-only and duplicated host credentials on every guest route", async () => {
  const secureApp = createApp(db, { ...config, secureCookies: true }, flow);
  // Create an actual attempt through the existing local flow so valid IDs do not mask credential failures.
  const frozen = await freeze();
  assert.equal(frozen.status, 200);
  const hostCookie = `__Host-maple_cart=${token}`;
  for (const credential of [cookie, `${hostCookie}; ${hostCookie}`, `${hostCookie}; __Host-maple_cart=${"d".repeat(64)}`, `__Host-maple_cart=invalid; ${cookie}`]) {
    const rejected = await request(secureApp).post("/api/checkout").set("Origin", origin).set("Cookie", credential).set("Idempotency-Key", "secure-request-2").send({});
    assert.equal(rejected.status, 404);
    assert.equal(rejected.body.code, "CHECKOUT_NOT_FOUND");
    assert.equal((await request(secureApp).get(`/api/checkout/${frozen.body.id}`).set("Cookie", credential)).status, 404);
    assert.equal((await request(secureApp).post(`/api/checkout/${frozen.body.id}/payment-order`).set("Origin", origin).set("Cookie", credential).send({})).status, 404);
  }
  const attempt = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.body.id } });
  assert.equal(attempt.providerOrderId, null);
  assert.equal(attempt.state, "reservation_required");
  assert.equal(await db.checkoutAttempt.count(), 1);
});

test("local checkout ignores host cookies and keeps legacy credentials authoritative", async () => {
  const other = "d".repeat(64);
  const mixed = `__Host-maple_cart=${other}; ${cookie}; __Host-maple_cart=${other}`;
  const frozen = await request(app).post("/api/checkout").set("Origin", origin).set("Cookie", mixed).set("Idempotency-Key", "local-request-1").send({});
  assert.equal(frozen.status, 200);
  assert.equal((await request(app).get(`/api/checkout/${frozen.body.id}`).set("Cookie", mixed)).status, 200);
  assert.equal((await request(app).post(`/api/checkout/${frozen.body.id}/payment-order`).set("Origin", origin).set("Cookie", mixed).send({})).status, 200);
  assert.equal((await request(app).get(`/api/checkout/${frozen.body.id}`).set("Cookie", `__Host-maple_cart=${token}`)).status, 404);
});
