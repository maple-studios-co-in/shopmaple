import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { orderDetailSchema } from "@shopmaple/contracts/account";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { createApp } from "../src/app.js";
import { customerOrderStatus, orderJourney, toOrderDetail } from "../src/account/orders.js";
import {
  loadKeeriOrderEventsConfig, orderProgress, signatureToleranceSeconds, verifyKeeriSignature,
} from "../src/orders/keeri-events.js";

// Order progress from Keeri, without a database: the signature, what the store makes of an order's events, the journey
// the buyer sees, and the route's answers. The stored rows and the order pages reading them are in account-db.test.ts.
const secret = "keeri-order-events-test-secret-32-chars";
const now = new Date("2026-11-13T10:00:00.000Z");
/** Keeri's own signing (apps/admin/src/storefront/order-lifecycle/delivery.ts). */
const sign = (body: string, at = now, key = secret) => {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
};
const event = (type: string, data: Record<string, unknown>, externalOrderId = "ord_keeri_1") => JSON.stringify({ event: type, externalOrderId, ...data });
const row = (type: string, on: string, data: Record<string, unknown> = {}) => ({ type, occurredAt: new Date(on), payload: { event: type, externalOrderId: "ord_keeri_1", ...data } });
const status = (to: string, on: string) => row("order.status_changed", on, { status: to, changedAt: on });

test("a signature is Keeri's HMAC over the timestamp and the exact bytes, inside the time window", () => {
  const body = event("order.delivered", { deliveredAt: "2026-11-13T09:59:00.000Z" });
  const raw = Buffer.from(body);
  assert.equal(verifyKeeriSignature(secret, raw, sign(body), now), true);
  assert.equal(verifyKeeriSignature(secret, raw, sign(body, now, "another-secret-of-at-least-32-characters"), now), false, "another secret");
  assert.equal(verifyKeeriSignature(secret, Buffer.from(body + " "), sign(body), now), false, "a changed body");
  const edge = new Date(now.getTime() - signatureToleranceSeconds * 1000);
  assert.equal(verifyKeeriSignature(secret, raw, sign(body, edge), now), true, "the edge of the window");
  assert.equal(verifyKeeriSignature(secret, raw, sign(body, new Date(edge.getTime() - 1000)), now), false, "a stale timestamp");
  assert.equal(verifyKeeriSignature(secret, raw, sign(body, new Date(now.getTime() + (signatureToleranceSeconds + 1) * 1000)), now), false, "a future timestamp");
  for (const header of [undefined, "", "v1=abc", "t=1,v1=zz", `t=${Math.floor(now.getTime() / 1000)},v1=${"0".repeat(64)}`, sign(body).toUpperCase(), sign(body) + ",v1=" + "a".repeat(64)])
    assert.equal(verifyKeeriSignature(secret, raw, header, now), false, String(header));
});

test("the secret is optional, must be long, and needs the store's merchant scope", () => {
  assert.equal(loadKeeriOrderEventsConfig({}, "maple-store"), null);
  assert.equal(loadKeeriOrderEventsConfig({ KEERI_DELIVERY_WEBHOOK_SECRET: "  " }, "maple-store"), null);
  assert.deepEqual(loadKeeriOrderEventsConfig({ KEERI_DELIVERY_WEBHOOK_SECRET: ` ${secret} ` }, "maple-store"), { secret, merchantScope: "maple-store" });
  assert.throws(() => loadKeeriOrderEventsConfig({ KEERI_DELIVERY_WEBHOOK_SECRET: "short" }, "maple-store"), /32 to 512/);
  assert.throws(() => loadKeeriOrderEventsConfig({ KEERI_DELIVERY_WEBHOOK_SECRET: secret }, undefined), /KEERI_MERCHANT_SCOPE/);
});

