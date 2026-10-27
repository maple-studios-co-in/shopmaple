import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { composeCommerce, loadCommerceConfig } from "../src/commerce-composition.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const appConfig = { webOrigin: origin, catalogMode: "preview", secureCookies: false } as const;
const token = "f".repeat(64);
const cookie = `maple_cart=${token}`;
const webhookSecret = "composition-webhook-secret";
const keeriToken = "k".repeat(40);
const fullEnv = {
  CHECKOUT_ENABLED: "true",
  KEERI_ORIGIN: "https://keeri.example.test",
  KEERI_COMMERCE_TOKEN: keeriToken,
  KEERI_TENANT_ID: "maple",
  KEERI_MERCHANT_SCOPE: "maple-store",
  RAZORPAY_KEY_ID: "rzp_test_composition",
  RAZORPAY_KEY_SECRET: "composition-key-secret",
  RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  CHECKOUT_DELIVERY_METHODS: JSON.stringify([{ id: "standard", label: "Standard delivery" }]),
};
const address = { line1: "1 Test Street", line2: "", city: "Mumbai", stateCode: "27", pincode: "400001", country: "IN" };
const input = {
  customer: { name: "Test Buyer", email: "buyer@example.test", phone: "9876543210" },
  billingAddress: address,
  shippingAddress: address,
  deliveryMethodId: "standard",
};
function canonical(x: any): string {
  return Array.isArray(x)
    ? `[${x.map(canonical).join(",")}]`
    : x !== null && typeof x === "object"
      ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`
      : JSON.stringify(x);
}
// Fixed clocks sit in the future: worker claims compare against database-generated timestamps.
let clock = new Date("2030-01-01T10:00:00Z");
/** Fake Keeri + Razorpay transports, routed by host. Behaviour is adjustable per test. */
const fake = {
  quoteExpiresAt: "2030-01-01T10:15:00.000Z",
  quoteStatus: 200,
  reservationStatus: 200,
  releaseStatus: 200,
  razorpayOrderStatus: 200,
  paymentCaptured: true,
  keeriCalls: [] as string[],
  razorpayCalls: [] as string[],
};
async function transport(target: string | URL, init: RequestInit): Promise<Response> {
  const u = new URL(String(target));
  if (u.host === "keeri.example.test") {
    fake.keeriCalls.push(u.pathname);
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${keeriToken}`);
    const body = JSON.parse(String(init.body));
    switch (u.pathname) {
      case "/api/storefront/quotes": {
        if (fake.quoteStatus !== 200) return new Response("policy detail", { status: fake.quoteStatus });
        const snapshot = {
          version: 2, currency: "INR", policyId: "reviewed-composition-v1", quoteId: "quote_composition",
          expiresAt: fake.quoteExpiresAt, customer: body.customer, billingAddress: body.billingAddress,
          shippingAddress: body.shippingAddress, deliveryMethodId: body.deliveryMethodId, gstMode: "excluded",
          items: body.items.map((item: { variantId: string; quantity: number }) => ({
            variantId: item.variantId, productId: "keeri:maple:comp-chair", title: "Composition Chair", variantTitle: "Oak",
            sku: "COMP-CHAIR", quantity: item.quantity, unitPricePaise: 150000, lineTotalPaise: 150000 * item.quantity,
            hsn: "9401", taxRateBps: 1800,
          })),
          subtotalPaise: 0, shippingPaise: 25000, taxPaise: 0, totalPaise: 0,
        };
        snapshot.subtotalPaise = snapshot.items.reduce((n: number, i: { lineTotalPaise: number }) => n + i.lineTotalPaise, 0);
        snapshot.taxPaise = Math.round((snapshot.subtotalPaise + snapshot.shippingPaise) * 0.18);
        snapshot.totalPaise = snapshot.subtotalPaise + snapshot.shippingPaise + snapshot.taxPaise;
        return Response.json({ version: 2, quoteId: snapshot.quoteId, expiresAt: snapshot.expiresAt,
          snapshotSha256: createHash("sha256").update(canonical(snapshot)).digest("hex"), snapshot });
      }
      case "/api/storefront/reservations":
        if (fake.reservationStatus !== 200) return new Response("stock problem", { status: fake.reservationStatus });
        return Response.json({ attemptId: body.attemptId, snapshotSha256: body.snapshotSha256,
          reservationId: `hold-${body.attemptId}`, verified: true, expiresAt: "2030-01-01T10:30:00.000Z" });
      case "/api/storefront/reservations/verify":
        return Response.json({ verified: true });
      case "/api/storefront/reservations/release":
        if (fake.releaseStatus !== 200) return new Response("release detail", { status: fake.releaseStatus });
        assert.deepEqual(Object.keys(body).sort(), ["attemptId", "reservationId", "snapshotSha256"]);
        return Response.json({ released: true });
      case "/api/storefront/orders":
        return Response.json({ accepted: true, merchantScope: body.merchantScope, attemptId: body.attemptId,
          idempotencyKey: body.idempotencyKey, payloadSha256: body.payloadSha256, externalOrderId: "SO-1001" });
    }
    return new Response("unexpected", { status: 404 });
  }
  if (u.host === "api.razorpay.com") {
    fake.razorpayCalls.push(`${init.method} ${u.pathname}`);
    if (init.method === "POST") {
      if (fake.razorpayOrderStatus !== 200) return new Response("gateway detail", { status: fake.razorpayOrderStatus });
      const body = JSON.parse(String(init.body));
      return Response.json({ entity: "order", id: "order_comp1", ...body, status: "created", amount_paid: 0, amount_due: body.amount });
    }
    return Response.json({ entity: "payment", id: u.pathname.split("/").at(-1), order_id: "order_comp1", amount: 383500,
      currency: "INR", status: fake.paymentCaptured ? "captured" : "authorized", captured: fake.paymentCaptured,
      amount_refunded: 0, refund_status: null });
  }
  throw new Error("No live network allowed in tests");
}
function compose() {
  const config = loadCommerceConfig(fullEnv);
  assert.ok(config);
  return composeCommerce(db, config, { fetch: transport, now: () => clock });
}
function checkoutApp() {
  const composed = compose();
  return { ...composed, app: createApp(db, { ...appConfig, checkout: composed.checkout }, composed.commerce) };
}
function freeze(app: ReturnType<typeof createApp>, key = "composition-request-1", body: unknown = input) {
  return request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", key).send(body as object);
}
function release(app: ReturnType<typeof createApp>, id: string) {
  return request(app).post(`/api/checkout/${id}/release`).set("Origin", origin).set("Cookie", cookie).send({});
}
const cartOf = (app: ReturnType<typeof createApp>) => request(app).get("/api/cart").set("Cookie", cookie);
function paymentOrder(app: ReturnType<typeof createApp>, id: string) {
  return request(app).post(`/api/checkout/${id}/payment-order`).set("Origin", origin).set("Cookie", cookie).send({});
}
function status(app: ReturnType<typeof createApp>, id: string) {
  return request(app).get(`/api/checkout/${id}`).set("Cookie", cookie);
}
function webhook(app: ReturnType<typeof createApp>, secret = webhookSecret, paymentId = "pay_comp1") {
  const body = JSON.stringify({ entity: "event", event: "payment.captured",
    payload: { payment: { entity: { entity: "payment", id: paymentId, order_id: "order_comp1" } } } });
  return request(app).post("/api/webhooks/razorpay").set("Content-Type", "application/json")
    .set("x-razorpay-signature", createHmac("sha256", secret).update(body).digest("hex"))
    .set("x-razorpay-event-id", `event-${paymentId}`).send(body);
}

