import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import CheckoutPage from "../app/checkout/page";
import { ShopProvider } from "../components/shop-provider";

// Captured from the placeholder page before live checkout existed. The closed state must not drift.
const closedMarkup =
  '<section class="empty-state checkout-state"><h1>Checkout is not open in this preview</h1><p>Your cart is saved. We’re preparing online payments and confirming delivery and stock before opening checkout.</p><p>No payment has been taken and no order has been placed.</p><div class="button-row"><a class="button" href="/cart">Return to cart</a><a class="button secondary" href="/pages/contact">Contact our team</a></div></section>';
const options = { deliveryMethods: [{ id: "standard", label: "Standard delivery" }], paymentKeyId: "rzp_test_page" };
async function render(responder: (path: string) => Response | Promise<Response>) {
  const previous = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    requests.push(path);
    return responder(path);
  };
  try {
    const page = await CheckoutPage();
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
    const stream = await renderToReadableStream(
      <AppRouterContext.Provider value={router}><ShopProvider>{page}</ShopProvider></AppRouterContext.Provider>,
    );
    return { html: await new Response(stream).text(), requests };
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
  assert.match(html, /<h1[^>]*>Checkout<\/h1>/);
  assert.match(html, /Standard delivery/);
});
