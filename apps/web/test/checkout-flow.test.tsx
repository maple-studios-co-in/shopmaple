import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/checkout" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true });
// React DOM loads after the window exists, so it sees the browser's input events (the promo code field is controlled).
const { createRoot } = await import("react-dom/client");
const { ShopProvider } = await import("../components/shop-provider");
const { CheckoutFlow } = await import("../app/checkout/checkout-flow");
const options = { deliveryMethods: [{ id: "standard", label: "Standard delivery" }, { id: "white-glove", label: "White glove delivery" }], paymentKeyId: "rzp_test_flow" };
const attemptId = "0b8e1c3a-5d2f-4a6b-9c8d-7e6f5a4b3c2d";
const line = { variantId: "keeri:maple:chair-v", handle: "oak-chair", title: "Oak Chair", variantTitle: "Natural", image: "",
  pricePaise: 150000, quantity: 2, lineTotalPaise: 300000, available: true, cartable: true, stockPolicy: "stocked" };
const cart = { items: [line], itemCount: 2, subtotalPaise: 300000, currency: "INR", checkoutEnabled: false, mode: "preview",
  mutationContext: { cartIdentity: "a".repeat(64), revision: 0 } };
const quote = {
  items: [{ variantId: "keeri:maple:chair-v", productId: "keeri:maple:chair", title: "Oak Chair", variantTitle: "Natural", sku: "OAK-1",
    quantity: 2, unitPricePaise: 150000, lineTotalPaise: 300000, hsn: "9401", taxRateBps: 1800 }],
  currency: "INR", subtotalPaise: 300000, shippingPaise: 25000, taxPaise: 58500, totalPaise: 383500, gstMode: "excluded",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
};
const attempt = (extra: Record<string, unknown> = {}) => ({ id: attemptId, state: "reservation_required", amountPaise: 383500, currency: "INR",
  paid: false, providerOrderId: null, quote, fulfillmentStatus: "pending", orderReference: null, ...extra });
type Call = { method: string; path: string; headers: Headers; body: any };
type Razorpay = { options: any; opened: number; events: Record<string, (response: unknown) => void> };
let razorpay: Razorpay | null = null;
class FakeRazorpay {
  constructor(public options: any) { razorpay = { options, opened: 0, events: {} }; }
  on(event: string, handler: (response: unknown) => void) { razorpay!.events[event] = handler; }
  open() { razorpay!.opened++; }
}
const field = (name: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label);
const text = () => document.getElementById("root")!.textContent ?? "";
// The single page's primary action carries the server total once the quote is in (Figma 394:1310).
const pay = "Continue to payment · ₹3,835";
const payButton = () => {
  const found = button(pay);
  assert.ok(found, `"${pay}" is offered`);
  return found!;
};
const link = (label: string) => [...document.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === label);
const storageKey = "maple-checkout-attempt-v1";
type Account = { enabled: boolean; prefill: { email: string; name: string; phone: string; address: { line1: string; line2: string; city: string; stateCode: string; pincode: string } | null } | null };
async function mount(route: (call: Call) => Response | Promise<Response>, extra: { confirmationWindowMs?: number; keepStorage?: boolean; account?: Account } = {}) {
  if (!extra.keepStorage) { sessionStorage.clear(); localStorage.clear(); }
  razorpay = null;
  (window as any).Razorpay = FakeRazorpay;
  const calls: Call[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const call = { method: init?.method ?? "GET", path: new URL(String(input), "http://localhost:3000").pathname,
      headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (call.path === "/api/cart") return Response.json(cart);
    return route(call);
  };
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider>
    <CheckoutFlow options={options} pollIntervalMs={5} confirmationWindowMs={extra.confirmationWindowMs} account={extra.account} />
  </ShopProvider></AppRouterContext.Provider>));
  return { calls, cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const element = field(name);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  }
}
// The form asks for first and last name (frame 30:492); the order keeps one name.
const details = { firstName: "Test", lastName: "Buyer", email: "Buyer@Example.test", phone: "9876543210", "shipping.line1": "1 Test Street",
  "shipping.line2": "", "shipping.city": "Mumbai", "shipping.stateCode": "27", "shipping.pincode": "400001" };
async function submitDetails() {
  fill(details);
  await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
}
const settle = async (ticks = 10) => { for (let i = 0; i < ticks; i++) await act(async () => { await new Promise((r) => setTimeout(r, 8)); }); };

