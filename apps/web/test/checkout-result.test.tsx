import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ShopProvider } from "../components/shop-provider";
import { CheckoutFlow } from "../app/checkout/checkout-flow";
import CheckoutPage from "../app/checkout/page";
import { estimatedArrival } from "../app/checkout/delivery-estimate";
import { formatDayRange } from "../lib/account/format";

// The screens after Razorpay's window: payment received (Figma 392:1752), payment not taken (392:1806) and payment
// awaiting confirmation (459:1337).
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/checkout" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true });
// React DOM loaded before this window, so it watches fields with IE's attachEvent; focusing a field must not throw.
Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });

const options = { deliveryMethods: [{ id: "standard", label: "Standard delivery" }], paymentKeyId: "rzp_test_result" };
const attemptId = "0b8e1c3a-5d2f-4a6b-9c8d-7e6f5a4b3c2d";
const storageKey = "maple-checkout-attempt-v1";
// The cart names a piece by the store's own variant id, Keeri's quote by Keeri's. They differ for a piece carried over from
// the old store (live: Aero's Deep Atlantic is "preview-46728293843133" in the cart) and match for one made in Keeri.
type Line = { variantId: string; keeriVariantId: string; title: string; variantTitle: string; pricePaise: number; quantity: number; image: string };
const chair: Line = { variantId: "preview-46728293843133", keeriVariantId: "keeri:maple:chair-v", title: "Oak Chair", variantTitle: "Natural", pricePaise: 150000,
  quantity: 1, image: "/media/home/category-accent-chair.webp" };
const table: Line = { variantId: "keeri:maple:table-v", keeriVariantId: "keeri:maple:table-v", title: "Teak Side Table", variantTitle: "Default Title", pricePaise: 90000,
  quantity: 2, image: "https://store.maplefurnishers.com/media/keeri/teak-table_01.webp" };
// What /api/cart answers; capture empties it.
let cartLines: Line[] = [];
const cartBody = () => ({
  items: cartLines.map((line) => ({ variantId: line.variantId, handle: line.variantId, title: line.title, variantTitle: line.variantTitle, image: line.image,
    pricePaise: line.pricePaise, quantity: line.quantity, lineTotalPaise: line.pricePaise * line.quantity, available: true, cartable: true, stockPolicy: "made_to_order", leadTimeDays: 28 })),
  itemCount: cartLines.reduce((sum, line) => sum + line.quantity, 0),
  subtotalPaise: cartLines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0),
  currency: "INR", checkoutEnabled: false, mode: "preview", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 },
});
/**
 * Keeri's quote for the lines, as the API gives it: ₹250 delivery, GST added (18%) or included, and each line's store id
 * beside Keeri's. `withoutStoreIds` is an attempt frozen before the API gave them, whose lines carried the store's ids.
 */
