import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { CartContents } from "../components/cart";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/products/alain" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const product: Product = {
  id: "alain", handle: "alain", title: "Alain", description: "", category: "chairs", images: [], published: true, source: "keeri",
  sourceUpdatedAt: "2026-11-14T00:00:00Z", minOrderQuantity: 4,
  variants: [
    { id: "alain-ivory", title: "Ivory", sku: "AL-I", pricePaise: 1500000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
    { id: "alain-noir", title: "Noir", sku: "AL-N", pricePaise: 1500000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
  ],
};
const context = { cartIdentity: "a".repeat(64), revision: 0 };
const line = (variantId: string, quantity: number) => ({ variantId, handle: "alain", title: "Alain", variantTitle: variantId, image: "",
  pricePaise: 1500000, quantity, lineTotalPaise: 1500000 * quantity, available: true, cartable: true, stockPolicy: "stocked", minOrderQuantity: 4 });
const cart = (items: ReturnType<typeof line>[]) => ({ items, itemCount: items.reduce((n, i) => n + i.quantity, 0),
  subtotalPaise: items.reduce((n, i) => n + i.lineTotalPaise, 0), currency: "INR", checkoutEnabled: true, mode: "preview", mutationContext: context });
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
  .find((e) => e.textContent === label || e.getAttribute("aria-label") === label);

async function mount(fetcher: typeof fetch, withProduct = true) {
  sessionStorage.clear(); localStorage.clear();
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}>
    {withProduct && <ProductDetail product={product} />}<CartContents />
  </AppRouterContext.Provider></ShopProvider>));
  return async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
}

test("a design with a minimum order starts at the minimum and says finishes can be mixed", async () => {
  const writes: number[] = [];
  const cleanup = await mount(async (_url, init) => {
    if (init?.method !== "PUT") return Response.json(cart([]));
    const body = JSON.parse(String(init.body)); writes.push(body.quantity);
    return Response.json({ ...cart([line("alain-ivory", body.quantity)]), mutationResult: { id: body.mutation.id, status: "applied" } });
  });
  try {
    assert.equal(document.querySelector('output[aria-label="Quantity"]')!.textContent, "4");
    assert.equal(button("Decrease quantity")!.disabled, true);
    assert.match(document.querySelector("[data-minimum-order]")!.textContent!, /Minimum order: 4 pieces\. Finishes can be mixed\./);
    await act(async () => button("Add to cart")!.click());
    assert.deepEqual(writes, [4]);
  } finally { await cleanup(); }
});

test("pieces already in the bag count towards the minimum on the product page", async () => {
  const cleanup = await mount(async () => Response.json(cart([line("alain-noir", 3)])));
  try {
    assert.equal(document.querySelector('output[aria-label="Quantity"]')!.textContent, "1");
  } finally { await cleanup(); }
});

test("a bag short of a minimum says how many more, and holds checkout until it is met", async () => {
  let cleanup = await mount(async () => Response.json(cart([line("alain-ivory", 1), line("alain-noir", 2)])), false);
  try {
    assert.match(document.querySelector("[data-minimum-shortfall]")!.textContent!, /Alain has a minimum order of 4\. Add 1 more \(finishes can be mixed\)\./);
    assert.equal(document.querySelector('a[href="/checkout"]'), null);
    assert.equal(button("Add more to check out")!.disabled, true);
  } finally { await cleanup(); }
  cleanup = await mount(async () => Response.json(cart([line("alain-ivory", 2), line("alain-noir", 2)])), false);
  try {
    assert.equal(document.querySelector("[data-minimum-shortfall]"), null);
    assert.ok(document.querySelector('a[href="/checkout"]'));
  } finally { await cleanup(); }
});
