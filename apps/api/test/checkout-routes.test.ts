import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { CommerceHttpService } from "../src/commerce-http.js";
import { KeeriCommerceError } from "../src/keeri-commerce.js";
import { OrderFlowError } from "../src/orders/errors.js";
import { PaymentGatewayError } from "../src/payments/razorpay.js";
import { guardedCartSchema } from "@shopmaple/contracts";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const config = { webOrigin: origin, catalogMode: "preview", secureCookies: false } as const;
const checkout = { deliveryMethods: [{ id: "standard", label: "Standard delivery" }, { id: "white-glove", label: "White glove" }], paymentKeyId: "rzp_test_routes" };
const cookie = `maple_cart=${"a".repeat(64)}`;
const attemptId = "6f1c7b0e-6d2a-4b7e-9c5f-0a1b2c3d4e5f";
const address = { line1: "1 Test Street", line2: "", city: "Mumbai", stateCode: "27", pincode: "400001", country: "IN" };
const input = { customer: { name: "Test Buyer", email: "buyer@example.test", phone: "+919876543210" }, billingAddress: address, shippingAddress: address, deliveryMethodId: "standard" };
const quiet: CommerceHttpService = {
  freezeCart: async () => { throw new OrderFlowError("CART_NOT_FOUND"); },
  getAttempt: async () => { throw new OrderFlowError("ATTEMPT_NOT_FOUND"); },
  createProviderOrder: async () => { throw new OrderFlowError("ATTEMPT_NOT_FOUND"); },
  ingestWebhook: async () => { throw new PaymentGatewayError("INVALID_SIGNATURE"); },
  releaseAttempt: async () => { throw new OrderFlowError("ATTEMPT_NOT_FOUND"); },
};
/** A fake commerce service: route tests only need the HTTP translation, not a database flow. */
function service(overrides: Partial<CommerceHttpService>): CommerceHttpService {
  return { ...quiet, ...overrides };
}
before(async () => { await db.$connect(); });
after(async () => { await db.$disconnect(); });

test("health reports live checkout only when a commerce service is injected", async () => {
  assert.equal((await request(createApp(db, config)).get("/api/health")).body.checkoutEnabled, false);
  assert.equal((await request(createApp(db, { ...config, checkout }, quiet)).get("/api/health")).body.checkoutEnabled, true);
});

test("the guest cart advertises checkout exactly when the service is composed, within the shared contract", async () => {
  const preview = await request(createApp(db, config)).get("/api/cart");
  assert.equal(preview.body.checkoutEnabled, false);
  const live = await request(createApp(db, { ...config, checkout }, quiet)).get("/api/cart");
  assert.equal(live.status, 200);
  assert.equal(live.body.checkoutEnabled, true);
  assert.equal(guardedCartSchema.parse(live.body).checkoutEnabled, true, "the storefront contract must accept a live cart");
});

test("a delivery method outside the configured options is refused before any quote is requested", async () => {
  let quotes = 0;
  const app = createApp(db, { ...config, checkout }, service({ freezeCart: async () => { quotes++; throw new OrderFlowError("CART_NOT_FOUND"); } }));
  const refused = await request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", "routes-method-1").send({ ...input, deliveryMethodId: "overnight" });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, "QUOTE_REJECTED");
  assert.equal(quotes, 0);
  await request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", "routes-method-2").send({ ...input, deliveryMethodId: "white-glove" });
  assert.equal(quotes, 1, "configured methods proceed to the service");
});

test("Keeri rejections and in-flight attempts are distinguished from outages", async () => {
  for (const [error, status, code] of [
    [new KeeriCommerceError("UPSTREAM_REJECTED"), 422, "QUOTE_REJECTED"],
    [new KeeriCommerceError("UPSTREAM_UNAVAILABLE"), 503, "QUOTE_UNAVAILABLE"],
    [new OrderFlowError("CHECKOUT_IN_PROGRESS"), 409, "CHECKOUT_IN_PROGRESS"],
  ] as Array<[Error, number, string]>) {
    const app = createApp(db, { ...config, checkout }, service({ freezeCart: async () => { throw error; } }));
    const response = await request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", "routes-request-2").send(input);
    assert.equal(response.status, status, error.message);
    assert.equal(response.body.code, code);
  }
});

test("release needs the browser origin and the owning cart, and reports an uncertain release as blocked", async () => {
  const released: string[] = [];
  const app = createApp(db, { ...config, checkout }, service({
    releaseAttempt: async (_token, id) => { released.push(id); if (released.length > 1) throw new OrderFlowError("RELEASE_UNCERTAIN"); return { id, state: "abandoned", amountPaise: 1000, currency: "INR", providerOrderId: "order_x", snapshot: {} } as never; },
  }));
  assert.equal((await request(app).post(`/api/checkout/${attemptId}/release`).set("Cookie", cookie).send({})).status, 403);
  assert.equal((await request(app).post(`/api/checkout/${attemptId}/release`).set("Origin", origin).set("Cookie", cookie).send({ force: true })).status, 400);
  assert.equal((await request(app).post("/api/checkout/not-a-uuid/release").set("Origin", origin).set("Cookie", cookie).send({})).status, 400);
  const ok = await request(app).post(`/api/checkout/${attemptId}/release`).set("Origin", origin).set("Cookie", cookie).send({});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.state, "abandoned");
  assert.equal(ok.body.snapshot, undefined);
  const uncertain = await request(app).post(`/api/checkout/${attemptId}/release`).set("Origin", origin).set("Cookie", cookie).send({});
  assert.equal(uncertain.status, 409);
  assert.equal(uncertain.body.code, "CHECKOUT_BLOCKED");
  assert.deepEqual(released, [attemptId, attemptId]);
});

