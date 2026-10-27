import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const variant = (id: string, title: string) => ({ id, title, sku: id.toUpperCase(), pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" as const });
const keeri: Product = {
  id: "keeri:tenant:imperio", handle: "keeri-imperio", title: "Imperio", description: "A chair", category: "chairs",
  images: ["https://example.com/imperio-1.webp", "https://example.com/imperio-2.webp"], published: true,
  source: "keeri:tenant", sourceUpdatedAt: "2026-10-27T00:00:00Z",
  variants: [variant("oak", "Light Oak"), variant("walnut", "Dark Walnut"), variant("espresso", "Espresso")],
};
async function mount(product: Product, presentation: { variantImages: Record<string, string>; reviewLabel: string | null } | undefined, check: () => Promise<void>) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  try {
    await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}>
      <ProductDetail product={product} presentation={presentation} />
    </AppRouterContext.Provider></ShopProvider>));
    await check();
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; }
}
const notice = () => [...document.querySelectorAll('[role="status"]')].find(element => element.textContent === "Photo for this option unavailable");
const tiles = () => [...document.querySelectorAll<HTMLLabelElement>(".pdp-variants label")];

test("a catalogue without per-option photos shows plain option tiles instead of placeholder boxes", async () => {
  await mount(keeri, undefined, async () => {
    assert.equal(tiles().length, 3);
    assert.equal(document.querySelectorAll(".pdp-variant-placeholder").length, 0, "no grey 'Photo unavailable' boxes");
    assert.equal(document.querySelectorAll(".pdp-variant-image").length, 0, "no empty image frames");
    assert.equal(notice(), undefined, "no missing-photo notice when the catalogue has no option photos at all");
    assert.ok(document.querySelector(".pdp-variants.pdp-variants-text"), "the option group is marked as text-only for compact styling");
    await act(async () => tiles()[1]!.querySelector("input")!.click());
    assert.equal(document.querySelector<HTMLInputElement>('input[name="variant"]:checked')?.value, "walnut");
    assert.equal(document.querySelector(".product-main-image img")?.getAttribute("src"), "https://example.com/imperio-1.webp", "the gallery stays on the product photos");
  });
});

test("a catalogue that maps a photo to some options keeps the placeholder for the unmapped ones", async () => {
  await mount(keeri, { variantImages: { oak: keeri.images[0]! }, reviewLabel: null }, async () => {
    assert.equal(document.querySelectorAll(".pdp-variant-image img").length, 1);
    assert.equal(document.querySelectorAll(".pdp-variant-placeholder").length, 2);
    assert.equal(document.querySelector(".pdp-variants.pdp-variants-text"), null);
    await act(async () => tiles()[2]!.querySelector("input")!.click());
    assert.ok(notice(), "selecting an unmapped option discloses the missing photo");
  });
});
