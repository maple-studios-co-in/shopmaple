import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeeriCommerce, KeeriCommerceError } from "../src/keeri-commerce.js";

const base = { origin: "https://keeri.example.test", token: "a".repeat(40), tenantId: "maple", merchantScope: "maple-store", retryDelaysMs: [] };
const shipped = { externalOrderId: "order_1", state: "shipped", courierName: "Delhivery", awbCode: "AWB123", trackingUrl: "https://shiprocket.co/tracking/AWB123",
  trackingStatus: "In transit", shippedAt: "2026-11-20T10:00:00.000Z", deliveredAt: null };

test("the order's shipment is read with a GET to Keeri's fixed path, without a body", async () => {
  const seen: { url: string; method?: string; body?: unknown }[] = [];
  const keeri = createKeeriCommerce({ ...base, fetch: async (url, init) => { seen.push({ url: String(url), method: init?.method, body: init?.body }); return Response.json(shipped); } });
  assert.deepEqual(await keeri.orderShipment("order_1"), shipped);
  assert.deepEqual(seen, [{ url: "https://keeri.example.test/api/storefront/orders/order_1/shipment", method: "GET", body: undefined }]);
  await assert.rejects(keeri.orderShipment("../quotes"), { code: "INVALID_REQUEST" });
});

test("a shipment Keeri describes in any other shape, or a tracking link off Shiprocket, is refused", async () => {
  for (const body of [{ ...shipped, state: "lost" }, { ...shipped, trackingUrl: "https://evil.example/track" }, { ...shipped, externalOrderId: "order_2" }, { ...shipped, extra: 1 }]) {
    const keeri = createKeeriCommerce({ ...base, fetch: async () => Response.json(body) });
    await assert.rejects(keeri.orderShipment("order_1"), { code: "INVALID_RESPONSE" });
  }
});

test("a buyer's cancellation request is posted with the store's merchant scope and request id", async () => {
  let sent: unknown;
  const keeri = createKeeriCommerce({ ...base, fetch: async (url, init) => {
    assert.equal(String(url), "https://keeri.example.test/api/storefront/orders/cancellation-requests");
    assert.equal(init?.method, "POST");
    sent = JSON.parse(String(init?.body));
    return Response.json({ requestId: "req_1", status: "requested" });
  } });
  assert.deepEqual(await keeri.requestCancellation({ requestId: "req_1", externalOrderId: "order_1", reason: "Changed my mind" }), { requestId: "req_1", status: "requested" });
  assert.deepEqual(sent, { merchantScope: "maple-store", requestId: "req_1", externalOrderId: "order_1", reason: "Changed my mind" });
});

test("Keeri's refusals of a cancellation reach the store by name; anything else stays a plain rejection", async () => {
  for (const [status, code] of [[409, "CANCELLATION_NOT_ALLOWED"], [409, "CANCELLATION_ALREADY_REQUESTED"], [404, "ORDER_NOT_FOUND"]] as const) {
    const keeri = createKeeriCommerce({ ...base, fetch: async () => Response.json({ error: code }, { status }) });
    await assert.rejects(keeri.requestCancellation({ requestId: "req_1", externalOrderId: "order_1", reason: "Changed my mind" }),
      (error: unknown) => error instanceof KeeriCommerceError && error.code === code);
  }
  const keeri = createKeeriCommerce({ ...base, fetch: async () => Response.json({ error: "SOMETHING_ELSE" }, { status: 409 }) });
  await assert.rejects(keeri.requestCancellation({ requestId: "req_1", externalOrderId: "order_1", reason: "Changed my mind" }), { code: "UPSTREAM_REJECTED" });
});