test("details are validated locally and sent once as a normalized quote request with an idempotency key", async () => {
  const { calls, cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(attempt()) : new Response(null, { status: 404 }));
  try {
    assert.match(text(), /Oak Chair/);
    assert.match(text(), /2 items/);
    fill({ ...details, "shipping.pincode": "40001" });
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    assert.equal(calls.filter((c) => c.path === "/api/checkout").length, 0, "an invalid pincode never reaches the API");
    assert.match(text(), /pincode/i);
    await submitDetails();
    const posted = calls.filter((c) => c.path === "/api/checkout" && c.method === "POST");
    assert.equal(posted.length, 1);
    assert.match(posted[0]!.headers.get("Idempotency-Key") ?? "", /^[A-Za-z0-9_-]{8,128}$/);
    assert.deepEqual(posted[0]!.body, {
      customer: { name: "Test Buyer", email: "buyer@example.test", phone: "+919876543210" },
      shippingAddress: { line1: "1 Test Street", line2: "", city: "Mumbai", stateCode: "27", pincode: "400001", country: "IN" },
      billingAddress: { line1: "1 Test Street", line2: "", city: "Mumbai", stateCode: "27", pincode: "400001", country: "IN" },
      deliveryMethodId: "standard",
    });
    assert.match(text(), /Oak Chair/);
    assert.match(text(), /3,000/);
    assert.match(text(), /250/);
    assert.match(text(), /585/);
    assert.match(text(), /3,835/);
    assert.ok(button(pay), "the pay button carries the server total");
  } finally { await cleanup(); }
});