before(async () => { await db.$connect(); });
beforeEach(async () => {
  clock = new Date("2030-01-01T10:00:00Z");
  Object.assign(fake, { quoteExpiresAt: "2030-01-01T10:15:00.000Z", quoteStatus: 200, reservationStatus: 200, releaseStatus: 200,
    razorpayOrderStatus: 200, paymentCaptured: true, keeriCalls: [], razorpayCalls: [] });
  await db.orderOutbox.deleteMany();
  await db.paymentWebhookInbox.deleteMany();
  await db.checkoutAttempt.deleteMany();
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.product.deleteMany({ where: { handle: "composition-chair" } });
  await db.product.create({ data: {
    id: "keeri:maple:comp-chair", handle: "composition-chair", title: "Composition Chair", description: "", category: "chairs",
    images: [], published: true, source: "keeri:maple", sourceUpdatedAt: clock,
    identities: { create: { source: "keeri", externalId: "keeri:maple:comp-chair" } },
    variants: { create: { id: "keeri:maple:comp-chair-v", title: "Oak", pricePaise: 140000, published: true, available: true, stockPolicy: "stocked",
      identities: { create: { source: "keeri", externalId: "keeri:maple:comp-chair-v" } } } },
  } });
  await db.cart.create({ data: { id: "composition-cart", tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date("2031-01-01"), items: { create: { variantId: "keeri:maple:comp-chair-v", quantity: 2 } } } });
});
after(async () => { await db.$disconnect(); });