test("checkout options expose delivery choices and the public payment key without credentials", async () => {
  const app = createApp(db, { ...config, checkout }, quiet);
  const response = await request(app).get("/api/checkout/options");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, checkout);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.equal((await request(createApp(db, config)).get("/api/checkout/options")).status, 404);
  const unconfigured = await request(createApp(db, config, quiet)).get("/api/checkout/options");
  assert.equal(unconfigured.status, 503, "a service without reviewed options cannot offer delivery choices");
});

test("upstream Keeri failures while quoting surface as a retryable 503 without the transport detail", async () => {
  const codes: string[] = [];
  const app = createApp(db, { ...config, checkout }, service({
    freezeCart: async () => { throw new KeeriCommerceError(codes.shift() ?? "TRANSPORT_TIMEOUT"); },
  }));
  for (const code of ["TRANSPORT_TIMEOUT", "UPSTREAM_UNAVAILABLE", "INVALID_RESPONSE", "TRANSPORT_UNAVAILABLE"]) {
    codes.push(code);
    const response = await request(app).post("/api/checkout").set("Origin", origin).set("Cookie", cookie).set("Idempotency-Key", "routes-request-1").send(input);
    assert.equal(response.status, 503, code);
    assert.equal(response.body.code, "QUOTE_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(response.body), new RegExp(code));
  }
});

test("payment creation failures distinguish review, provider outage and lost checkouts", async () => {
  const cases: Array<[Error, number, string]> = [
    [new OrderFlowError("QUOTE_EXPIRED"), 409, "CHECKOUT_BLOCKED"],
    [new OrderFlowError("RESERVATION_UNCERTAIN"), 409, "CHECKOUT_BLOCKED"],
    [new OrderFlowError("CATALOGUE_BINDING_CHANGED"), 409, "CHECKOUT_BLOCKED"],
    [new PaymentGatewayError("UPSTREAM_TIMEOUT", "unknown"), 503, "PAYMENT_UNAVAILABLE"],
    [new OrderFlowError("ATTEMPT_NOT_FOUND"), 404, "CHECKOUT_NOT_FOUND"],
  ];
  for (const [error, status, code] of cases) {
    const app = createApp(db, { ...config, checkout }, service({ createProviderOrder: async () => { throw error; } }));
    const response = await request(app).post(`/api/checkout/${attemptId}/payment-order`).set("Origin", origin).set("Cookie", cookie).send({});
    assert.equal(response.status, status, error.message);
    assert.equal(response.body.code, code);
    assert.doesNotMatch(JSON.stringify(response.body), /QUOTE_EXPIRED|RESERVATION_UNCERTAIN|CATALOGUE_BINDING|UPSTREAM_TIMEOUT/);
  }
});

test("status responses carry the public quote, payment key and fulfilment fields the storefront renders", async () => {
  const snapshot = {
    version: 2, currency: "INR", policyId: "routes", quoteId: "quote_routes", expiresAt: "2026-10-27T10:15:00.000Z", ...input,
    gstMode: "included", items: [{ variantId: "keeri:maple:v", productId: "keeri:maple:p", title: "Routes Chair", variantTitle: "Oak", sku: null,
      quantity: 1, unitPricePaise: 100000, lineTotalPaise: 100000, hsn: "9401", taxRateBps: 1800,
      fulfilment: { kind: "made_to_order", leadTimeDays: 21 } }],
    subtotalPaise: 100000, shippingPaise: 5000, taxPaise: 16017, totalPaise: 105000,
    delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
      carrier: { provider: "shiprocket", courierId: 7, courierName: "Bluedart", estimatedDays: 4, chargeWeightGrams: 12000 } },
  };
  const attempt = {
    id: attemptId, cartId: "cart", merchantScope: "routes", idempotencyKey: "routes-request-1", receipt: "sm_routes", snapshot,
    catalogueBindings: null, amountPaise: 105000, currency: "INR", state: "captured", reservationId: "hold", reservationExpiresAt: new Date(),
    providerOrderId: "order_routes", paymentId: "pay_routes", capturedAt: new Date(), failureCode: null, createdAt: new Date(), updatedAt: new Date(),
    fulfillmentStatus: "confirmed", orderReference: "SO-42",
  };
  const app = createApp(db, { ...config, checkout }, service({ getAttempt: async () => attempt as never }));
  const response = await request(app).get(`/api/checkout/${attemptId}`).set("Cookie", cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ["amountPaise", "currency", "fulfillmentStatus", "id", "orderReference", "paid", "payBy", "providerOrderId", "quote", "state"]);
  assert.deepEqual(Object.keys(response.body.quote).sort(), ["currency", "delivery", "expiresAt", "gstMode", "items", "shippingPaise", "subtotalPaise", "taxPaise", "totalPaise"]);
  assert.deepEqual(response.body.quote.delivery, { courierName: "Bluedart", estimatedDays: 4 });
  assert.deepEqual(response.body.quote.items[0].fulfilment, { kind: "made_to_order", leadTimeDays: 21 });
  assert.equal(response.body.orderReference, "SO-42");
  assert.doesNotMatch(JSON.stringify(response.body), /buyer@example|400001|sm_routes|hold|chargeWeight|courierId/);
});
