import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ShopProvider } from "../components/shop-provider";
import { CartContents } from "../components/cart";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/cart" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const line = { variantId: "chair-v", handle: "chair", title: "Chair", variantTitle: "Oak", image: "", pricePaise: 10000,
  quantity: 1, lineTotalPaise: 10000, available: true, cartable: true, stockPolicy: "stocked" };
const cart = (checkoutEnabled: boolean) => ({ items: [line], itemCount: 1, subtotalPaise: 10000, currency: "INR",
  checkoutEnabled, mode: "preview", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 } });
async function mount(checkoutEnabled: boolean) {
  sessionStorage.clear();
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(cart(checkoutEnabled));
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><CartContents /></ShopProvider></AppRouterContext.Provider>));
  return async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
}

test("the cart stops disclaiming online payment once the API reports live checkout", async () => {
  let cleanup = await mount(true);
  try {
    const summary = document.querySelector(".cart-summary")!.textContent!;
    assert.doesNotMatch(summary, /Online payment is not available yet/);
    assert.match(summary, /Continue to checkout/);
    assert.equal(document.querySelector('a[href="/checkout"]')!.textContent, "Continue to checkout");
  } finally { await cleanup(); }
  cleanup = await mount(false);
  try {
    assert.match(document.querySelector(".cart-summary")!.textContent!, /Online payment is not available yet/);
  } finally { await cleanup(); }
});