test("checkout stays disabled unless the explicit flag and every commerce value are present", () => {
  assert.equal(loadCommerceConfig({}), null);
  const { CHECKOUT_ENABLED: _flag, ...withoutFlag } = fullEnv;
  assert.equal(loadCommerceConfig(withoutFlag), null, "credentials alone never enable checkout");
  assert.equal(loadCommerceConfig({ ...fullEnv, CHECKOUT_ENABLED: "false" }), null);
  for (const key of Object.keys(fullEnv).filter((k) => k !== "CHECKOUT_ENABLED")) {
    const { [key]: _missing, ...partial } = fullEnv as Record<string, string>;
    assert.throws(() => loadCommerceConfig(partial), (error: Error) => {
      assert.match(error.message, new RegExp(key));
      assert.doesNotMatch(error.message, /composition-key-secret|composition-webhook-secret|kkkk/);
      return true;
    }, `${key} absent must fail loudly when checkout is explicitly enabled`);
  }
  assert.throws(() => loadCommerceConfig({ ...fullEnv, CHECKOUT_DELIVERY_METHODS: "[]" }));
  assert.throws(() => loadCommerceConfig({ ...fullEnv, CHECKOUT_DELIVERY_METHODS: "not json" }));
  assert.throws(() => loadCommerceConfig({ ...fullEnv, KEERI_ORIGIN: "http://keeri.example.test" }));
  const config = loadCommerceConfig(fullEnv);
  assert.deepEqual(config?.deliveryMethods, [{ id: "standard", label: "Standard delivery" }]);
  assert.equal(config?.keeri.merchantScope, "maple-store");
});

