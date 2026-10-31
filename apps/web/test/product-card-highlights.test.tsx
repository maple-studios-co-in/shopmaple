import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { storefrontContentSchema, toProductCard, type Product, type ProductHighlights } from "@shopmaple/contracts";
import { ProductCard } from "../components/product-card";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

const chair: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "", category: "chairs",
  images: ["https://example.com/aero.jpg"], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: ["Deep Atlantic", "Desert Taupe", "Slate Modern"].map((title, index) => ({
    id: `v${index}`, title, sku: null, pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, stockPolicy: "stocked" as const,
  })),
};
const highlights: ProductHighlights = {
  swatches: [{ name: "Deep Atlantic", hex: "#1f4e5f" }, { name: "Desert Taupe", hex: "#b9a58c" }],
  products: [{ handle: "aero-dining-chair", isNew: true, rating: { value: 4.6, count: 12 } }],
};

async function render(product: Product, value: ProductHighlights | undefined, check: (doc: Document) => void) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR",
    mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><ProductHighlightsProvider value={value}><ProductCard product={toProductCard(product)} /></ProductHighlightsProvider></ShopProvider>));
    check(dom.window.document);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.close(); }
}

test("card data carries the catalogue category and the distinct option names", () => {
  const card = toProductCard({ ...chair, variants: [...chair.variants, { ...chair.variants[0]!, id: "dup" }] });
  assert.equal(card.category, "chairs");
  assert.deepEqual(card.optionNames, ["Deep Atlantic", "Desert Taupe", "Slate Modern"]);
  assert.deepEqual(toProductCard({ ...chair, variants: [{ ...chair.variants[0]!, title: "Default Title" }] }).optionNames, []);
});

test("every card shows the category line and a discount chip worked out from the sale price", async () => {
  await render(chair, undefined, (doc) => {
    assert.equal(doc.querySelector("[data-card-category]")?.textContent, "Chairs");
    assert.equal(doc.querySelector("[data-card-discount]")?.textContent, "13% off");
    assert.equal(doc.querySelector("[data-card-swatches]"), null, "No dots without colours from the admin");
    assert.equal(doc.querySelector("[data-card-rating]"), null);
    assert.equal(doc.querySelector("[data-card-new]"), null);
  });
});

test("admin highlights add colour dots, a rating and a New badge, and only where they are set", async () => {
  await render(chair, highlights, (doc) => {
    const swatches = doc.querySelector("[data-card-swatches]")!;
    assert.equal(swatches.getAttribute("aria-label"), "Available in Deep Atlantic, Desert Taupe");
    assert.deepEqual([...swatches.querySelectorAll("[data-swatch]")].map((dot) => (dot as HTMLElement).style.backgroundColor), ["rgb(31, 78, 95)", "rgb(185, 165, 140)"]);
    assert.equal(doc.querySelector("[data-card-rating]")?.getAttribute("aria-label"), "Rated 4.6 out of 5 from 12 reviews");
    assert.equal(doc.querySelector("[data-card-new]")?.textContent, "New");
  });
});

test("the content contract accepts highlights and refuses invalid colours, ratings and duplicate products", () => {
  const content = (productHighlights: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, productHighlights });
  assert.equal(content(highlights).success, true);
  assert.equal(content({ ...highlights, swatches: [{ name: "Red", hex: "red" }] }).success, false);
  assert.equal(content({ ...highlights, products: [{ handle: "aero-dining-chair", isNew: false, rating: { value: 5.4, count: 2 } }] }).success, false);
  assert.equal(content({ ...highlights, products: [highlights.products[0], highlights.products[0]] }).success, false);
  assert.equal(content({ ...highlights, swatches: [highlights.swatches[0], { name: "deep atlantic", hex: "#000000" }] }).success, false);
});
