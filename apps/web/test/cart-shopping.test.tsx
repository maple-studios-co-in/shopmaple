import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider, useShop } from "../components/shop-provider";
import { CartContents } from "../components/cart";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/products/chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const product: Product = {
  id: "chair", handle: "chair", title: "Made to order chair", description: "Original product description", category: "chairs",
  images: [], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [{ id: "chair-blue", title: "Blue", sku: "CHAIR-B", pricePaise: 2300000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }],
};
const empty = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", checkoutEnabled: false, mode: "preview",
  mutationContext: { cartIdentity: "a".repeat(64), revision: 0 } };
const line = { variantId: "chair-blue", handle: "chair", title: product.title, variantTitle: "Blue", image: "",
  pricePaise: 2300000, quantity: 1, lineTotalPaise: 2300000, available: false, cartable: true, stockPolicy: "made_to_order" };
const full = { ...empty, items: [line], itemCount: 1, subtotalPaise: 2300000 };
function Probe() {
  const shop = useShop();
  return <><output data-drawer>{String(shop.cartOpen)}</output><CartContents /></>;
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
  .find(e => e.textContent === label || e.getAttribute("aria-label") === label);
async function mount(fetcher: typeof fetch, value: Product | null = product) {
  sessionStorage.clear(); localStorage.clear();
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}>
    {value && <ProductDetail product={value} />}<Probe />
  </AppRouterContext.Provider></ShopProvider>));
  return async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
}

test("priced made-to-order items add to the saved cart without claiming stock or payment", async () => {
  const writes: { url: string; body: Record<string, any> }[] = [];
  const cleanup = await mount(async (url, init) => {
    if (init?.method !== "PUT") return Response.json(empty);
    const body = JSON.parse(String(init.body)); writes.push({ url: String(url), body });
    return Response.json({ ...full, mutationContext: { ...empty.mutationContext, revision: 1 }, mutationResult: { id: body.mutation.id, status: "applied" } });
  });
  try {
    assert.ok(button("Add to cart"), "Known-price made-to-order product needs an Add to cart button");
    assert.equal(button("Add to cart")!.disabled, false);
    await act(async () => button("Add to cart")!.click());
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.url, "/api/cart/items/chair-blue");
    assert.deepEqual(Object.keys(writes[0]!.body).sort(), ["mutation", "quantity"]);
    assert.equal(writes[0]!.body.quantity, 1);
    assert.equal(document.querySelector("[data-drawer]")!.textContent, "true");
    assert.match(document.querySelector(".cart-line")!.textContent!, /Made to order chair/);
    assert.doesNotMatch(document.querySelector(".cart-line")!.textContent!, /Please contact us to confirm price/);
    assert.match(document.querySelector(".cart-summary")!.textContent!, /Online payment is not available yet/);
  } finally { await cleanup(); }
});

test("priced unverified items can be selected for cart but unknown prices keep enquiry", async () => {
  for (const pricePaise of [2300000, null]) {
    const cleanup = await mount(async () => Response.json(empty), { ...product, variants: [{ ...product.variants[0]!, stockPolicy: "unverified", pricePaise }] });
    try {
      assert.equal(Boolean(button("Add to cart")), pricePaise !== null);
      assert.equal(Boolean(document.querySelector(".pdp-purchase a")), pricePaise === null);
    } finally { await cleanup(); }
  }
});

test("cartable made-to-order quantity updates use the current guarded cart", async () => {
  const writes: number[] = [];
  const cleanup = await mount(async (_url, init) => {
    if (init?.method !== "PUT") return Response.json(full);
    const body = JSON.parse(String(init.body)); writes.push(body.quantity);
    return Response.json({ ...full, items: [{ ...line, quantity: 2, lineTotalPaise: 4600000 }], itemCount: 2, subtotalPaise: 4600000,
      mutationContext: { ...empty.mutationContext, revision: 1 }, mutationResult: { id: body.mutation.id, status: "applied" } });
  }, null);
  try {
    const increase = button("Increase quantity of Made to order chair")!;
    assert.equal(increase.disabled, false, "Cart eligibility is distinct from stocked checkout eligibility");
    await act(async () => increase.click());
    assert.deepEqual(writes, [2]);
    assert.match(document.querySelector(".cart-summary")!.textContent!, /46,000/);
  } finally { await cleanup(); }
});

test("a noncartable saved line can be reduced or removed but cannot grow", async () => {
  const writes: number[] = [];
  const cleanup = await mount(async (_url, init) => {
    if (init?.method !== "PUT") return Response.json({ ...full, items: [{ ...line, cartable: false }] });
    const body = JSON.parse(String(init.body)); writes.push(body.quantity);
    return Response.json({ ...empty, mutationContext: { ...empty.mutationContext, revision: 1 }, mutationResult: { id: body.mutation.id, status: "applied" } });
  }, null);
  try {
    assert.equal(button("Increase quantity of Made to order chair")!.disabled, true);
    assert.equal(button("Decrease quantity of Made to order chair")!.disabled, false);
    await act(async () => button("Decrease quantity of Made to order chair")!.click());
    assert.deepEqual(writes, [0]);
    assert.match(document.body.textContent!, /Your cart is empty/);
  } finally { await cleanup(); }
});