test("an application without commerce behaves exactly as the preview does today", async () => {
  const preview = createApp(db, appConfig);
  const health = await request(preview).get("/api/health");
  assert.deepEqual(health.body, { status: "ok", catalogMode: "preview", checkoutEnabled: false });
  const refused = await request(preview).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", "x".repeat(10)).send(input);
  assert.equal(refused.status, 503);
  assert.equal(refused.body.code, "CHECKOUT_NOT_AVAILABLE");
  assert.equal((await request(preview).get("/api/checkout/options")).status, 404);
  assert.equal((await request(preview).post("/api/webhooks/razorpay").send({})).status, 403);
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("composed checkout reports itself, publishes only public options, and completes quote, hold, payment and Keeri order", async () => {
  const { app, runWorkers } = checkoutApp();
  const health = await request(app).get("/api/health");
  assert.deepEqual(health.body, { status: "ok", catalogMode: "preview", checkoutEnabled: true });
  const options = await request(app).get("/api/checkout/options");
  assert.equal(options.status, 200);
  assert.deepEqual(options.body, { deliveryMethods: [{ id: "standard", label: "Standard delivery" }], paymentKeyId: "rzp_test_composition" });
  assert.match(String(options.headers["cache-control"]), /no-store/);

  const frozen = await freeze(app);
  assert.equal(frozen.status, 200, JSON.stringify(frozen.body));
  assert.equal(frozen.body.state, "reservation_required");
  assert.equal(frozen.body.amountPaise, 383500, "2 x 1,500.00 + 250.00 delivery = 3,250.00, plus 18% GST 585.00");
  assert.deepEqual(frozen.body.quote.items.map((i: any) => [i.title, i.quantity, i.lineTotalPaise]), [["Composition Chair", 2, 300000]]);
  assert.equal(frozen.body.quote.shippingPaise, 25000);
  assert.equal(frozen.body.quote.taxPaise, 58500);
  assert.equal(frozen.body.quote.expiresAt, "2030-01-01T10:15:00.000Z");
  assert.equal(frozen.body.quote.customer, undefined);
  assert.deepEqual(fake.keeriCalls, ["/api/storefront/quotes"]);
  assert.equal((await freeze(app)).body.id, frozen.body.id, "replay returns the same attempt without a second quote");
  assert.equal(fake.keeriCalls.length, 1);

  const created = await paymentOrder(app, frozen.body.id);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.state, "awaiting_payment");
  assert.equal(created.body.providerOrderId, "order_comp1");
  assert.deepEqual(fake.keeriCalls.slice(1), ["/api/storefront/reservations"]);
  assert.deepEqual(fake.razorpayCalls, ["POST /v1/orders"]);

  assert.equal((await webhook(app)).status, 202);
  assert.equal((await status(app, frozen.body.id)).body.paid, false, "receipt alone never claims payment");
  const first = await runWorkers();
  assert.equal(first.payments.complete, 1);
  assert.deepEqual(fake.razorpayCalls.at(-1), "GET /v1/payments/pay_comp1");
  const paid = await status(app, frozen.body.id);
  assert.equal(paid.body.paid, true);
  assert.equal(paid.body.state, "captured");
  if (paid.body.fulfillmentStatus !== "confirmed") await runWorkers();
  const confirmed = await status(app, frozen.body.id);
  assert.equal(confirmed.body.fulfillmentStatus, "confirmed");
  assert.equal(confirmed.body.orderReference, "SO-1001");
  assert.ok(fake.keeriCalls.includes("/api/storefront/orders"));
  assert.doesNotMatch(JSON.stringify(confirmed.body), /buyer@example|400001|Test Buyer/);
  const consumed = await cartOf(app);
  assert.deepEqual(consumed.body.items, [], "paid goods leave the cart so a refresh cannot quote them again");
  assert.equal(consumed.body.checkoutEnabled, true, "a live cart advertises checkout");
  const again = await freeze(app, "composition-request-after-capture");
  assert.equal(again.status, 409, "an emptied cart cannot start a second order");
  assert.equal(await db.checkoutAttempt.count(), 1);
});

test("the cart reports live checkout only when the service is composed", async () => {
  assert.equal((await cartOf(createApp(db, appConfig))).body.checkoutEnabled, false);
  assert.equal((await cartOf(checkoutApp().app)).body.checkoutEnabled, true);
});

test("a cart with a payable attempt cannot be quoted again until that attempt is released", async () => {
  const { app } = checkoutApp();
  const frozen = await freeze(app);
  assert.equal((await freeze(app, "composition-request-2")).status, 200, "unpaid quotes may be replaced freely");
  assert.equal((await paymentOrder(app, frozen.body.id)).status, 200);
  const blocked = await freeze(app, "composition-request-3");
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "CHECKOUT_IN_PROGRESS");
  assert.equal(await db.checkoutAttempt.count(), 2);
  const released = await release(app, frozen.body.id);
  assert.equal(released.status, 200, JSON.stringify(released.body));
  assert.equal(released.body.state, "abandoned");
  assert.equal(released.body.paid, false);
  assert.ok(fake.keeriCalls.includes("/api/storefront/reservations/release"));
  assert.equal((await release(app, frozen.body.id)).body.state, "abandoned", "release is idempotent");
  assert.equal((await paymentOrder(app, frozen.body.id)).status, 409, "an abandoned attempt can never be paid");
  const fresh = await freeze(app, "composition-request-3");
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.body.id, frozen.body.id);
  for (const credential of ["", `maple_cart=${"d".repeat(64)}`])
    assert.equal((await request(app).post(`/api/checkout/${fresh.body.id}/release`).set("Origin", origin).set("Cookie", credential).send({})).status, 404);
  assert.equal((await request(app).post(`/api/checkout/${fresh.body.id}/release`).set("Cookie", cookie).send({})).status, 403);
});

test("a hold that cannot be released is quarantined for staff instead of silently kept", async () => {
  const { app } = checkoutApp();
  const frozen = await freeze(app);
  await paymentOrder(app, frozen.body.id);
  fake.releaseStatus = 503;
  const failed = await release(app, frozen.body.id);
  assert.equal(failed.status, 409);
  assert.equal(failed.body.code, "CHECKOUT_BLOCKED");
  assert.doesNotMatch(JSON.stringify(failed.body), /release detail/);
  const attempt = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.body.id } });
  assert.equal(attempt.state, "reconciliation_required");
  assert.equal(attempt.failureCode, "RELEASE_UNCERTAIN");
  assert.equal((await status(app, frozen.body.id)).body.fulfillmentStatus, "review_required");
});