function quoteFor(lines: Line[], gstMode: "excluded" | "included", { withoutStoreIds = false } = {}) {
  const subtotalPaise = lines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  const shippingPaise = 25000;
  const taxPaise = gstMode === "excluded" ? Math.round((subtotalPaise + shippingPaise) * 0.18) : Math.round(((subtotalPaise + shippingPaise) * 18) / 118);
  return {
    items: lines.map((line) => ({ ...(withoutStoreIds ? { variantId: line.variantId } : { variantId: line.keeriVariantId, localVariantId: line.variantId }),
      productId: line.keeriVariantId.replace(/-v$/, ""), title: line.title, variantTitle: line.variantTitle, sku: null,
      quantity: line.quantity, unitPricePaise: line.pricePaise, lineTotalPaise: line.pricePaise * line.quantity, fulfilment: { kind: "made_to_order" as const, leadTimeDays: 28 } })),
    delivery: { courierName: "Delhivery Surface", estimatedDays: 6 },
    currency: "INR", subtotalPaise, shippingPaise, taxPaise, totalPaise: subtotalPaise + shippingPaise + (gstMode === "excluded" ? taxPaise : 0), gstMode,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}
type Quote = ReturnType<typeof quoteFor>;
const attempt = (quote: Quote, extra: Record<string, unknown> = {}) => ({ id: attemptId, state: "reservation_required", amountPaise: quote.totalPaise, currency: "INR",
  paid: false, providerOrderId: null, quote, fulfillmentStatus: "pending", orderReference: null, ...extra });
const payable = (quote: Quote) => attempt(quote, { state: "awaiting_payment", providerOrderId: "order_result1" });
const confirmed = (quote: Quote, orderNumber: string | null = "MF-10482") =>
  attempt(quote, { state: "captured", paid: true, providerOrderId: "order_result1", fulfillmentStatus: "confirmed", orderReference: "SO-4004", orderNumber });

type Call = { method: string; path: string; headers: Headers; body: any };
type Razorpay = { options: any; opened: number; events: Record<string, (response: unknown) => void> };
let razorpay: Razorpay | null = null;
class FakeRazorpay {
  constructor(public options: any) { razorpay = { options, opened: 0, events: {} }; }
  on(event: string, handler: (response: unknown) => void) { razorpay!.events[event] = handler; }
  open() { razorpay!.opened++; }
}
/** Each try may come back with a fresh window; the latest one is the one on screen. */
const providerWindow = () => {
  assert.ok(razorpay, "Razorpay's window is open");
  return razorpay!;
};
type Account = { enabled: boolean; prefill: { email: string; name: string; phone: string; address: null } | null };

/** A checkout whose payment is captured once the store receives Razorpay's signed callback. */
function paidRoute(quote: Quote, orderNumber: string | null = "MF-10482") {
  let captured = false;
  return (call: Call) => {
    if (call.path === "/api/checkout") return Response.json(attempt(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(payable(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) {
      captured = true;
      cartLines = [];
      return Response.json(payable(quote), { status: 202 });
    }
    if (call.path === `/api/checkout/${attemptId}`) return Response.json(captured ? confirmed(quote, orderNumber) : payable(quote));
    return new Response(null, { status: 404 });
  };
}
async function mount(route: (call: Call) => Response | Promise<Response>, extra: { keepStorage?: boolean; account?: Account; confirmationWindowMs?: number } = {}) {
  if (!extra.keepStorage) { sessionStorage.clear(); localStorage.clear(); }
  razorpay = null;
  (window as any).Razorpay = FakeRazorpay;
  const calls: Call[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const call = { method: init?.method ?? "GET", path: new URL(String(input), "http://localhost:3000").pathname,
      headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (call.path === "/api/cart") return Response.json(cartBody());
    return route(call);
  };
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider>
    <CheckoutFlow options={options} pollIntervalMs={5} account={extra.account} confirmationWindowMs={extra.confirmationWindowMs} />
  </ShopProvider></AppRouterContext.Provider>));
  return { calls, cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  }
}
const details = { firstName: "Test", lastName: "Buyer", email: "Buyer@Example.test", phone: "9876543210", "shipping.line1": "1 Test Street",
  "shipping.line2": "", "shipping.city": "Mumbai", "shipping.stateCode": "27", "shipping.pincode": "400001" };
const settle = async (ticks = 10) => { for (let i = 0; i < ticks; i++) await act(async () => { await new Promise((r) => setTimeout(r, 8)); }); };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label);
const link = (label: string) => [...document.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === label);
const text = () => document.getElementById("root")!.textContent ?? "";
const result = () => document.querySelector<HTMLElement>("[data-payment-result]");
const card = () => document.querySelector<HTMLElement>(".checkout-result-card")!.textContent ?? "";
/** Details in, quoted, then Razorpay's window opened for the quoted total. */
async function openPayment() {
  fill(details);
  await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
  const pay = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Continue to payment"));
  assert.ok(pay, "the quote can be paid");
  await act(async () => pay!.click());
  assert.equal(providerWindow().opened, 1);
}
async function completePayment() {
  await act(async () => { providerWindow().options.handler({ razorpay_payment_id: "pay_result1", razorpay_order_id: "order_result1", razorpay_signature: "f".repeat(64) }); });
  await settle(12);
}
const orderCalls = (calls: Call[]) => calls.filter((c) => c.path === `/api/checkout/${attemptId}/payment-order`);
const quoteCalls = (calls: Call[]) => calls.filter((c) => c.path === "/api/checkout" && c.method === "POST");
const statusCalls = (calls: Call[]) => calls.filter((c) => c.path === `/api/checkout/${attemptId}` && c.method === "GET");
/** A checkout whose payment Razorpay reports but the store confirms only once `confirm()` is called. */
function slowRoute(quote: Quote) {
  let confirmedNow = false;
  const route = (call: Call) => {
    if (call.path === "/api/checkout") return Response.json(attempt(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(payable(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(payable(quote), { status: 202 });
    if (call.path === `/api/checkout/${attemptId}`) return Response.json(confirmedNow ? confirmed(quote) : payable(quote));
    return new Response(null, { status: 404 });
  };
  return { route, confirm: () => { confirmedNow = true; } };
}
const reportPayment = () =>
  act(async () => { providerWindow().options.handler({ razorpay_payment_id: "pay_pending1", razorpay_order_id: "order_result1", razorpay_signature: "d".repeat(64) }); });
/** The one piece's large photo on a result screen, or null when it shows the "Image unavailable" placeholder. */
const photoSrc = () => document.querySelector<HTMLImageElement>(".checkout-result-photo img")?.getAttribute("src") ?? null;
const thumbSrcs = () => [...document.querySelectorAll<HTMLImageElement>(".checkout-result-thumb img")].map((img) => img.getAttribute("src"));

test("the success screen tells the order number, the email and the estimate, and links to the order and the shop", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "excluded");
  const { cleanup } = await mount(paidRoute(quote));
  try {
    await openPayment();
    await completePayment();
    assert.equal(result()?.dataset.paymentResult, "success");
    assert.match(text(), /Payment received[\s\S]*Something beautiful is on its way\./);
    assert.match(text(), /Thank you, Test\. Your order is confirmed\. We’ve sent the details to buyer@example\.test\./);
    assert.match(document.querySelector(".checkout-result-pill")!.textContent!, /^Order #MF-10482$/);
    // The estimate is the checkout's own, written with long months: "24–28 November 2026".
    const arrival = estimatedArrival(quote, new Date())!;
    const estimate = document.querySelector("[data-estimate]")!.textContent!;
    assert.equal(estimate, formatDayRange(arrival.from, arrival.to, { month: "long" }));
    assert.match(estimate, /(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/);
    assert.match(text(), /Estimated delivery/);
    assert.equal(link("View order details")?.getAttribute("href"), `/orders/${attemptId}`, "a guest follows the order status page");
    assert.equal(link("Continue shopping")?.getAttribute("href"), "/collections/all");
    // One piece: pictured large, then its name, the variant and quantity, the totals as quoted.
    assert.match(card(), /^Your piece, thoughtfully chosen\./);
    assert.equal(photoSrc(), chair.image, "the piece is pictured as the cart showed it, though Keeri's quote names it by another id");
    assert.match(card(), /Oak Chair[\s\S]*Natural · Quantity 1/);
    assert.match(card(), /Subtotal\s*₹1,500[\s\S]*Delivery\s*₹250[\s\S]*GST\s*₹315[\s\S]*Total paid\s*₹2,065[\s\S]*GST is added as shown/);
    assert.equal(document.activeElement, document.querySelector("[data-checkout-result-heading]"), "the heading takes the focus Razorpay's window left");
    assert.ok(![...document.querySelectorAll("button")].some((b) => /Continue to payment|Try payment again/.test(b.textContent ?? "")), "nothing offers to pay again");
  } finally { await cleanup(); }
});

test("a signed-in customer's order details open in their account", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "included");
  const account = { enabled: true, prefill: { email: "aditi.sharma@example.com", name: "Aditi Sharma", phone: "+919876543210", address: null } };
  let { cleanup } = await mount(paidRoute(quote), { account });
  try {
    fill({ "shipping.line1": "14 Palm Avenue", "shipping.city": "Bengaluru", "shipping.stateCode": "29", "shipping.pincode": "560001" });
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Continue to payment"))!.click());
    await completePayment();
    assert.match(text(), /Thank you, Aditi\./);
    assert.equal(link("View order details")?.getAttribute("href"), "/account/orders/MF-10482");
    assert.match(card(), /Total paid\s*₹1,750[\s\S]*Inclusive of applicable taxes/);
  } finally { await cleanup(); }
  // Before Maple's number exists the account cannot show the order yet: the status page does.
  cartLines = [chair];
  ({ cleanup } = await mount(paidRoute(quote, null), { account }));
  try {
    fill({ "shipping.line1": "14 Palm Avenue", "shipping.city": "Bengaluru", "shipping.stateCode": "29", "shipping.pincode": "560001" });
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Continue to payment"))!.click());
    await completePayment();
    assert.match(document.querySelector(".checkout-result-pill")!.textContent!, /^Order #SO-4004$/);
    assert.equal(link("View order details")?.getAttribute("href"), `/orders/${attemptId}`);
  } finally { await cleanup(); }
});

test("the pieces' photos survive the cart that capture empties, through a reload too", async () => {
  cartLines = [chair, table];
  const quote = quoteFor([chair, table], "included");
  let { calls, cleanup } = await mount(paidRoute(quote));
  try {
    await openPayment();
    await completePayment();
    assert.equal(result()?.dataset.paymentResult, "success");
    assert.ok(calls.filter((c) => c.path === "/api/cart").length >= 2, "the emptied cart was loaded again after capture");
    // Several pieces: a list of small photos, names, variant and quantity, and each line's price.
    assert.match(card(), /^Your pieces, thoughtfully chosen\./);
    assert.equal(document.querySelector(".checkout-result-photo"), null, "no single large photo");
    const lines = [...document.querySelectorAll(".checkout-result-line")].map((line) => line.textContent);
    assert.deepEqual(lines, ["Oak ChairNatural · Quantity 1₹1,500", "Teak Side TableQuantity 2₹1,800"]);
    assert.deepEqual(thumbSrcs(), [chair.image, table.image], "each line keeps the photo the cart showed, whether or not Keeri's id matches the store's");
    assert.match(card(), /Total paid\s*₹3,550/);
  } finally { await cleanup(); }

  // The same order, reloaded while the payment is still being confirmed: capture has already emptied the cart.
  cartLines = [chair, table];
  let orderConfirmed = false;
  const route = (call: Call) => {
    if (call.path === "/api/checkout") return Response.json(attempt(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(payable(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) {
      cartLines = [];
      return Response.json(payable(quote), { status: 202 });
    }
    if (call.path === `/api/checkout/${attemptId}`) return Response.json(orderConfirmed ? confirmed(quote) : payable(quote));
    return new Response(null, { status: 404 });
  };
  ({ calls, cleanup } = await mount(route));
  try {
    await openPayment();
    await act(async () => { providerWindow().options.handler({ razorpay_payment_id: "pay_result2", razorpay_order_id: "order_result1", razorpay_signature: "e".repeat(64) }); });
    await settle(2);
    assert.equal(result()?.dataset.paymentResult, "pending");
    assert.match(text(), /We’re checking your payment\./);
    assert.deepEqual(thumbSrcs(), [chair.image, table.image], "the pending screen pictures the pieces too");
    assert.ok(sessionStorage.getItem(storageKey), "the attempt in flight survives a reload");
  } finally { await cleanup(); }
  assert.deepEqual(cartLines, [], "capture emptied the cart");
  orderConfirmed = true;
  ({ calls, cleanup } = await mount(route, { keepStorage: true }));
  try {
    await settle(12);
    assert.equal(result()?.dataset.paymentResult, "success");
    assert.equal(quoteCalls(calls).length + orderCalls(calls).length, 0, "the reload neither quotes nor pays again");
    assert.deepEqual(thumbSrcs(), [chair.image, table.image]);
  } finally { await cleanup(); }
});

test("before payment, the priced summary pictures each piece by the cart's photo, whatever Keeri calls it", async () => {
  cartLines = [chair, table];
  const { cleanup } = await mount(paidRoute(quoteFor([chair, table], "included")));
  try {
    fill(details);
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    assert.ok([...document.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Continue to payment")), "quoted");
    const photos = [...document.querySelectorAll<HTMLImageElement>("[data-checkout-summary] .checkout-line-photo img")].map((img) => img.getAttribute("src"));
    assert.deepEqual(photos, [chair.image, table.image]);
  } finally { await cleanup(); }
});

test("an attempt frozen before the API gave the store's ids still pictures its pieces by their own ids", async () => {
  cartLines = [chair, table];
  const quote = quoteFor([chair, table], "included", { withoutStoreIds: true });
  assert.ok(quote.items.every((item) => !("localVariantId" in item)));
  const { cleanup } = await mount(paidRoute(quote));
  try {
    await openPayment();
    await act(async () => { providerWindow().options.modal.ondismiss(); });
    assert.equal(result()?.dataset.paymentReason, "dismissed");
    assert.deepEqual(thumbSrcs(), [chair.image, table.image]);
  } finally { await cleanup(); }
});

test("a failed try, then closing the window, shows the failure screen; trying again reopens payment for the same attempt", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "excluded");
  const { calls, cleanup } = await mount(paidRoute(quote));
  try {
    await openPayment();
    const first = providerWindow();
    assert.equal(typeof first.events["payment.failed"], "function", "the checkout listens for failed tries");
    await act(async () => { first.events["payment.failed"]!({ error: { code: "BAD_REQUEST_ERROR", description: "Payment failed", reason: "payment_failed", metadata: { order_id: "order_result1", payment_id: "pay_x" } } }); });
    assert.equal(result(), null, "a failed try leaves Razorpay's window open for another");
    await act(async () => { first.options.modal.ondismiss(); });
    assert.equal(result()?.dataset.paymentResult, "failed");
    assert.equal(result()?.dataset.paymentReason, "failed");
    assert.match(text(), /Payment incomplete[\s\S]*Payment didn’t go through\.[\s\S]*We couldn’t confirm your payment\. Your bag and delivery details are saved\./);
    assert.equal(document.querySelector(".checkout-result-pill")!.textContent, "Payment failed");
    assert.match(text(), /Amount to pay · ₹2,065/);
    // Before capture there is no order number: the reference is the attempt's.
    assert.match(text(), /If money was debited, check the payment status before trying again\. Contact us with reference PAY-0B8E1C3A if you need help\./);
    assert.equal(link("Check payment status")?.getAttribute("href"), `/orders/${attemptId}`);
    assert.equal(link("Get help")?.getAttribute("href"), "/contact");
    assert.match(card(), /^Your bag is saved\.[\s\S]*Oak Chair[\s\S]*Total to pay\s*₹2,065/);
    assert.equal(photoSrc(), chair.image, "the bag's photo");
    assert.equal(document.activeElement, document.querySelector("[data-checkout-result-heading]"));
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    assert.equal(stored?.attemptId, attemptId, "the attempt survives a reload");
    assert.equal(stored?.submitted, false);

    await act(async () => button("Try payment again")!.click());
    assert.equal(orderCalls(calls).length, 2, "the same attempt is asked for its payment order again");
    assert.ok(orderCalls(calls).every((c) => c.method === "POST"));
    assert.equal(quoteCalls(calls).length, 1, "no new quote, hold or attempt");
    const second = providerWindow();
    assert.notEqual(second, first, "a fresh Razorpay session");
    assert.equal(second.opened, 1);
    assert.equal(second.options.order_id, "order_result1");
    assert.equal(second.options.amount, quote.totalPaise);
    assert.equal(result()?.dataset.paymentResult, "failed", "the failure screen stays behind the window");
    assert.equal(button("Try payment again")!.disabled, true, "no second window while one is open");
    assert.equal(button("Choose another method")!.disabled, true);
    await completePayment();
    assert.equal(result()?.dataset.paymentResult, "success");
    assert.match(text(), /Order #MF-10482/);
  } finally { await cleanup(); }
});

test("closing the window without a failed try says the payment was not completed, never that money was taken", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "included");
  const { calls, cleanup } = await mount(paidRoute(quote));
  try {
    await openPayment();
    await act(async () => { providerWindow().options.modal.ondismiss(); });
    assert.equal(result()?.dataset.paymentResult, "failed");
    assert.equal(result()?.dataset.paymentReason, "dismissed");
    assert.equal(document.querySelector(".checkout-result-pill")!.textContent, "Payment not completed");
    assert.match(text(), /Payment wasn’t completed\.[\s\S]*Your bag and delivery details are saved\./);
    assert.match(text(), /Amount to pay · ₹1,750/);
    assert.match(text(), /Contact us with reference PAY-0B8E1C3A if you need help\./);
    assert.doesNotMatch(text(), /debited|charged|refund|money was|didn’t go through/i);
    assert.match(card(), /Total to pay\s*₹1,750[\s\S]*Inclusive of applicable taxes/);
    // The owner's report (13 Nov 2026): this screen showed "Image unavailable" for Aero's Deep Atlantic, whose ids differ.
    assert.equal(photoSrc(), chair.image, "the bag's photo, not the placeholder");
    assert.equal(document.querySelector(".checkout-result-card [data-image-placeholder]"), null);
    // "Choose another method" opens Razorpay's window again for the same attempt, where every way to pay is offered.
    const first = providerWindow();
    await act(async () => button("Choose another method")!.click());
    assert.equal(orderCalls(calls).length, 2);
    assert.notEqual(providerWindow(), first);
    assert.equal(providerWindow().opened, 1);
    await act(async () => { providerWindow().options.modal.ondismiss(); });
    assert.equal(result()?.dataset.paymentReason, "dismissed");
    assert.equal(button("Try payment again")!.disabled, false);
  } finally { await cleanup(); }
});

test("from the failure screen a reload resumes the same attempt, and a payment captured late is never taken twice", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "excluded");
  let captured = false;
  const route = (call: Call) => {
    if (call.path === "/api/checkout") return Response.json(attempt(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(payable(quote));
    if (call.path === `/api/checkout/${attemptId}`) return Response.json(captured ? confirmed(quote) : payable(quote));
    return new Response(null, { status: 404 });
  };
  let { calls, cleanup } = await mount(route);
  try {
    await openPayment();
    await act(async () => { providerWindow().events["payment.failed"]!({ error: { code: "BAD_REQUEST_ERROR" } }); });
    await act(async () => { providerWindow().options.modal.ondismiss(); });
    assert.equal(result()?.dataset.paymentReason, "failed");
  } finally { await cleanup(); }
  // A reload: the stored attempt is still payable, so the buyer is back at its quote, not at a new one. Even a damaged
  // list of photos never costs the attempt.
  const stored = JSON.parse(sessionStorage.getItem(storageKey)!);
  assert.deepEqual(stored.photos, { [chair.variantId]: chair.image }, "the photos are kept with the attempt");
  sessionStorage.setItem(storageKey, JSON.stringify({ ...stored, photos: { [chair.variantId]: 42 } }));
  ({ calls, cleanup } = await mount(route, { keepStorage: true }));
  try {
    await settle(6);
    assert.equal(result(), null);
    assert.ok([...document.querySelectorAll("button")].some((b) => b.textContent === "Continue to payment · ₹2,065"), "the same total, ready to pay");
    assert.equal(quoteCalls(calls).length, 0, "no second quote or hold");
    assert.equal(orderCalls(calls).length, 0, "no payment until the buyer asks");
    assert.equal(JSON.parse(sessionStorage.getItem(storageKey) ?? "null")?.attemptId, attemptId);
  } finally { await cleanup(); }
  // Back on the failure screen, the payment turns out to have been captured after all (a bank's late answer).
  ({ calls, cleanup } = await mount(route));
  try {
    await openPayment();
    await act(async () => { providerWindow().options.modal.ondismiss(); });
    assert.equal(result()?.dataset.paymentResult, "failed");
    captured = true;
    // The screen keeps watching the attempt, as the quote does, once a second.
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
    await settle(12);
    assert.equal(result()?.dataset.paymentResult, "success", "a captured payment is confirmed, not offered again");
    assert.equal(button("Try payment again"), undefined);
    assert.equal(orderCalls(calls).length, 1);
  } finally { await cleanup(); }
  // And a reload after such a capture confirms it rather than offering payment.
  captured = false;
  ({ calls, cleanup } = await mount(route));
  try {
    await openPayment();
    await act(async () => { providerWindow().options.modal.ondismiss(); });
  } finally { await cleanup(); }
  captured = true;
  ({ calls, cleanup } = await mount(route, { keepStorage: true }));
  try {
    await settle(12);
    assert.equal(result()?.dataset.paymentResult, "success");
    assert.equal(orderCalls(calls).length, 0);
  } finally { await cleanup(); }
});

test("a payment Razorpay reported but the store has not confirmed shows the pending screen; asking again checks at once", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "included");
  const { route, confirm } = slowRoute(quote);
  const { calls, cleanup } = await mount(route);
  try {
    await openPayment();
    await reportPayment();
    await settle(2);
    assert.equal(result()?.dataset.paymentResult, "pending");
    assert.match(text(), /Payment in progressWe’re checking your payment\.Our store is confirming your payment\. Your order details are saved\./);
    assert.doesNotMatch(text(), /bank/, "the store confirms the payment, not the buyer's bank");
    assert.match(text(), /Awaiting confirmationPayment amount · ₹1,750Please don’t pay again while we verify this transaction\. We’ll email you as soon as the payment status is confirmed\./);
    // Before Maple's number exists, the reference is the attempt's; the full checkout reference and the order page follow.
    assert.match(text(), /Payment reference · PAY-0B8E1C3A/);
    assert.match(text(), new RegExp(`Checkout reference · ${attemptId}`));
    assert.equal(link("View order status")?.getAttribute("href"), `/orders/${attemptId}`);
    assert.match(card(), /^Your order is on hold\./);
    assert.match(card(), /Payment pending\s*₹1,750/);
    assert.equal(link("Contact support")?.getAttribute("href"), "/contact?product=Payment+PAY-0B8E1C3A#contact-enquiry");
    assert.ok(document.activeElement?.hasAttribute("data-checkout-result-heading"), "the heading takes focus after Razorpay's window");
    assert.match(document.querySelector<HTMLImageElement>(".checkout-result-icon")!.getAttribute("src")!, /payment-pending\.svg$/);

    const before = statusCalls(calls).length;
    await act(async () => button("Check payment status")!.click());
    await settle(2);
    assert.ok(statusCalls(calls).length > before, "the store is asked again");
    assert.match(text(), /Still awaiting confirmation at .+\. We’ll keep checking\./);
    assert.doesNotMatch(text(), /couldn’t check/);
    assert.equal(result()?.dataset.paymentResult, "pending");

    confirm();
    await settle(6);
    assert.equal(result()?.dataset.paymentResult, "success", "the watch carries on and shows the confirmed order");
    assert.equal(orderCalls(calls).length, 1, "never a second payment");
  } finally { await cleanup(); }
});

test("when confirmation outlasts the checkout's wait, the pending screen stays and asking again watches once more", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "excluded");
  const { route, confirm } = slowRoute(quote);
  const { calls, cleanup } = await mount(route, { confirmationWindowMs: 40 });
  try {
    await openPayment();
    await reportPayment();
    await settle(12);
    assert.equal(result()?.dataset.paymentResult, "pending", "the pending screen, not a notice");
    assert.doesNotMatch(text(), /Still awaiting confirmation at/, "nothing was asked yet");
    const stopped = statusCalls(calls).length;
    await settle(4);
    assert.equal(statusCalls(calls).length, stopped, "the watch has stopped");

    await act(async () => button("Check payment status")!.click());
    await settle(2);
    assert.ok(statusCalls(calls).length > stopped, "asking again checks the store");
    assert.match(text(), /Still awaiting confirmation at /);

    // The new watch runs out too, and the answer no longer promises checks that will not come; a confirmation after it
    // shows once the buyer asks again.
    await settle(10);
    assert.match(text(), /Still awaiting confirmation at .+\. Check again any time\./);
    assert.doesNotMatch(text(), /We’ll keep checking/);
    const ranOut = statusCalls(calls).length;
    confirm();
    await settle(4);
    assert.equal(statusCalls(calls).length, ranOut, "nothing more is asked after the new watch");
    assert.equal(result()?.dataset.paymentResult, "pending");
    await act(async () => button("Check payment status")!.click());
    await settle(4);
    assert.equal(result()?.dataset.paymentResult, "success");
    assert.equal(orderCalls(calls).length, 1, "never a second payment");
  } finally { await cleanup(); }
});

test("a check that cannot reach the store says so, never that the payment is still awaiting confirmation", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "included");
  let failure: "network" | "server" | null = null;
  const { calls, cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(payable(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(payable(quote), { status: 202 });
    if (call.path === `/api/checkout/${attemptId}`) {
      if (failure === "network") throw new TypeError("Failed to fetch");
      if (failure === "server") return new Response("upstream down", { status: 502 });
      return Response.json(payable(quote));
    }
    return new Response(null, { status: 404 });
  });
  try {
    await openPayment();
    await reportPayment();
    await settle(2);
    assert.equal(result()?.dataset.paymentResult, "pending");
    const status = () => document.querySelector<HTMLElement>(".checkout-result-checked[role='status']")!.textContent;

    failure = "network";
    await act(async () => button("Check payment status")!.click());
    await settle(2);
    assert.equal(status(), "We couldn’t check just now. Please try again in a moment.");
    assert.doesNotMatch(text(), /Still awaiting confirmation/);

    failure = "server";
    await act(async () => button("Check payment status")!.click());
    await settle(2);
    assert.equal(status(), "We couldn’t check just now. Please try again in a moment.", "a 5xx is a failed check too");

    failure = null;
    await act(async () => button("Check payment status")!.click());
    await settle(2);
    assert.match(status() ?? "", /^Still awaiting confirmation at .+\. We’ll keep checking\.$/, "a real answer replaces the failure");
    assert.equal(result()?.dataset.paymentResult, "pending");
    assert.equal(orderCalls(calls).length, 1, "never a second payment");
    assert.equal(calls.filter((c) => c.path === `/api/checkout/${attemptId}/payment-callback`).length, 1, "checking only reads the status");
  } finally { await cleanup(); }
});

test("after the watch runs out, a reload comes back to the pending screen with the order link, never to a fresh checkout", async () => {
  cartLines = [chair];
  const quote = quoteFor([chair], "included");
  const { route, confirm } = slowRoute(quote);
  const first = await mount(route, { confirmationWindowMs: 40 });
  try {
    await openPayment();
    await reportPayment();
    await settle(12);
    assert.equal(result()?.dataset.paymentResult, "pending");
    const stopped = statusCalls(first.calls).length;
    await settle(4);
    assert.equal(statusCalls(first.calls).length, stopped, "the watch has run out");
    assert.equal(link("View order status")?.getAttribute("href"), `/orders/${attemptId}`, "the way back to the order");
    assert.match(text(), new RegExp(`Checkout reference · ${attemptId}`));
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    assert.equal(stored?.attemptId, attemptId, "the checkout stays saved after the watch runs out");
    assert.equal(stored?.submitted, true);
  } finally { await first.cleanup(); }

  const second = await mount(route, { keepStorage: true, confirmationWindowMs: 40 });
  try {
    await settle(4);
    assert.equal(result()?.dataset.paymentResult, "pending", "the reload returns to the pending screen");
    assert.ok(!document.querySelector("form"), "never the details form with the cart still full");
    assert.equal(link("View order status")?.getAttribute("href"), `/orders/${attemptId}`);
    assert.equal(quoteCalls(second.calls).length, 0, "no second quote");
    assert.equal(orderCalls(second.calls).length, 0, "no second payment");
    await settle(10);
    assert.ok(sessionStorage.getItem(storageKey), "still saved once the resumed watch runs out");

    confirm();
    await act(async () => button("Check payment status")!.click());
    await settle(6);
    assert.equal(result()?.dataset.paymentResult, "success", "asking again after the reload still finds the order");
    assert.equal(orderCalls(second.calls).length, 0, "never a second payment");
  } finally { await second.cleanup(); }
});

/** The pending screen, the buyer on its button, then the store's next answer `next`. */
async function pendingThen(next: (quote: Quote) => object) {
  cartLines = [chair];
  const quote = quoteFor([chair], "included");
  let moved = false;
  const scrolled: Element[] = [];
  const original = (window.HTMLElement.prototype as any).scrollIntoView;
  (window.HTMLElement.prototype as any).scrollIntoView = function (this: Element) { scrolled.push(this); };
  const { calls, cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(payable(quote));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(payable(quote), { status: 202 });
    if (call.path === `/api/checkout/${attemptId}`) return Response.json(moved ? next(quote) : payable(quote));
    return new Response(null, { status: 404 });
  });
  await openPayment();
  await reportPayment();
  await settle(2);
  assert.equal(result()?.dataset.paymentResult, "pending");
  await act(async () => button("Check payment status")!.focus());
  scrolled.length = 0;
  moved = true;
  await settle(6);
  return {
    calls, scrolled,
    cleanup: async () => {
      (window.HTMLElement.prototype as any).scrollIntoView = original;
      await cleanup();
    },
  };
}

test("when the store receives the money, the pending screen gives way to the payment-received notice, whose heading takes focus", async () => {
  const { calls, scrolled, cleanup } = await pendingThen((quote) => attempt(quote, { state: "captured", paid: true, providerOrderId: "order_result1" }));
  try {
    assert.equal(result(), null, "the pending screen has gone");
    assert.match(text(), /Payment receivedConfirming your order with our team\. This usually takes a moment\./);
    assert.equal(document.activeElement?.tagName, "H1");
    assert.equal(document.activeElement?.textContent, "Payment received", "focus moves to the notice's heading");
    assert.ok(scrolled.some((el) => el.hasAttribute("data-checkout")), "the notice starts at the top");
    assert.ok(document.querySelector("[role='status']"), "the notice is announced");
    assert.equal(orderCalls(calls).length, 1);
  } finally { await cleanup(); }
});

test("when the store sends the payment to team review, the review notice replaces the pending screen and its heading takes focus", async () => {
  const { calls, scrolled, cleanup } = await pendingThen((quote) => attempt(quote, { state: "reconciliation_required", providerOrderId: "order_result1" }));
  try {
    assert.equal(result(), null, "the pending screen has gone");
    assert.match(text(), /Your payment is still being confirmed/);
    assert.match(text(), /Our team is checking this payment and order\. You don't need to pay again\./);
    assert.equal(document.activeElement?.tagName, "H1");
    assert.equal(document.activeElement?.textContent, "Your payment is still being confirmed", "focus moves to the notice's heading");
    assert.ok(scrolled.some((el) => el.hasAttribute("data-checkout")), "the notice starts at the top");
    assert.equal(link("View order status")?.getAttribute("href"), `/orders/${attemptId}`);
    assert.equal(orderCalls(calls).length, 1);
  } finally { await cleanup(); }
});

/** The checkout page as a local development server renders it while the API keeps checkout closed. */
async function renderPreview(preview: string) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) =>
    new URL(String(input)).pathname === "/api/health"
      ? Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: false })
      : new Response(null, { status: 404 });
  try {
    const page = await CheckoutPage({ searchParams: Promise.resolve({ preview }) });
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
    const stream = await renderToReadableStream(<AppRouterContext.Provider value={router}><ShopProvider>{page}</ShopProvider></AppRouterContext.Provider>);
    const html = (await new Response(stream).text()).replace(/<!--.*?-->/g, "");
    return { html, words: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
  } finally {
    globalThis.fetch = previous;
  }
}

