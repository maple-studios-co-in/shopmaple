import { toProductCard } from "../lib/product-card-model";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { Product, Variant } from "@shopmaple/contracts";
import { ProductCard } from "../components/product-card";
import { ShopProvider } from "../components/shop-provider";

const base: Product = {
  id: "display-chair", handle: "display-chair", title: "Display Chair", description: "Detailed upholstery description",
  category: "chairs", images: ["https://example.com/first.jpg", "https://example.com/gallery.jpg"],
  published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [],
};
function variant(id: string, pricePaise: number | null, compareAtPaise: number | null = null): Variant {
  return { id, title: id, sku: `SKU-${id}`, pricePaise, compareAtPaise, available: false, stockPolicy: "unverified" };
}
async function card(product: Product, check: (document: Document) => void | Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR",
    mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><ProductCard product={toProductCard(product)} /></ShopProvider>));
    await check(document);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.close(); }
}
for (const scenario of [
  { name: "no options", variants: [], price: "Price on request", sale: null, request: false },
  { name: "unknown price with compare-at", variants: [variant("unknown", null, 50000)], price: "Price on request", sale: null, request: false },
  { name: "different prices", variants: [variant("high", 50000), variant("low", 25000)], price: "From Rs. 250.00", sale: null, request: false },
  { name: "mixed known and unknown", variants: [variant("unknown", null), variant("low", 25000, 30000)], price: "From Rs. 250.00", sale: "Rs. 300.00", request: true },
  { name: "equal prices preserve first option discount", variants: [variant("first", 25000, 30000), variant("second", 25000, 50000)], price: "Rs. 250.00", sale: "Rs. 300.00", request: false },
  { name: "discount only on more expensive option", variants: [variant("low", 25000, 25000), variant("high", 50000, 60000)], price: "From Rs. 250.00", sale: null, request: false },
  { name: "known zero price is displayed without allowing purchase", variants: [variant("zero", 0)], price: "Rs. 0.00", sale: null, request: false },
]) {
  test(`card preserves ${scenario.name}`, async () => {
    const product = { ...base, variants: scenario.variants };
    const original = structuredClone(product);
    await card(product, (doc) => {
      assert.equal(doc.querySelector("[data-card-price] span")?.textContent, scenario.price);
      assert.equal(doc.querySelector("[data-card-price] del")?.textContent ?? null, scenario.sale);
      assert.equal(Boolean(doc.querySelector("[data-card-sale]")), scenario.sale !== null);
      assert.equal(doc.querySelector("[data-product-card] p[data-card-options]")?.textContent ?? null,
        scenario.request ? "Other options on request" : null);
      assert.equal(doc.querySelector("a[data-card-options]")?.textContent?.trim() ?? null,
        scenario.variants.length > 1 ? `${scenario.variants.length} options` : null);
      assert.equal(doc.querySelector("[data-product-card] img")?.getAttribute("src"), "https://example.com/first.jpg");
      assert.equal(doc.querySelector("[data-card-name]")?.getAttribute("href"), "/products/display-chair");
      assert.deepEqual(product, original, "pricing must not mutate source variant order");
    });
  });
}
test("card keeps save and unsave behaviour without requiring the detailed catalogue", async () => {
  await card(base, async (doc) => {
    const button = doc.querySelector<HTMLButtonElement>('[aria-label="Save Display Chair"]')!;
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(button.getAttribute("aria-label"), "Unsave Display Chair");
    assert.deepEqual(JSON.parse(localStorage.getItem("maple-favourites")!), ["display-chair"]);
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.deepEqual(JSON.parse(localStorage.getItem("maple-favourites")!), []);
  });
});