test("a separate billing address and chosen delivery method are sent exactly as entered", async () => {
  const { calls, cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(attempt()) : new Response(null, { status: 404 }));
  try {
    fill(details);
    await act(async () => { field("sameBilling").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    fill({ "billing.line1": "Flat 2, Office Tower", "billing.line2": "Nariman Point", "billing.city": "Mumbai", "billing.stateCode": "27", "billing.pincode": "400021" });
    await act(async () => { (document.querySelector('input[name="deliveryMethodId"][value="white-glove"]') as HTMLInputElement).click(); });
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    const posted = calls.find((c) => c.path === "/api/checkout" && c.method === "POST")!;
    assert.equal(posted.body.deliveryMethodId, "white-glove");
    assert.deepEqual(posted.body.billingAddress, { line1: "Flat 2, Office Tower", line2: "Nariman Point", city: "Mumbai", stateCode: "27", pincode: "400021", country: "IN" });
    assert.equal(posted.body.shippingAddress.line1, "1 Test Street");
  } finally { await cleanup(); }
});

test("payment opens the hosted provider with the server order and confirms the Keeri order reference", async () => {
  let polls = 0;
  const { calls, cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow1" }));
    if (call.path === `/api/checkout/${attemptId}`) {
      polls++;
      if (polls === 1) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow1" }));
      if (polls === 2) return Response.json(attempt({ state: "captured", paid: true, providerOrderId: "order_flow1" }));
      return Response.json(attempt({ state: "captured", paid: true, providerOrderId: "order_flow1", fulfillmentStatus: "confirmed", orderReference: "SO-1001" }));
    }
    return new Response(null, { status: 404 });
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    const created = calls.find((c) => c.path === `/api/checkout/${attemptId}/payment-order`)!;
    assert.equal(created.method, "POST");
    assert.deepEqual(created.body, {});
    assert.ok(razorpay, "the hosted checkout is opened");
    assert.equal(razorpay!.opened, 1);
    assert.equal(razorpay!.options.key, "rzp_test_flow");
    assert.equal(razorpay!.options.order_id, "order_flow1");
    assert.equal(razorpay!.options.amount, 383500);
    assert.equal(razorpay!.options.currency, "INR");
    assert.deepEqual(razorpay!.options.prefill, { name: "Test Buyer", email: "buyer@example.test", contact: "+919876543210" });
    assert.equal(typeof razorpay!.options.handler, "function");
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_flow1", razorpay_order_id: "order_flow1", razorpay_signature: "f".repeat(64) }); });
    await settle(12);
    assert.match(text(), /Order #SO-1001/, "without Maple's number yet, the order is told by its reference");
    assert.match(text(), /Payment received[\s\S]*Something beautiful is on its way\.[\s\S]*Your order is confirmed\./);
    assert.ok(!button(pay), "a confirmed order cannot be paid twice");
    assert.ok(polls >= 3);
    assert.ok(calls.every((c) => c.path !== "/api/webhooks/razorpay"), "the browser never posts payment evidence itself");
  } finally { await cleanup(); }
});

test("a dismissed payment can be retried, and a blocked checkout is explained without opening payment", async () => {
  let blocked = false;
  const { calls, cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`)
      return blocked
        ? Response.json({ code: "CHECKOUT_BLOCKED", message: "This checkout requires review. Check your order status before trying another payment." }, { status: 409 })
        : Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow2" }));
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow2" }));
  });
  // Closing the window shows the failure screen (Figma 392:1806), whose "Try payment again" reopens it.
  const retry = () => {
    const found = button("Try payment again");
    assert.ok(found, "the buyer can retry after closing the provider window");
    return found!;
  };
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.modal.ondismiss(); });
    assert.match(text(), /not completed/i);
    await act(async () => retry().click());
    assert.equal(calls.filter((c) => c.path === `/api/checkout/${attemptId}/payment-order`).length, 2);
    assert.equal(razorpay!.opened, 1, "a retry constructs a fresh provider session");
    await act(async () => { razorpay!.options.modal.ondismiss(); });
    blocked = true;
    const opens = (razorpay as Razorpay | null)?.opened;
    await act(async () => retry().click());
    assert.match(text(), /requires review/);
    assert.equal(razorpay!.opened, opens, "a blocked checkout never opens the provider window");
  } finally { await cleanup(); }
});

test("an expired quote is refreshed with a new idempotency key and service outages are explained", async () => {
  let responses = 0;
  const { calls, cleanup } = await mount((call) => {
    if (call.path !== "/api/checkout") return new Response(null, { status: 404 });
    responses++;
    if (responses === 1) return Response.json(attempt({ quote: { ...quote, expiresAt: new Date(Date.now() - 1000).toISOString() } }));
    if (responses === 2) return Response.json(attempt({ id: "1b8e1c3a-5d2f-4a6b-9c8d-7e6f5a4b3c2d" }));
    return Response.json({ code: "QUOTE_UNAVAILABLE", message: "We couldn't confirm pricing and delivery right now. Please try again in a moment. No payment has been taken." }, { status: 503 });
  });
  try {
    await submitDetails();
    assert.match(text(), /expired/i);
    assert.ok(!button(pay), "an expired quote cannot be paid");
    await act(async () => button("Get a new quote")!.click());
    const keys = calls.filter((c) => c.path === "/api/checkout").map((c) => c.headers.get("Idempotency-Key"));
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1], "a replayed key would return the same expired attempt");
    assert.ok(button(pay));
    await act(async () => button("Edit details")!.click());
    fill({ "shipping.line2": "Second floor" });
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    assert.match(text(), /couldn't confirm pricing and delivery/);
    assert.match(text(), /No payment has been taken/);
    assert.ok(!button(pay));
  } finally { await cleanup(); }
});

test("a captured payment that needs staff review is reported honestly with the checkout reference", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path.endsWith("/payment-order")) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow3" }));
    return Response.json(attempt({ state: "captured", paid: true, providerOrderId: "order_flow3", fulfillmentStatus: "review_required" }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_flow3", razorpay_order_id: "order_flow3", razorpay_signature: "f".repeat(64) }); });
    await settle(8);
    assert.match(text(), /payment (has been|was) received/i);
    assert.match(text(), /review/i);
    assert.match(text(), new RegExp(attemptId));
    assert.ok(!button(pay));
  } finally { await cleanup(); }
});

test("a checkout that the API closes mid-session returns the buyer to the preview state", async () => {
  const { cleanup } = await mount(() =>
    Response.json({ code: "CHECKOUT_NOT_AVAILABLE", message: "Online checkout is not available in this preview. No payment has been taken." }, { status: 503 }));
  try {
    await submitDetails();
    assert.match(text(), /Checkout is not open in this preview/);
    assert.ok(!document.querySelector("form"));
  } finally { await cleanup(); }
});

test("a payment the buyer completed is never described as unpaid when confirmation outlasts the window", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path.endsWith("/payment-order")) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_slow" }));
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_slow" }));
  }, { confirmationWindowMs: 40 });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_slow", razorpay_order_id: "order_slow", razorpay_signature: "f".repeat(64) }); });
    await settle(12);
    assert.match(text(), /still confirming/i);
    assert.match(text(), /don.t need to pay again|do not pay again/i);
    assert.doesNotMatch(text(), /No payment has been taken/);
    assert.match(text(), new RegExp(attemptId));
    assert.ok(!button(pay));
  } finally { await cleanup(); }
});

test("a refresh while confirming resumes the same attempt, then empties the cart once the order is confirmed", async () => {
  let confirmed = false;
  const route = (call: Call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path.endsWith("/payment-order")) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_resume" }));
    if (call.path === `/api/checkout/${attemptId}`)
      return Response.json(confirmed
        ? attempt({ state: "captured", paid: true, providerOrderId: "order_resume", fulfillmentStatus: "confirmed", orderReference: "SO-2002" })
        : attempt({ state: "awaiting_payment", providerOrderId: "order_resume" }));
    return new Response(null, { status: 404 });
  };
  const first = await mount(route);
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_resume", razorpay_order_id: "order_resume", razorpay_signature: "f".repeat(64) }); });
    await settle(4);
    assert.match(text(), /confirming/i);
    assert.ok(sessionStorage.getItem(storageKey), "the in-flight attempt survives a reload");
  } finally { await first.cleanup(); }
  confirmed = true;
  const second = await mount(route, { keepStorage: true });
  try {
    await settle(12);
    assert.ok(!document.querySelector("form"), "a resumed attempt never shows the details form again");
    assert.equal(second.calls.filter((c) => c.path === "/api/checkout" && c.method === "POST").length, 0, "no second quote, order or payment");
    assert.match(text(), /SO-2002/);
    assert.ok(second.calls.filter((c) => c.path === "/api/cart").length >= 2, "the saved cart is reloaded after capture consumed it");
    assert.equal(sessionStorage.getItem(storageKey), null);
  } finally { await second.cleanup(); }
});

test("leaving a payable attempt releases its hold and the next quote uses a new key", async () => {
  let orders = 0;
  const { calls, cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    // The second window would outlive the stock hold, so trying again from the failure screen returns to the quote.
    if (call.path.endsWith("/payment-order"))
      return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_leave", ...(++orders > 1 ? { payWithinSeconds: 30 } : {}) }));
    if (call.path.endsWith("/release")) return Response.json(attempt({ state: "abandoned", providerOrderId: "order_leave" }));
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_leave" }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.modal.ondismiss(); });
    const firstWindow = razorpay;
    await act(async () => button("Try payment again")!.click());
    assert.equal(razorpay, firstWindow, "no second window that would outlive the hold");
    assert.match(text(), /about to be released/);
    await act(async () => button("Edit details")!.click());
    await settle(2);
    const releases = calls.filter((c) => c.path === `/api/checkout/${attemptId}/release`);
    assert.equal(releases.length, 1);
    assert.equal(releases[0]!.method, "POST");
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    const keys = calls.filter((c) => c.path === "/api/checkout" && c.method === "POST").map((c) => c.headers.get("Idempotency-Key"));
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1], "identical details must not replay the abandoned attempt");
  } finally { await cleanup(); }
});

test("a rejected quote and a cart already being paid are explained in the API's words", async () => {
  let code = "QUOTE_REJECTED";
  const { cleanup } = await mount(() => Response.json(
    code === "QUOTE_REJECTED"
      ? { code, message: "We can't quote this order as entered. Check the delivery method and address, or contact our team. No payment has been taken." }
      : { code, message: "A payment for this cart is already in progress. Finish or close it, then check your order status before starting another." },
    { status: code === "QUOTE_REJECTED" ? 422 : 409 }));
  try {
    await submitDetails();
    assert.match(text(), /can't quote this order as entered/);
    assert.ok(document.querySelector("form"), "the buyer can correct the details");
    code = "CHECKOUT_IN_PROGRESS";
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    assert.match(text(), /already in progress/);
  } finally { await cleanup(); }
});

const shiprocketQuote = {
  ...quote,
  items: [{ ...quote.items[0]!, fulfilment: { kind: "made_to_order", leadTimeDays: 28 } }],
  delivery: { courierName: "Delhivery Surface", estimatedDays: 6 },
};

test("the checkout is rebuilt storefront markup inside data-store", async () => {
  const { cleanup } = await mount(() => new Response(null, { status: 404 }));
  try {
    assert.ok(document.querySelector("[data-store][data-checkout] form"), "the form sits in the storefront scope");
    // The approved Figma details form (frame 30:492) keeps .checkout-form, which styles/checkout.css styles it by.
    assert.ok(!document.querySelector(".checkout-layout, .checkout-field"), "no legacy checkout layout classes remain");
  } finally { await cleanup(); }
});

test("review shows the Shiprocket courier and estimate and each made-to-order making time", async () => {
  const { cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(attempt({ quote: shiprocketQuote })) : new Response(null, { status: 404 }));
  try {
    await submitDetails();
    const review = document.querySelector("[data-checkout-review]")!.textContent!;
    assert.match(review, /Delhivery Surface/);
    assert.match(review, /about 6 days/);
    assert.match(review, /Made to order: allow 28 days for making/);
  } finally { await cleanup(); }
});

test("the payment window closes before the stock hold and the signed callback is handed to the store", async () => {
  const payBy = new Date(Date.now() + 5 * 60_000).toISOString();
  const { calls, cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow3", payBy }));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow3" }), { status: 202 });
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow3" }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    assert.ok(razorpay!.options.timeout > 280 && razorpay!.options.timeout <= 300, `timeout ${razorpay!.options.timeout}`);
    const signed = { razorpay_payment_id: "pay_flow3", razorpay_order_id: "order_flow3", razorpay_signature: "a".repeat(64) };
    await act(async () => { razorpay!.options.handler(signed); });
    await settle(3);
    const posted = calls.find((c) => c.path === `/api/checkout/${attemptId}/payment-callback`)!;
    assert.equal(posted.method, "POST");
    assert.deepEqual(posted.body, signed);
  } finally { await cleanup(); }
});

test("a hold too close to lapsing asks for a new quote instead of opening payment", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow4", payBy: new Date(Date.now() + 10_000).toISOString() }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    assert.equal(razorpay, null, "no payment window that would outlive the hold");
    assert.match(text(), /new quote/i);
  } finally { await cleanup(); }
});

test("a delivery Shiprocket cannot price offers an enquiry instead of payment", async () => {
  const message = "We can't price delivery to this pincode online right now. Send us an enquiry and our team will quote delivery for you. No payment has been taken.";
  const { cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json({ code: "DELIVERY_UNPRICED", message }, { status: 422 }) : new Response(null, { status: 404 }));
  try {
    await submitDetails();
    assert.match(text(), /can't price delivery to this pincode/);
    const enquiry = document.querySelector<HTMLAnchorElement>("[data-checkout-enquiry]")!;
    assert.match(enquiry.href, /\/contact\?/);
    assert.match(decodeURIComponent(enquiry.href), /400001/);
    assert.ok(!button(pay));
  } finally { await cleanup(); }
});

test("a payment received after the hold lapsed is acknowledged with the refund promise, never a request to pay again", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow5" }));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow5" }), { status: 202 });
    return Response.json(attempt({ state: "paid_hold_lapsed", paid: true, providerOrderId: "order_flow5", fulfillmentStatus: "review_required" }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_flow5", razorpay_order_id: "order_flow5", razorpay_signature: "b".repeat(64) }); });
    await settle(12);
    assert.match(text(), /payment has been received/i);
    assert.match(text(), /refund in full/i);
    assert.match(text(), /don't need to pay again/i);
    assert.ok(document.querySelector(`a[href="/orders/${attemptId}"]`), "the buyer can follow the order");
  } finally { await cleanup(); }
});

test("a confirmed order links to its status page", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow6" }));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow6" }), { status: 202 });
    return Response.json(attempt({ state: "captured", paid: true, providerOrderId: "order_flow6", fulfillmentStatus: "confirmed", orderReference: "SO-2002" }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_flow6", razorpay_order_id: "order_flow6", razorpay_signature: "c".repeat(64) }); });
    await settle(12);
    assert.match(text(), /SO-2002/);
    assert.ok(document.querySelector(`a[href="/orders/${attemptId}"]`));
  } finally { await cleanup(); }
});

test("the payment window length comes from the server, not the buyer's clock", async () => {
  // A buyer clock an hour slow would read this payBy as 65 minutes away; the server says 200 seconds.
  const payBy = new Date(Date.now() + 65 * 60_000).toISOString();
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow7", payBy, payWithinSeconds: 200 }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    assert.equal(razorpay!.options.timeout, 200);
  } finally { await cleanup(); }
});

test("the quote fills in the same page without a jump, and the confirmation starts at the top", async () => {
  // One page (Figma 394:1310): the delivery charge, the estimate and the total appear beside the button the buyer pressed.
  // A message that replaces the page (confirming, confirmed, review) still brings them back to the top.
  const scrolled: Element[] = [];
  const original = (window.HTMLElement.prototype as any).scrollIntoView;
  (window.HTMLElement.prototype as any).scrollIntoView = function (this: Element) { scrolled.push(this); };
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path.endsWith("/payment-order")) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_jump" }));
    return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_jump" }));
  });
  try {
    assert.equal(scrolled.length, 0, "the first view does not jump");
    await submitDetails();
    assert.equal(scrolled.length, 0, "the quote appears where the buyer is");
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_jump", razorpay_order_id: "order_jump", razorpay_signature: "d".repeat(64) }); });
    assert.ok(scrolled.some((el) => el.hasAttribute("data-checkout")), "the confirmation starts at the top, not where the button was");
  } finally {
    (window.HTMLElement.prototype as any).scrollIntoView = original;
    await cleanup();
  }
});

test("the details are one page: contact, the delivery address, then delivery and payment, beside the order", async () => {
  const { cleanup } = await mount(() => new Response(null, { status: 404 }));
  try {
    assert.match(text(), /01\s*Contact details[\s\S]*02\s*Delivery address[\s\S]*03\s*Delivery & payment/);
    const delivery = document.querySelector("[data-checkout-delivery]");
    assert.ok(delivery, "the delivery choice sits in step 03");
    assert.match(delivery!.textContent!, /Standard delivery[\s\S]*White glove delivery/);
    assert.match(delivery!.textContent!, /PIN code/, "before the quote, the charge is promised from the PIN, not invented");
    assert.doesNotMatch(delivery!.textContent!, /₹/);
    assert.ok(button("Calculate delivery and total"), "the first press prices delivery and the total");
    assert.ok(![...document.querySelectorAll("button")].some((b) => /Continue to payment/.test(b.textContent ?? "")), "nothing to pay before a quote");
    assert.match(document.querySelector("[data-checkout-payment]")?.textContent ?? "", /Pay securely online[\s\S]*UPI/);
    const summary = document.querySelector("[data-checkout-summary]")!.textContent!;
    for (const expected of [/Your order/, /2 items/, /Oak Chair/, /Natural/, /Subtotal/, /3,000/]) assert.match(summary, expected);
    assert.equal(link("Speak with Maple.")?.getAttribute("href"), "/contact");
    assert.equal(link("Terms of Service")?.getAttribute("href"), "/policies/terms-of-service");
    assert.equal(link("Privacy Policy")?.getAttribute("href"), "/policies/privacy-policy");
    for (const name of ["email", "firstName", "shipping.line1", "shipping.city", "shipping.pincode", "phone"]) {
      const control = field(name) as HTMLInputElement;
      assert.ok(control.labels?.[0]?.textContent, `${name} has a label`);
    }
  } finally { await cleanup(); }
});

test("one piece's photo is the summary's largest picture, so it loads at once instead of lazily", async () => {
  line.image = "/media/home/category-accent-chair.webp";
  const { cleanup } = await mount(() => new Response(null, { status: 404 }));
  try {
    const photo = document.querySelector<HTMLImageElement>("[data-checkout-summary] .checkout-line-photo img");
    assert.ok(photo, "the piece is pictured");
    assert.equal(photo!.getAttribute("loading"), "eager");
    assert.equal(photo!.getAttribute("fetchPriority"), "high");
  } finally {
    line.image = "";
    await cleanup();
  }
});

test("once quoted, the page shows the delivery charge and estimate in place and locks what was quoted", async () => {
  const { cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(attempt({ quote: shiprocketQuote })) : new Response(null, { status: 404 }));
  try {
    await submitDetails();
    const delivery = document.querySelector("[data-checkout-delivery]")?.textContent ?? "";
    assert.match(delivery, /Standard delivery · ₹250/);
    assert.match(delivery, /Estimated arrival · \d{1,2}[\s\S]*(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/);
    assert.doesNotMatch(delivery, /White glove delivery/, "only the chosen way is shown once priced");
    const summary = document.querySelector("[data-checkout-summary]")!.textContent!;
    assert.match(summary, /Delivery\s*₹250/);
    assert.match(summary, /GST\s*₹585/);
    assert.match(summary, /Total to pay\s*₹3,835/);
    assert.ok(button(pay));
    assert.ok(button("Edit details"));
    assert.equal((field("shipping.pincode") as HTMLInputElement).disabled, true, "the quoted address cannot drift from the quote");
    await act(async () => button("Edit details")!.click());
    assert.equal((field("shipping.pincode") as HTMLInputElement).disabled, false);
    assert.equal((field("shipping.pincode") as HTMLInputElement).value, "400001", "what was entered stays");
  } finally { await cleanup(); }
});

test("a field the page rejects is marked and described on the field itself", async () => {
  const { calls, cleanup } = await mount(() => new Response(null, { status: 404 }));
  try {
    fill({ ...details, email: "buyer@", "shipping.pincode": "40001" });
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    assert.equal(calls.filter((c) => c.path === "/api/checkout").length, 0);
    for (const name of ["email", "shipping.pincode"]) {
      const control = field(name);
      assert.equal(control.getAttribute("aria-invalid"), "true", name);
      const words = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      assert.notEqual(words.trim(), "", `${name} says what is wrong`);
    }
    assert.equal(document.activeElement, field("email"), "focus goes to the first problem");
  } finally { await cleanup(); }
});

test("with accounts on, a guest may sign in and come back; a signed-in customer finds their details filled in", async () => {
  let { cleanup } = await mount(() => new Response(null, { status: 404 }), { account: { enabled: true, prefill: null } });
  try {
    assert.match(text(), /Already have an account\?/);
    assert.equal(link("Sign in")?.getAttribute("href"), "/account/login?next=%2Fcheckout");
  } finally { await cleanup(); }
  const prefill = { email: "aditi.sharma@example.com", name: "Aditi Sharma", phone: "+919876543210",
    address: { line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", stateCode: "29", pincode: "560001" } };
  let calls: Call[];
  ({ calls, cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(attempt()) : new Response(null, { status: 404 }), { account: { enabled: true, prefill } }));
  try {
    const values = Object.fromEntries(["email", "firstName", "lastName", "phone", "shipping.line1", "shipping.line2", "shipping.city", "shipping.stateCode", "shipping.pincode"]
      .map((name) => [name, field(name).value]));
    assert.deepEqual(values, { email: "aditi.sharma@example.com", firstName: "Aditi", lastName: "Sharma", phone: "9876543210", "shipping.line1": "14 Palm Avenue",
      "shipping.line2": "Apartment 402", "shipping.city": "Bengaluru", "shipping.stateCode": "29", "shipping.pincode": "560001" });
    assert.equal(link("Sign in"), undefined, "no sign-in offer once signed in");
    assert.match(text(), /aditi\.sharma@example\.com/);
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    const posted = calls.find((c) => c.path === "/api/checkout");
    assert.ok(posted, "the prefilled details are enough to quote");
    assert.deepEqual(posted!.body.customer, { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" });
    assert.equal(posted!.body.shippingAddress.stateCode, "29");
  } finally { await cleanup(); }
  ({ cleanup } = await mount(() => new Response(null, { status: 404 })));
  try {
    assert.doesNotMatch(text(), /Sign in|Already have an account/, "with accounts off, nothing offers a sign-in");
  } finally { await cleanup(); }
});

test("a confirmed order is told by Maple's order number, never Keeri's reference", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(attempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow8" }));
    if (call.path === `/api/checkout/${attemptId}/payment-callback`) return Response.json(attempt({ state: "awaiting_payment", providerOrderId: "order_flow8" }), { status: 202 });
    return Response.json(attempt({ state: "captured", paid: true, providerOrderId: "order_flow8", fulfillmentStatus: "confirmed", orderReference: "SO-3003", orderNumber: "MF-10482" }));
  });
  try {
    await submitDetails();
    await act(async () => payButton().click());
    await act(async () => { razorpay!.options.handler({ razorpay_payment_id: "pay_flow8", razorpay_order_id: "order_flow8", razorpay_signature: "e".repeat(64) }); });
    await settle(12);
    assert.match(text(), /MF-10482/);
    assert.doesNotMatch(text(), /SO-3003/);
  } finally { await cleanup(); }
});

/* ── Promo codes ─────────────────────────────────────────────────────────────── */

// Keeri's quote with DIWALI15 (15% off) on the two chairs: each 150000 -> 127500, shipping never discounted.
const promotedQuote = {
  ...quote,
  items: [{ ...quote.items[0]!, unitPricePaise: 127500, lineTotalPaise: 255000, discountPaise: 45000, undiscountedUnitPricePaise: 150000 }],
  subtotalPaise: 255000, taxPaise: 50400, totalPaise: 330400,
  promotion: { code: "DIWALI15", label: "15% off", discountPaise: 45000 },
};
const promotedAttempt = (extra: Record<string, unknown> = {}) => attempt({ amountPaise: 330400, quote: promotedQuote, ...extra });
const promoError = () => document.querySelector("[data-promo-error]")?.textContent ?? "";
// The code field is controlled: React renders what was typed before the form is sent, as a browser would.
const typeCode = (value: string) => act(async () => fill({ promoCode: value }));
const quoteRequests = (calls: Call[]) => calls.filter((c) => c.path === "/api/checkout" && c.method === "POST");

test("a code entered with the details is sent with the quote, and the summary shows the discount and the discounted total", async () => {
  const { calls, cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(promotedAttempt()) : new Response(null, { status: 404 }));
  try {
    assert.match(text(), /Have a code\?/);
    await typeCode(" diwali15 ");
    await submitDetails();
    assert.equal(quoteRequests(calls)[0]!.body.promoCode, "DIWALI15");
    const totals = document.querySelector("[data-checkout-summary]")!.textContent!;
    assert.match(totals, /Subtotal\s*₹3,000/, "the lines before the discount");
    assert.match(totals, /Discount \(DIWALI15\)\s*−₹450/);
    assert.match(totals, /Total to pay\s*₹3,304/);
    assert.ok(button("Continue to payment · ₹3,304"), "the buyer pays the discounted total");
  } finally { await cleanup(); }
});

test("without a code the quote request carries none and the summary has no discount line", async () => {
  const { calls, cleanup } = await mount((call) => call.path === "/api/checkout" ? Response.json(attempt()) : new Response(null, { status: 404 }));
  try {
    await submitDetails();
    assert.equal("promoCode" in quoteRequests(calls)[0]!.body, false);
    assert.doesNotMatch(text(), /Discount/);
  } finally { await cleanup(); }
});

test("removing an applied code quotes again without it, under a new key", async () => {
  const { calls, cleanup } = await mount((call) => call.path === "/api/checkout"
    ? Response.json(call.body.promoCode ? promotedAttempt() : attempt({ id: "1b8e1c3a-5d2f-4a6b-9c8d-7e6f5a4b3c2d" }))
    : new Response(null, { status: 404 }));
  try {
    await typeCode("DIWALI15");
    await submitDetails();
    assert.ok(button("Continue to payment · ₹3,304"));
    await act(async () => button("Remove code")!.click());
    await settle();
    const [first, second] = quoteRequests(calls);
    assert.equal("promoCode" in second!.body, false);
    assert.notEqual(second!.headers.get("Idempotency-Key"), first!.headers.get("Idempotency-Key"));
    assert.ok(button("Continue to payment · ₹3,835"), "back to the full price");
    assert.doesNotMatch(text(), /Discount/);
  } finally { await cleanup(); }
});

test("a code Keeri refuses is explained next to the field, and the buyer can remove it and continue", async () => {
  const { calls, cleanup } = await mount((call) => {
    if (call.path !== "/api/checkout") return new Response(null, { status: 404 });
    return call.body.promoCode
      ? Response.json({ code: "PROMO_NOT_FOUND", message: "We don't recognise that code. No payment has been taken." }, { status: 422 })
      : Response.json(attempt());
  });
  try {
    await typeCode("NOPE99");
    await submitDetails();
    assert.equal(promoError(), "We don't recognise that code. No payment has been taken.");
    assert.ok(button("Calculate delivery and total"), "still on the details step");
    await act(async () => button("Remove code")!.click());
    assert.equal(field("promoCode").value, "");
    assert.equal(promoError(), "");
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    assert.equal("promoCode" in quoteRequests(calls).at(-1)!.body, false);
    assert.ok(button("Continue to payment · ₹3,835"));
  } finally { await cleanup(); }
});

test("a code that is not a code shape is caught before any request", async () => {
  const { calls, cleanup } = await mount(() => Response.json(attempt()));
  try {
    await typeCode("SALE-20");
    await submitDetails();
    assert.equal(quoteRequests(calls).length, 0);
    assert.match(promoError(), /3 to 24 letters and numbers/);
  } finally { await cleanup(); }
});

test("a hold refused for the code brings the buyer back to the details with its message, without opening payment", async () => {
  const { cleanup } = await mount((call) => {
    if (call.path === "/api/checkout") return Response.json(promotedAttempt());
    if (call.path === `/api/checkout/${attemptId}/payment-order`)
      return Response.json({ code: "PROMO_ALREADY_USED", message: "That code has already been used with this phone number or email. No payment has been taken." }, { status: 422 });
    return new Response(null, { status: 404 });
  });
  try {
    await typeCode("DIWALI15");
    await submitDetails();
    await act(async () => button("Continue to payment · ₹3,304")!.click());
    assert.equal(razorpay, null);
    assert.ok(button("Calculate delivery and total"), "back on the details step");
    assert.equal(promoError(), "That code has already been used with this phone number or email. No payment has been taken.");
    assert.equal(field("promoCode").value, "DIWALI15", "the code stays for the buyer to change or remove");
    assert.equal(sessionStorage.getItem(storageKey), null, "the refused attempt is not resumed");
  } finally { await cleanup(); }
});

test("an item that can no longer be bought online is explained instead of a quote", async () => {
  const message = "An item in your cart can no longer be bought online. Remove it or send us an enquiry. No payment has been taken.";
  const { cleanup } = await mount(() => Response.json({ code: "ITEM_NOT_BUYABLE", message }, { status: 422 }));
  try {
    await submitDetails();
    assert.match(text(), /can no longer be bought online/);
    assert.doesNotMatch(text(), /requires review/);
  } finally { await cleanup(); }
});
