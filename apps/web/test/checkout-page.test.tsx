import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import CheckoutPage from "../app/checkout/page";
import { ShopProvider } from "../components/shop-provider";
import { setRequestCookies } from "./support/next-headers";

// Captured from the placeholder page before live checkout existed. The closed state must not drift.
const closedMarkup =
  '<section class="empty-state checkout-state"><h1>Checkout is not open in this preview</h1><p>Your cart is saved. We’re preparing online payments and confirming delivery and stock before opening checkout.</p><p>No payment has been taken and no order has been placed.</p><div class="button-row"><a class="button" href="/cart">Return to cart</a><a class="button secondary" href="/contact">Contact our team</a></div></section>';
const options = { deliveryMethods: [{ id: "standard", label: "Standard delivery" }], paymentKeyId: "rzp_test_page" };
async function render(responder: (path: string) => Response | Promise<Response>, searchParams?: Record<string, string>) {
  const previous = globalThis.fetch;
  const requests: string[] = [];
  const cookies: Array<string | null> = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push(path);
    cookies.push(new Headers(init?.headers).get("cookie"));
    return responder(path);
  };
  try {
    const page = await CheckoutPage(searchParams ? { searchParams: Promise.resolve(searchParams) } : undefined);
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
    const stream = await renderToReadableStream(
      <AppRouterContext.Provider value={router}><ShopProvider>{page}</ShopProvider></AppRouterContext.Provider>,
    );
    return { html: await new Response(stream).text(), requests, cookies };
  } finally {
    globalThis.fetch = previous;
  }
}

test("the preview closed state renders unchanged while the API reports checkout disabled", async () => {
  const { html, requests } = await render((path) =>
    path === "/api/health" ? Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: false }) : new Response(null, { status: 404 }),
  );
  assert.equal(html.replace(/<!--.*?-->/g, ""), closedMarkup);
  assert.deepEqual(requests, ["/api/health"], "a disabled checkout never asks for delivery or payment options");
});

test("an unreachable or malformed health check fails closed", async () => {
  for (const responder of [
    () => { throw new Error("connection refused"); },
    () => new Response("<html>", { status: 502 }),
    () => Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: "true" }),
    () => Response.json({ status: "ok", catalogMode: "preview" }),
  ]) {
    const { html } = await render(responder);
    assert.match(html, /Checkout is not open in this preview/);
    assert.doesNotMatch(html, /<form/);
  }
});

test("checkout enabled without usable options still renders the closed state", async () => {
  const { html } = await render((path) =>
    path === "/api/health"
      ? Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: true })
      : Response.json({ code: "CHECKOUT_NOT_AVAILABLE", message: "Online checkout is not available right now." }, { status: 503 }),
  );
  assert.match(html, /Checkout is not open in this preview/);
  assert.doesNotMatch(html, /<form/);
});

test("live checkout renders the delivery and contact form instead of the placeholder", async () => {
  const { html, requests } = await render((path) =>
    path === "/api/health"
      ? Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: true })
      : path === "/api/checkout/options" ? Response.json(options) : new Response(null, { status: 404 }),
  );
  assert.deepEqual(requests, ["/api/health", "/api/checkout/options"]);
  assert.doesNotMatch(html, /Checkout is not open in this preview/);
  assert.match(html, /<h1[^>]*>Make room for something beautiful\.<\/h1>/);
  assert.match(html, /Standard delivery/);
  // Frame 394:1310: one page of numbered contact, delivery address and delivery & payment steps beside the order.
  for (const heading of ["Contact details", "Delivery address", "Delivery &amp; payment", "Your order", "Calculate delivery and total"]) assert.match(html, new RegExp(heading));
  // With accounts switched off (the API's health has no accountsEnabled: true), nothing offers a sign-in; the sign-in
  // line appears only when accounts are on (owner's spec, 10 Nov 2026), tested below.
  assert.doesNotMatch(html, /promo code|Sign in|Keep me updated/i, "nothing the store cannot do yet");
});

test("on a local development server, ?preview=design shows the details step while checkout stays closed", async () => {
  const closed = (path: string) => path === "/api/health" ? Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: false }) : new Response(null, { status: 404 });
  assert.match((await render(closed, { preview: "design" })).html, /Home delivery[\s\S]*Store pickup/);
  assert.match((await render(closed, { preview: "other" })).html, /Checkout is not open in this preview/);
});

afterEach(() => setRequestCookies({}));
const liveWithAccounts = { status: "ok", catalogMode: "preview", checkoutEnabled: true, accountsEnabled: true };
const overview = {
  customer: { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" },
  counts: { orders: 1, addresses: 1 },
  latestOrder: null,
  defaultAddress: { id: "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b", name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru",
    state: "29", pin: "560001", phone: "+919876543210", isDefault: true },
};

test("with accounts on, a guest is offered sign-in that returns to checkout, without a lookup for a session they lack", async () => {
  const { html, requests } = await render((path) =>
    path === "/api/health" ? Response.json(liveWithAccounts) : path === "/api/checkout/options" ? Response.json(options) : new Response(null, { status: 404 }));
  assert.match(html, /Already have an account\?/);
  assert.match(html, /href="\/account\/login\?next=%2Fcheckout"[^>]*>Sign in</);
  assert.deepEqual(requests, ["/api/health", "/api/checkout/options"], "no session cookie, no account lookup");
});

test("a signed-in customer's contact and default address come filled in, and only the account cookie is forwarded", async () => {
  setRequestCookies({ maple_cart: "cart-token", maple_account: "session-token" });
  const { html, requests, cookies } = await render((path) =>
    path === "/api/health" ? Response.json(liveWithAccounts)
      : path === "/api/checkout/options" ? Response.json(options)
        : path === "/api/account" ? Response.json(overview) : new Response(null, { status: 404 }));
  assert.deepEqual(requests, ["/api/health", "/api/checkout/options", "/api/account"]);
  assert.equal(cookies[2], "maple_account=session-token");
  for (const value of ["aditi.sharma@example.com", "Aditi", "Sharma", "14 Palm Avenue", "Apartment 402", "Bengaluru", "560001", "9876543210"])
    assert.match(html, new RegExp(`value="${value}"`), value);
  assert.match(html, /<option value="29" selected="">Karnataka<\/option>/);
  assert.doesNotMatch(html, />Sign in</, "signed in, nothing offers a sign-in");
});

test("a session the API no longer knows checks out as a guest", async () => {
  setRequestCookies({ maple_account: "expired-token" });
  const { html } = await render((path) =>
    path === "/api/health" ? Response.json(liveWithAccounts)
      : path === "/api/checkout/options" ? Response.json(options)
        : path === "/api/account" ? Response.json({ code: "ACCOUNT_AUTH_REQUIRED", message: "Sign in to continue." }, { status: 401 }) : new Response(null, { status: 404 }));
  assert.match(html, /href="\/account\/login\?next=%2Fcheckout"[^>]*>Sign in</);
  assert.doesNotMatch(html, /value="aditi/);
});

test("on a local development server, ?preview=quote shows the priced page: delivery, estimate and the total to pay", async () => {
  const closed = (path: string) => path === "/api/health" ? Response.json({ status: "ok", catalogMode: "preview", checkoutEnabled: false }) : new Response(null, { status: 404 });
  const { html } = await render(closed, { preview: "quote" });
  assert.match(html, /Home delivery · ₹1,500/);
  assert.match(html, /Estimated arrival · /);
  assert.match(html, /Continue to payment · ₹26,400/);
  assert.match(html, /Total to pay/);
});