test("an order's events become the stage the buyer sees, with when each was first reached", () => {
  assert.deepEqual(orderProgress([]), { stage: null, preparingAt: null, dispatchedAt: null, deliveredAt: null, cancelledAt: null, refund: null });
  const made = orderProgress([status("in_production", "2026-11-14T05:00:00.000Z"), status("ready", "2026-11-20T05:00:00.000Z")]);
  assert.equal(made.stage, "preparing");
  assert.equal(made.preparingAt?.toISOString(), "2026-11-14T05:00:00.000Z", "in production and ready are both preparing; the first counts");

  // Out of order on purpose: what happened first decides, not what arrived first.
  const delivered = orderProgress([
    row("order.delivered", "2026-11-25T08:00:00.000Z", { deliveredAt: "2026-11-25T08:00:00.000Z" }),
    status("delivered", "2026-11-25T08:00:00.000Z"),
    status("dispatched", "2026-11-22T06:00:00.000Z"),
    status("in_production", "2026-11-14T05:00:00.000Z"),
  ]);
  assert.deepEqual([delivered.stage, delivered.preparingAt?.toISOString(), delivered.dispatchedAt?.toISOString(), delivered.deliveredAt?.toISOString()],
    ["delivered", "2026-11-14T05:00:00.000Z", "2026-11-22T06:00:00.000Z", "2026-11-25T08:00:00.000Z"]);

  // A status the store does not know, a draft, or a malformed payload moves nothing.
  assert.equal(orderProgress([status("on_hold", "2026-11-14T05:00:00.000Z"), status("draft", "2026-11-14T06:00:00.000Z"),
    { type: "order.status_changed", occurredAt: now, payload: null }, row("order.cancellation_declined", "2026-11-14T07:00:00.000Z")]).stage, null);
  assert.equal(orderProgress([status("confirmed", "2026-11-13T05:00:00.000Z")]).stage, "confirmed");
});

test("a cancellation is final and carries its refund from pending to refunded", () => {
  const cancelled = [
    status("in_production", "2026-11-14T05:00:00.000Z"),
    status("cancelled", "2026-11-15T05:00:00.000Z"),
    row("order.cancelled", "2026-11-15T05:00:00.000Z", { cancelledAt: "2026-11-15T05:00:00.000Z", reason: "Out of fabric", refund: { status: "pending", amountPaise: 2_640_000 } }),
  ];
  const pending = orderProgress(cancelled);
  assert.deepEqual([pending.stage, pending.cancelledAt?.toISOString(), pending.preparingAt?.toISOString()], ["cancelled", "2026-11-15T05:00:00.000Z", "2026-11-14T05:00:00.000Z"]);
  assert.deepEqual(pending.refund, { status: "pending", amountPaise: 2_640_000, refundedAt: null });

  const refunded = orderProgress([...cancelled, row("order.refunded", "2026-11-16T09:00:00.000Z", { amountPaise: 2_640_000, refundedAt: "2026-11-16T09:00:00.000Z", gatewayRefundId: "rfnd_1" })]);
  assert.deepEqual(refunded.refund, { status: "refunded", amountPaise: 2_640_000, refundedAt: new Date("2026-11-16T09:00:00.000Z") });
  // A late repeat of the cancellation never turns a recorded refund back to pending.
  assert.equal(orderProgress([row("order.refunded", "2026-11-16T09:00:00.000Z", { amountPaise: 2_640_000 }), ...cancelled.map((e) => ({ ...e, occurredAt: new Date("2026-11-17T00:00:00Z") }))]).refund?.status, "refunded");
});

const confirmedAt = new Date("2026-11-13T09:31:00.000Z");
const outbox = { state: "delivered", externalOrderId: "ord_keeri_1", deliveredAt: confirmedAt };
const steps = (journey: ReturnType<typeof orderJourney>) => journey.map((step) => `${step.key}:${step.state}:${step.at ?? "-"}`);

test("a confirmed order's status and journey follow Keeri; an unconfirmed one ignores it", () => {
  const preparing = orderProgress([status("in_production", "2026-11-14T05:00:00.000Z")]);
  const dispatched = orderProgress([status("in_production", "2026-11-14T05:00:00.000Z"), status("dispatched", "2026-11-22T06:00:00.000Z")]);
  const straightOut = orderProgress([status("dispatched", "2026-11-22T06:00:00.000Z")]);
  const delivered = orderProgress([status("dispatched", "2026-11-22T06:00:00.000Z"), status("delivered", "2026-11-25T08:00:00.000Z")]);
  const cancelled = orderProgress([status("in_production", "2026-11-14T05:00:00.000Z"), status("cancelled", "2026-11-15T05:00:00.000Z")]);

  assert.equal(customerOrderStatus("captured", outbox, null), "confirmed");
  assert.equal(customerOrderStatus("captured", outbox, preparing), "preparing");
  assert.equal(customerOrderStatus("captured", outbox, dispatched), "dispatched");
  assert.equal(customerOrderStatus("captured", outbox, delivered), "delivered");
  assert.equal(customerOrderStatus("captured", outbox, cancelled), "cancelled");
  assert.equal(customerOrderStatus("captured", { ...outbox, state: "failed" }, delivered), "confirming", "Keeri never accepted it");
  assert.equal(customerOrderStatus("paid_hold_lapsed", outbox, delivered), "confirming");

  assert.deepEqual(steps(orderJourney("preparing", confirmedAt, preparing)),
    ["confirmed:done:2026-11-13T09:31:00.000Z", "preparing:current:-", "dispatched:upcoming:-", "delivered:upcoming:-"]);
  assert.deepEqual(steps(orderJourney("dispatched", confirmedAt, dispatched)),
    ["confirmed:done:2026-11-13T09:31:00.000Z", "preparing:done:2026-11-14T05:00:00.000Z", "dispatched:done:2026-11-22T06:00:00.000Z", "delivered:current:-"]);
  assert.deepEqual(steps(orderJourney("dispatched", confirmedAt, straightOut))[1], "preparing:done:-", "a step Keeri skipped is done without a time");
  assert.deepEqual(steps(orderJourney("delivered", confirmedAt, delivered)).slice(2), ["dispatched:done:2026-11-22T06:00:00.000Z", "delivered:done:2026-11-25T08:00:00.000Z"]);
  assert.deepEqual(steps(orderJourney("cancelled", confirmedAt, cancelled)),
    ["confirmed:done:2026-11-13T09:31:00.000Z", "preparing:done:2026-11-14T05:00:00.000Z", "dispatched:upcoming:-", "delivered:upcoming:-"], "what it reached, nothing under way");
});