test("a failed provider order releases the Keeri hold and leaves the attempt for reconciliation", async () => {
  const { app } = checkoutApp();
  const frozen = await freeze(app);
  fake.razorpayOrderStatus = 500;
  const failed = await paymentOrder(app, frozen.body.id);
  assert.equal(failed.status, 409);
  assert.equal(failed.body.code, "CHECKOUT_BLOCKED");
  const attempt = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.body.id } });
  assert.equal(attempt.state, "reconciliation_required");
  assert.equal(attempt.failureCode, "PROVIDER_CREATION_UNCERTAIN");
  assert.deepEqual(fake.keeriCalls.slice(1), ["/api/storefront/reservations", "/api/storefront/reservations/release"]);
});

test("an order Keeri refuses to quote is a buyer problem, while a Keeri outage is a retry", async () => {
  const { app } = checkoutApp();
  const unknown = await freeze(app, "composition-unknown-method", { ...input, deliveryMethodId: "overnight" });
  assert.equal(unknown.status, 422);
  assert.equal(unknown.body.code, "QUOTE_REJECTED");
  assert.deepEqual(fake.keeriCalls, [], "an unconfigured delivery method never reaches Keeri");
  fake.quoteStatus = 422;
  const refused = await freeze(app, "composition-refused");
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, "QUOTE_REJECTED");
  assert.doesNotMatch(JSON.stringify(refused.body), /policy detail/);
  fake.quoteStatus = 503;
  const outage = await freeze(app, "composition-outage");
  assert.equal(outage.status, 503);
  assert.equal(outage.body.code, "QUOTE_UNAVAILABLE");
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("a refused Keeri hold leaves the attempt in reconciliation without a provider order", async () => {
  const { app } = checkoutApp();
  fake.reservationStatus = 503;
  const frozen = await freeze(app);
  const refused = await paymentOrder(app, frozen.body.id);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "CHECKOUT_BLOCKED");
  assert.doesNotMatch(JSON.stringify(refused.body), /stock problem/);
  const attempt = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.body.id } });
  assert.equal(attempt.state, "reconciliation_required");
  assert.equal(attempt.providerOrderId, null);
  assert.deepEqual(fake.razorpayCalls, []);
  assert.equal((await status(app, frozen.body.id)).body.fulfillmentStatus, "review_required");
});

test("an expired quote replays for its key, cannot start payment, and a fresh key gets a new quote", async () => {
  const { app } = checkoutApp();
  const frozen = await freeze(app);
  clock = new Date("2030-01-01T10:16:00Z");
  const replayed = await freeze(app);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.id, frozen.body.id, "the same key returns the same attempt even once expired");
  assert.equal(replayed.body.quote.expiresAt, "2030-01-01T10:15:00.000Z", "so the client must read the expiry and use a new key");
  const expired = await paymentOrder(app, frozen.body.id);
  assert.equal(expired.status, 409);
  assert.equal(expired.body.code, "CHECKOUT_BLOCKED");
  assert.deepEqual(fake.keeriCalls, ["/api/storefront/quotes"], "no hold is requested for an expired quote");
  fake.quoteExpiresAt = "2030-01-01T10:31:00.000Z";
  const fresh = await freeze(app, "composition-request-2");
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.body.id, frozen.body.id);
  assert.equal(fresh.body.quote.expiresAt, "2030-01-01T10:31:00.000Z");
  assert.equal((await paymentOrder(app, fresh.body.id)).status, 200);
});

test("a forged webhook is rejected and an uncaptured payment never confirms an order", async () => {
  const { app, runWorkers } = checkoutApp();
  const frozen = await freeze(app);
  await paymentOrder(app, frozen.body.id);
  assert.equal((await webhook(app, "wrong-secret")).status, 401);
  assert.equal(await db.paymentWebhookInbox.count(), 0);
  fake.paymentCaptured = false;
  assert.equal((await webhook(app)).status, 202);
  const stats = await runWorkers();
  assert.equal(stats.payments.claimed, 1);
  const inbox = await db.paymentWebhookInbox.findFirstOrThrow();
  assert.equal(inbox.state, "reconciliation_required");
  assert.equal(inbox.failureCode, "PAYMENT_NOT_CAPTURED");
  const current = await status(app, frozen.body.id);
  assert.equal(current.body.paid, false);
  assert.equal(current.body.state, "awaiting_payment");
  assert.equal(await db.orderOutbox.count(), 0);
  assert.ok(!fake.keeriCalls.includes("/api/storefront/orders"));
});
