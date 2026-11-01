import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product, Cart } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

// With checkout on, the product page offers "Add to cart" only for what can be
// bought (Keeri sells it at the shown price); everything else is an enquiry.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3003/products/aera" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const variant = { id: "aera-oak", title: "Oak", sku: "AERA-OAK", pricePaise: 4500000, compareAtPaise: null, available: false, stockPolicy: "stocked" as const, leadTimeDays: null };
const product = (v: Partial<typeof variant> | Record<string, unknown>): Product => ({
  id: "aera", handle: "aera", title: "Aera Chair", description: "", category: null, images: [], published: true, source: "keeri",
  sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ ...variant, ...v } as Product["variants"][number]],
});
const cart = (checkoutEnabled: boolean): Cart => ({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled, mode: "preview" });
async function mount(ui: React.ReactNode, check: () => void, body: Cart) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(body);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider>{ui}</ShopProvider></AppRouterContext.Provider>));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    check();
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const primary = () => document.querySelector("[data-purchase] [data-primary]")!;

test("with checkout on, a priced piece Keeri does not sell is an enquiry, not Add to cart", async () => {
  await mount(<ProductDetail product={product({})} />, () => {
    assert.equal(primary().tagName, "A");
    assert.match(primary().textContent!, /Enquire/);
  }, cart(true));
});

test("with checkout on, an approved made-to-order piece can be added and states its making time", async () => {
  await mount(<ProductDetail product={product({ available: true, stockPolicy: "made_to_order", leadTimeDays: 28 })} />, () => {
    assert.equal(primary().tagName, "BUTTON");
    assert.match(primary().textContent!, /Add to cart/);
    assert.match(document.querySelector("[data-lead-time]")!.textContent!, /Made to order.*28 days/);
  }, cart(true));
});

test("in the preview a priced piece can still be saved to the cart, and stocked pieces show no making time", async () => {
  await mount(<ProductDetail product={product({})} />, () => {
    assert.equal(primary().tagName, "BUTTON");
    assert.equal(document.querySelector("[data-lead-time]"), null);
  }, cart(false));
});