const address = { line1: "12 Lake Road", line2: "", city: "Pune", stateCode: "27", pincode: "411001", country: "IN" as const };
const snapshot: QuoteSnapshot = {
  version: 2, currency: "INR", policyId: "fixture-v1", quoteId: "quote_progress", expiresAt: "2026-11-13T10:10:00.000Z",
  customer: { name: "Asha Rao", email: "asha@example.com", phone: "+919876543210" }, billingAddress: address, shippingAddress: address,
  deliveryMethodId: "standard", gstMode: "included",
  items: [{ variantId: "keeri:maple:chair-v", productId: "keeri:maple:chair", title: "Nola Accent Chair", variantTitle: "Oak", sku: null, quantity: 1,
    unitPricePaise: 2_490_000, lineTotalPaise: 2_490_000, hsn: "9401", taxRateBps: 1800, fulfilment: { kind: "stocked", leadTimeDays: null } }],
  subtotalPaise: 2_490_000, shippingPaise: 150_000, taxPaise: 402_712, totalPaise: 2_640_000,
  delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
    carrier: { provider: "shiprocket", courierId: 1, courierName: "Delhivery Surface", estimatedDays: 5, chargeWeightGrams: 12_000 } },
};
const order = { orderNumber: 10482, state: "captured", capturedAt: new Date("2026-11-13T09:30:00Z"), paymentId: "pay_Fixture123", snapshot, outbox };

test("the order detail carries the cancellation and refund, inside the contract, and only for an accepted order", () => {
  const cancelled = orderProgress([
    status("cancelled", "2026-11-15T05:00:00.000Z"),
    row("order.cancelled", "2026-11-15T05:00:00.000Z", { refund: { status: "pending", amountPaise: 2_640_000 } }),
    row("order.refunded", "2026-11-16T09:00:00.000Z", { amountPaise: 2_640_000 }),
  ]);
  const detail = orderDetailSchema.parse(toOrderDetail({ ...order, progress: cancelled }, new Map()));
  assert.deepEqual([detail.status, detail.statusLabel], ["cancelled", "Cancelled"]);
  assert.deepEqual(detail.cancellation, { cancelledAt: "2026-11-15T05:00:00.000Z" });
  assert.deepEqual(detail.refund, { status: "refunded", amountPaise: 2_640_000, refundedAt: "2026-11-16T09:00:00.000Z" });

  const plain = orderDetailSchema.parse(toOrderDetail(order, new Map()));
  assert.deepEqual([plain.status, plain.cancellation, plain.refund], ["confirmed", null, null]);
  const unaccepted = orderDetailSchema.parse(toOrderDetail({ ...order, outbox: null, progress: cancelled }, new Map()));
  assert.deepEqual([unaccepted.status, unaccepted.cancellation, unaccepted.refund, unaccepted.journey[0]!.state], ["confirming", null, null, "current"]);
});

