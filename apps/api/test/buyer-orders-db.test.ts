import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import request from "supertest";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { createApp, type AppConfig } from "../src/app.js";
import { orderLinkRef } from "../src/orders/order-access.js";
import { KeeriCommerceError, type KeeriShipment } from "../src/keeri-commerce.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const secret = randomBytes(32).toString("hex");
const clock = new Date("2026-11-14T10:00:00.000Z");

type Calls = { cancellations: Array<Record<string, string>>; shipments: string[] };
let calls: Calls;
let cancelAnswer: () => Promise<{ requestId: string; status: string }>;
let shipmentAnswer: () => Promise<KeeriShipment>;
function app(overrides: Partial<AppConfig> = {}) {
  return createApp(db, {
    webOrigin: origin, catalogMode: "preview", secureCookies: false,
    buyerOrders: {
      links: { secret, whatsappLinks: false }, merchantScope: "maple-store",
      keeri: {
        requestCancellation: async (input) => { calls.cancellations.push(input); return cancelAnswer(); },
        orderShipment: async (id) => { calls.shipments.push(id); return shipmentAnswer(); },
      },
    },
    ...overrides,
  });
}

function snapshot(): QuoteSnapshot {
  const address = { line1: "12 Lake Road", line2: "", city: "Pune", stateCode: "27", pincode: "411001", country: "IN" as const };
  const line = { variantId: "keeri:maple:link-chair-v", productId: "keeri:maple:link-chair", title: "Alain", variantTitle: "Ivory", sku: null,
    quantity: 2, unitPricePaise: 150_000, lineTotalPaise: 300_000, hsn: "9401", taxRateBps: 1800, fulfilment: { kind: "stocked" as const, leadTimeDays: null } };
  return {
    version: 2, currency: "INR", policyId: "fixture-v1", quoteId: "quote_link", expiresAt: "2026-11-14T10:10:00.000Z",
    customer: { name: "Asha Rao", email: "asha@example.test", phone: "+919876543210" }, billingAddress: address, shippingAddress: address,
    deliveryMethodId: "standard", gstMode: "included", items: [line], subtotalPaise: 300_000, shippingPaise: 50_000,
    taxPaise: 53_390, totalPaise: 350_000,
    delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
      carrier: { provider: "shiprocket", courierId: 51, courierName: "Delhivery Surface", estimatedDays: 5, chargeWeightGrams: 30_000 } },
  };
}
async function order(input: { number: number; confirmed?: boolean }) {
  const id = randomUUID();
  const quote = snapshot();
  await db.checkoutAttempt.create({ data: {
    id, cartId: `cart-${id}`, merchantScope: "maple-store", idempotencyKey: `key-${id}`, receipt: `sm_${id.replaceAll("-", "")}`,
    snapshot: quote as unknown as Prisma.InputJsonObject, amountPaise: quote.totalPaise, state: "captured", paymentId: `pay_${id.slice(0, 8)}`,
    capturedAt: clock, customerEmailKey: "asha@example.test", orderNumber: input.number,
  } });
  if (input.confirmed !== false)
    await db.orderOutbox.create({ data: { attemptId: id, kind: "keeri.order.captured.v2", payload: {}, state: "delivered", externalOrderId: `SO-${input.number}`,
      deliveredAt: new Date(clock.getTime() + 60_000) } });
  return id;
}
async function event(number: number, type: string, payload: Record<string, unknown>, at: Date) {
  await db.keeriOrderEvent.create({ data: { merchantScope: "maple-store", externalOrderId: `SO-${number}`, type, bodySha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
    payload: { externalOrderId: `SO-${number}`, ...payload } as Prisma.InputJsonObject, occurredAt: at } });
}
const ref = (number: number) => orderLinkRef(secret, number);
const cancel = (target: ReturnType<typeof app>, number: number, reason = "Ordered the wrong colour") =>
  request(target).post(`/api/orders/link/${ref(number)}/cancel`).set("Origin", origin).send({ reason });

beforeEach(async () => {
  calls = { cancellations: [], shipments: [] };
  cancelAnswer = async () => ({ requestId: calls.cancellations.at(-1)!.requestId!, status: "requested" });
  shipmentAnswer = async () => ({ externalOrderId: "SO-501", state: "shipped", courierName: "Delhivery", awbCode: "AWB501",
    trackingUrl: "https://shiprocket.co/tracking/AWB501", trackingStatus: "In transit", shippedAt: "2026-11-16T09:00:00.000Z", deliveredAt: null });
  await db.orderCancellationRequest.deleteMany();
  await db.keeriOrderEvent.deleteMany();
  await db.orderOutbox.deleteMany();
  await db.checkoutAttempt.deleteMany();
});
after(() => db.$disconnect());