test("on a local development server, ?preview=success, success-multi, failure and pending show the screens with the sample order", async () => {
  const success = await renderPreview("success");
  assert.match(success.html, /data-payment-result="success"/);
  assert.match(success.words, /Thank you, Aditi\. Your order is confirmed\. We’ve sent the details to aditi\.sharma@example\.com\./);
  assert.match(success.words, /Order #MF-10482/);
  assert.match(success.words, /Estimated delivery \d{1,2}[–\d\s]*[A-Z][a-z]+ /);
  assert.match(success.words, /Your piece, thoughtfully chosen\. .*Nola Accent Chair Natural cane · Oak finish · Quantity 1/);
  assert.match(success.words, /Subtotal ₹24,900 Delivery ₹1,500 Total paid ₹26,400 Inclusive of applicable taxes/);
  assert.match(success.html, /src="\/media\/previews\/nola-accent-chair\.webp"/);
  assert.match(success.html, /src="\/account\/payment-success\.svg"/);

  const several = await renderPreview("success-multi");
  assert.match(several.words, /Your pieces, thoughtfully chosen\. .*Nola Accent Chair .*₹24,900 .*Nimbus Modular Sofa .*₹89,900/);
  assert.match(several.words, /Total paid ₹1,16,300/);
  assert.doesNotMatch(several.html, /checkout-result-photo/);

  const failure = await renderPreview("failure");
  assert.match(failure.html, /data-payment-result="failed"/);
  assert.match(failure.words, /Payment didn’t go through\. .*Payment failed .*Amount to pay · ₹26,400/);
  assert.match(failure.words, /Contact us with reference PAY-10482 if you need help\./);
  assert.match(failure.words, /Try payment again .*Choose another method .*Check payment status .*Get help/);
  assert.match(failure.words, /Your bag is saved\. .*Total to pay ₹26,400/);
  assert.match(failure.html, /src="\/account\/payment-failed\.svg"/);

  assert.match((await renderPreview("failure-dismissed")).words, /Payment wasn’t completed\. .*Payment not completed/);

  const pending = await renderPreview("pending");
  assert.match(pending.html, /data-payment-result="pending"/);
  assert.match(pending.words, /Payment in progress We’re checking your payment\. Our store is confirming your payment\. Your order details are saved\. Awaiting confirmation Payment amount · ₹26,400/);
  assert.match(pending.words, /Please don’t pay again while we verify this transaction\. We’ll email you as soon as the payment status is confirmed\. Check payment status Contact support .*View order status Payment reference · PAY-10482 Checkout reference · /);
  assert.match(pending.words, /Your order is on hold\. .*Nola Accent Chair Natural cane · Oak finish · Quantity 1 Subtotal ₹24,900 Delivery ₹1,500 Payment pending ₹26,400 Inclusive of applicable taxes/);
  assert.match(pending.html, /src="\/account\/payment-pending\.svg"/);
  assert.match((await renderPreview("other")).words, /Checkout is not open in this preview/);
});

test("a production build never shows ?preview=pending (or the other result previews): the closed checkout instead", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    for (const preview of ["pending", "success", "failure"]) {
      const page = await renderPreview(preview);
      assert.doesNotMatch(page.html, /data-payment-result/, `?preview=${preview} renders no result screen`);
      assert.doesNotMatch(page.words, /We’re checking your payment|PAY-10482|Nola Accent Chair/);
      assert.match(page.words, /Checkout is not open in this preview/);
    }
  } finally {
    env.NODE_ENV = previous;
  }
  assert.match((await renderPreview("pending")).html, /data-payment-result="pending"/, "a development server still shows it");
});