// The route, with the database replaced by a recorder.
function api(options: { fail?: "duplicate" | "down" } = {}) {
  const stored: Array<Record<string, unknown>> = [];
  const db = {
    keeriOrderEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.fail === "duplicate") throw Object.assign(Object.create((await import("@prisma/client")).Prisma.PrismaClientKnownRequestError.prototype), { code: "P2002" });
        if (options.fail === "down") throw new Error("database unavailable");
        stored.push(data);
      },
    },
  } as unknown as PrismaClient;
  const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false,
    keeriOrderEvents: { secret, merchantScope: "maple-store", now: () => now } });
  const post = (body: string, signature: string | null = sign(body), type = "application/json") => {
    const call = request(app).post("/api/integrations/keeri/order-events").set("Content-Type", type);
    return (signature === null ? call : call.set("X-Keeri-Signature", signature)).send(body);
  };
  return { post, stored, app };
}

test("a signed event is stored under the store's scope and acknowledged; no browser Origin is needed", async () => {
  const { post, stored } = api();
  const body = event("order.status_changed", { status: "dispatched", previousStatus: "ready", changedAt: "2026-11-13T09:58:00.000Z" });
  const response = await post(body);
  assert.deepEqual([response.status, response.body], [200, { accepted: true, outcome: "stored" }]);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(stored.length, 1);
  assert.deepEqual([stored[0]!.merchantScope, stored[0]!.externalOrderId, stored[0]!.type, (stored[0]!.occurredAt as Date).toISOString()],
    ["maple-store", "ord_keeri_1", "order.status_changed", "2026-11-13T09:58:00.000Z"]);
  assert.match(String(stored[0]!.bodySha256), /^[a-f0-9]{64}$/);

  // Every event Keeri sends today is accepted.
  for (const [type, data] of [
    ["order.delivered", { deliveredAt: "2026-11-13T09:59:00.000Z" }],
    ["order.cancelled", { reason: "Out of fabric", cancelledAt: "2026-11-13T09:59:00.000Z", refund: { status: "pending", amountPaise: 2_640_000 } }],
    ["order.cancellation_declined", { requestId: "req_1", note: null, decidedAt: "2026-11-13T09:59:00.000Z" }],
    ["order.refunded", { amountPaise: 2_640_000, refundedAt: "2026-11-13T09:59:00.000Z", gatewayRefundId: "rfnd_1", creditNoteNumber: "CN-1" }],
  ] as const) assert.equal((await post(event(type, data))).body.outcome, "stored", type);
  assert.equal(stored.length, 5);
});

test("a repeat is acknowledged as a duplicate, an unknown event is acknowledged and not stored, a database fault is not acknowledged", async () => {
  const body = event("order.delivered", { deliveredAt: "2026-11-13T09:59:00.000Z" });
  assert.deepEqual((await api({ fail: "duplicate" }).post(body)).body, { accepted: true, outcome: "duplicate" });
  const fresh = api();
  assert.deepEqual((await fresh.post(event("order.something_new", { at: "2026-11-13T09:59:00.000Z" }))).body, { accepted: true, outcome: "ignored" });
  assert.equal(fresh.stored.length, 0);
  assert.equal((await api({ fail: "down" }).post(body)).status, 500, "Keeri retries what the store did not keep");
});

test("unsigned, wrongly signed, stale, malformed and non-JSON requests are refused and store nothing", async () => {
  const { post, stored, app } = api();
  const body = event("order.delivered", { deliveredAt: "2026-11-13T09:59:00.000Z" });
  assert.equal((await post(body, null)).status, 401);
  assert.equal((await post(body, sign(body, now, "another-secret-of-at-least-32-characters"))).status, 401);
  assert.equal((await post(body, sign(body, new Date(now.getTime() - (signatureToleranceSeconds + 5) * 1000)))).status, 401);
  assert.equal((await post(body, sign(body + "x"))).status, 401, "a signature for another body");
  for (const bad of ["not json", "[]", JSON.stringify({ event: "order.delivered" }), event("order.delivered", { deliveredAt: "yesterday" }),
    event("order.delivered", { deliveredAt: "2026-11-13T09:59:00.000Z" }, "bad id!"), event("order.refunded", { amountPaise: -1, refundedAt: "2026-11-13T09:59:00.000Z" })])
    assert.equal((await post(bad)).status, 400, bad);
  assert.equal((await post(body, sign(body), "text/plain")).status, 415);
  assert.equal((await request(app).get("/api/integrations/keeri/order-events")).status, 404);
  assert.equal(stored.length, 0);

  // Without the secret the route does not exist.
  const off = createApp({} as PrismaClient, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
  const refused = await request(off).post("/api/integrations/keeri/order-events").set("Content-Type", "application/json").set("X-Keeri-Signature", sign(body)).send(body);
  assert.notEqual(refused.status, 200);
});