test("the private link opens the order without an account: pieces, totals, address, status and both links", async () => {
  await order({ number: 501 });
  const response = await request(app()).get(`/api/orders/link/${ref(501)}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(response.body.number, "MF-501");
  assert.equal(response.body.status, "confirmed");
  assert.deepEqual(response.body.items.map((i: any) => [i.title, i.variant, i.quantity, i.linePaise]), [["Alain", "Ivory", 2, 300_000]]);
  assert.equal(response.body.totals.totalPaise, 350_000);
  assert.equal(response.body.delivery.city, "Pune");
  assert.equal(response.body.delivery.phone, "+91 ••••• •3210");
  assert.deepEqual(response.body.links, { view: `/orders/${ref(501)}`, tracking: `/orders/${ref(501)}/tracking` });
  assert.equal(response.body.canCancel, true);
  assert.equal(response.body.cancelRequest, null);
});

test("a forged, altered or other order's link is the same 404, and without the secret the routes do not exist", async () => {
  await order({ number: 502 });
  const target = app();
  for (const bad of [ref(503), ref(502).slice(0, -1) + "0", "MF-502", `MF-502-${"0".repeat(32)}`])
    assert.equal((await request(target).get(`/api/orders/link/${bad}`)).status, 404, bad);
  assert.equal((await request(target).get(`/api/orders/link/${orderLinkRef("x".repeat(40), 502)}`)).status, 404);
  assert.equal((await request(app({ buyerOrders: null })).get(`/api/orders/link/${ref(502)}`)).status, 404);
});

test("cancel asks Keeri once with the buyer's reason; the order then shows the request and no second Cancel", async () => {
  await order({ number: 504 });
  const target = app();
  const first = await cancel(target, 504);
  assert.equal(first.status, 200);
  assert.equal(first.body.cancelRequest.status, "requested");
  assert.equal(first.body.canCancel, false);
  assert.equal(calls.cancellations.length, 1);
  assert.deepEqual({ ...calls.cancellations[0], requestId: "id" }, { requestId: "id", externalOrderId: "SO-504", reason: "Ordered the wrong colour" });
  assert.match(calls.cancellations[0]!.requestId!, /^[0-9a-f-]{36}$/);
  const again = await cancel(target, 504);
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "CANCELLATION_ALREADY_REQUESTED");
  assert.equal(calls.cancellations.length, 1);
  // Staff decline it in Keeri: the buyer sees that, and is pointed to the team rather than asking again.
  await event(504, "order.cancellation_declined", { decidedAt: "2026-11-15T10:00:00.000Z" }, new Date("2026-11-15T10:00:00.000Z"));
  const declined = await request(target).get(`/api/orders/link/${ref(504)}`);
  assert.equal(declined.body.cancelRequest.status, "declined");
  assert.equal(declined.body.cancelRequest.note, undefined);
  assert.equal(declined.body.canCancel, false);
  // With staff's note to the buyer, the page shows their words.
  await event(504, "order.cancellation_declined", { decidedAt: "2026-11-15T11:00:00.000Z", note: "Your chairs are already being upholstered." },
    new Date("2026-11-15T11:00:00.000Z"));
  const noted = await request(target).get(`/api/orders/link/${ref(504)}`);
  assert.deepEqual([noted.body.cancelRequest.status, noted.body.cancelRequest.note], ["declined", "Your chairs are already being upholstered."]);
});

test("once staff approve, the order shows cancelled and refunded, not a request still waiting", async () => {
  await order({ number: 509 });
  const target = app();
  assert.equal((await cancel(target, 509)).status, 200);
  const at = new Date("2026-11-15T10:00:00.000Z");
  await event(509, "order.status_changed", { status: "cancelled", changedAt: at.toISOString() }, at);
  await event(509, "order.cancelled", { cancelledAt: at.toISOString(), refund: { status: "pending", amountPaise: 350_000 } }, at);
  const cancelled = await request(target).get(`/api/orders/link/${ref(509)}`);
  assert.equal(cancelled.body.status, "cancelled");
  assert.equal(cancelled.body.cancelRequest, null);
  assert.equal(cancelled.body.canCancel, false);
  const again = await cancel(target, 509);
  assert.equal(again.status, 409);
  assert.equal(calls.cancellations.length, 1);
});

test("an order already in production, or not yet confirmed, cannot be cancelled online and Keeri is not asked", async () => {
  await order({ number: 505 });
  await event(505, "order.status_changed", { status: "in_production", changedAt: "2026-11-15T10:00:00.000Z" }, new Date("2026-11-15T10:00:00.000Z"));
  await order({ number: 506, confirmed: false });
  const target = app();
  for (const number of [505, 506]) {
    assert.equal((await request(target).get(`/api/orders/link/${ref(number)}`)).body.canCancel, false);
    const response = await cancel(target, number);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "CANCELLATION_NOT_AVAILABLE");
    assert.match(response.body.message, /contact/i);
  }
  assert.equal(calls.cancellations.length, 0);
});

test("Keeri's refusal is the buyer's answer; Keeri being away keeps the request to send again with the same id", async () => {
  const attempt507 = await order({ number: 507 });
  const target = app();
  cancelAnswer = async () => { throw new KeeriCommerceError("CANCELLATION_NOT_ALLOWED"); };
  const refused = await cancel(target, 507);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "CANCELLATION_NOT_AVAILABLE");
  // Keeri has said no, though the store has not yet heard the order move on: Cancel is not offered again, and a
  // second click neither stores another request nor asks Keeri again.
  const after = await request(target).get(`/api/orders/link/${ref(507)}`);
  assert.equal(after.body.canCancel, false);
  assert.equal(after.body.cancelRequest, null);
  assert.equal((await cancel(target, 507)).status, 409);
  assert.equal(calls.cancellations.filter((c) => c.externalOrderId === "SO-507").length, 1);
  assert.equal(await db.orderCancellationRequest.count({ where: { attemptId: attempt507 } }), 1);
  await order({ number: 508 });
  cancelAnswer = async () => { throw new KeeriCommerceError("UPSTREAM_UNAVAILABLE", true); };
  assert.equal((await cancel(target, 508)).status, 503);
  cancelAnswer = async () => ({ requestId: calls.cancellations.at(-1)!.requestId!, status: "requested" });
  assert.equal((await cancel(target, 508)).status, 200);
  const ids = calls.cancellations.filter((c) => c.externalOrderId === "SO-508").map((c) => c.requestId);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});

test("a reason is required and bounded, and only the store's own pages may cancel", async () => {
  await order({ number: 509 });
  const target = app();
  for (const reason of ["", "no", "x".repeat(501)]) assert.equal((await cancel(target, 509, reason)).status, 400);
  assert.equal((await request(target).post(`/api/orders/link/${ref(509)}/cancel`).set("Origin", "https://evil.example").send({ reason: "Changed my mind" })).status, 403);
  assert.equal(calls.cancellations.length, 0);
});

test("tracking shows Keeri's shipment, and the order without it when Keeri cannot say", async () => {
  await order({ number: 501 });
  const target = app();
  const response = await request(target).get(`/api/orders/link/${ref(501)}/tracking`);
  assert.equal(response.status, 200);
  assert.equal(response.body.order.number, "MF-501");
  assert.deepEqual(response.body.shipment, { state: "shipped", courierName: "Delhivery", awbCode: "AWB501", trackingUrl: "https://shiprocket.co/tracking/AWB501",
    trackingStatus: "In transit", shippedAt: "2026-11-16T09:00:00.000Z", deliveredAt: null });
  assert.deepEqual(calls.shipments, ["SO-501"]);
  shipmentAnswer = async () => { throw new KeeriCommerceError("UPSTREAM_REJECTED"); };
  const unavailable = await request(target).get(`/api/orders/link/${ref(501)}/tracking`);
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.body.shipment, null);
  assert.equal(unavailable.body.shipmentUnavailable, true);
  // An order Keeri has not accepted has nothing to track yet, and Keeri is not asked.
  await order({ number: 510, confirmed: false });
  const confirming = await request(target).get(`/api/orders/link/${ref(510)}/tracking`);
  assert.equal(confirming.body.shipment, null);
  assert.equal(confirming.body.shipmentUnavailable, false);
  assert.deepEqual(calls.shipments, ["SO-501", "SO-501"]);
});
