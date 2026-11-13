import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type { OrderDetail, OrderTracking } from "@shopmaple/contracts/account";

// The order behind a private link (owner, 14 Nov 2026): its page, Cancel and tracking, without an account.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/orders/x" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement, HTMLFormElement: dom.window.HTMLFormElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { OrderDetailView } = await import("../components/account/order-detail");
const { OrderTrackingView } = await import("../components/orders/order-tracking");

const ref = "MF-10482-0123456789abcdef0123456789abcdef";
const journey = (["confirmed", "preparing", "dispatched", "delivered"] as const).map((key, index) => ({
  key, label: key[0]!.toUpperCase() + key.slice(1), state: index === 0 ? "done" as const : "upcoming" as const, at: index === 0 ? "2026-11-10T06:31:00.000Z" : null,
}));
const order = (changes: Partial<OrderDetail> = {}): OrderDetail => ({
  number: "MF-10482", placedAt: "2026-11-10T06:30:00.000Z", status: "confirmed", statusLabel: "Confirmed", itemCount: 2, totalPaise: 5_130_000,
  firstItem: { title: "Alain", variant: "Ivory", imageUrl: null },
  items: [{ title: "Alain", variant: "Ivory", quantity: 2, linePaise: 4_980_000, imageUrl: null }],
  delivery: { name: "Asha Rao", line1: "12 Lake Road", line2: "", city: "Pune", state: "27", pin: "411001", phone: "+91 ••••• •3210" },
  totals: { subtotalPaise: 4_980_000, deliveryPaise: 150_000, taxPaise: 0, totalPaise: 5_130_000, taxIncluded: true },
  payment: { label: "Paid online", reference: "pay_123" }, estimate: { from: "2026-11-24", to: "2026-11-28" },
  cancellation: null, refund: null, journey,
  links: { view: `/orders/${ref}`, tracking: `/orders/${ref}/tracking` }, cancelRequest: null, canCancel: true,
  ...changes,
});
let refreshed = 0;
async function mount(node: React.ReactNode) {
  refreshed = 0;
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() { refreshed += 1; }, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<AppRouterContext.Provider value={router}>{node}</AppRouterContext.Provider>));
  return async () => act(async () => root.unmount());
}
const text = () => document.getElementById("root")!.textContent ?? "";
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label);

test("the order page links its tracking page and offers Cancel while the order is only confirmed", async () => {
  const unmount = await mount(<OrderDetailView order={order()} />);
  try {
    assert.ok(document.querySelector(`a[href="/orders/${ref}/tracking"]`), "Track your order");
    assert.ok(button("Cancel order"));
  } finally { await unmount(); }
});

test("Cancel asks why, sends the reason, and the page then says the team will be in touch", async () => {
  const posts: { url: string; body: unknown }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    posts.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(order({ canCancel: false, cancelRequest: { status: "requested", requestedAt: "2026-11-11T06:30:00.000Z" } }));
  }) as typeof fetch;
  const unmount = await mount(<OrderDetailView order={order()} />);
  try {
    await act(async () => button("Cancel order")!.click());
    const reason = document.querySelector<HTMLSelectElement>("select[name=reason]")!;
    assert.ok(reason, "a reason is asked for");
    await act(async () => { reason.value = "Ordered by mistake"; reason.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await act(async () => button("Request cancellation")!.click());
    assert.deepEqual(posts, [{ url: `/api/orders/link/${ref}/cancel`, body: { reason: "Ordered by mistake" } }]);
    assert.match(text(), /We’ve asked our team to cancel this order/);
    assert.equal(refreshed, 1);
  } finally { await unmount(); globalThis.fetch = previous; }
});

test("a refused cancel says why and keeps the order as it was", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ code: "CANCELLATION_NOT_AVAILABLE", message: "This order can't be cancelled online any more. Please contact us and our team will help." }, { status: 409 })) as typeof fetch;
  const unmount = await mount(<OrderDetailView order={order()} />);
  try {
    await act(async () => button("Cancel order")!.click());
    await act(async () => button("Request cancellation")!.click());
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /can't be cancelled online/);
    assert.equal(refreshed, 0);
  } finally { await unmount(); globalThis.fetch = previous; }
});

test("a pending or declined request is shown instead of Cancel; an order past confirmed has no Cancel", async () => {
  let unmount = await mount(<OrderDetailView order={order({ canCancel: false, cancelRequest: { status: "requested", requestedAt: "2026-11-11T06:30:00.000Z" } })} />);
  try {
    assert.match(text(), /Cancellation requested on 11 Nov 2026/);
    assert.equal(button("Cancel order"), undefined);
  } finally { await unmount(); }
  unmount = await mount(<OrderDetailView order={order({ canCancel: false, cancelRequest: { status: "declined", requestedAt: "2026-11-11T06:30:00.000Z" } })} />);
  try { assert.match(text(), /couldn’t cancel this order, as it is already being prepared/); } finally { await unmount(); }
  // Staff's note to the buyer replaces the general reason.
  unmount = await mount(<OrderDetailView order={order({ canCancel: false,
    cancelRequest: { status: "declined", requestedAt: "2026-11-11T06:30:00.000Z", note: "Your chairs are already being upholstered." } })} />);
  try {
    assert.match(text(), /couldn’t cancel this order: “Your chairs are already being upholstered\.”/);
    assert.doesNotMatch(text(), /already being prepared/);
  } finally { await unmount(); }
  unmount = await mount(<OrderDetailView order={order({ status: "preparing", canCancel: false })} />);
  try { assert.equal(button("Cancel order"), undefined); } finally { await unmount(); }
});

test("without private links (accounts as before) there is no Track link and no Cancel", async () => {
  const { links: _links, canCancel: _cancel, cancelRequest: _request, ...plain } = order();
  const unmount = await mount(<OrderDetailView order={plain as OrderDetail} />);
  try {
    assert.equal(document.querySelector('a[href$="/tracking"]'), null);
    assert.equal(button("Cancel order"), undefined);
  } finally { await unmount(); }
});

test("tracking shows the courier, the AWB and Shiprocket's page once shipped; before that, what happens next", async () => {
  const shipped: OrderTracking = { order: order({ status: "dispatched" }), shipmentUnavailable: false,
    shipment: { state: "shipped", courierName: "Delhivery", awbCode: "AWB501", trackingUrl: "https://shiprocket.co/tracking/AWB501", trackingStatus: "In transit", shippedAt: "2026-11-16T09:00:00.000Z", deliveredAt: null } };
  let unmount = await mount(<OrderTrackingView tracking={shipped} />);
  try {
    assert.match(text(), /Delhivery/);
    assert.match(text(), /AWB501/);
    assert.match(text(), /In transit/);
    const link = document.querySelector<HTMLAnchorElement>('a[href="https://shiprocket.co/tracking/AWB501"]')!;
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener noreferrer");
    assert.ok(document.querySelector(`a[href="/orders/${ref}"]`), "back to the order");
  } finally { await unmount(); }
  unmount = await mount(<OrderTrackingView tracking={{ order: order(), shipment: null, shipmentUnavailable: false }} />);
  try { assert.match(text(), /We’ll share tracking here once your order is dispatched/); } finally { await unmount(); }
  unmount = await mount(<OrderTrackingView tracking={{ order: order(), shipment: null, shipmentUnavailable: true }} />);
  try { assert.match(text(), /Tracking isn’t available right now/); } finally { await unmount(); }
});
