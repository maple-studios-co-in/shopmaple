import { toProductCard } from "../lib/product-card-model";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { Product } from "@shopmaple/contracts";
import { CollectionListing } from "../components/collection-listing";
import { ShopProvider } from "../components/shop-provider";
import { collectionQuery } from "../lib/collections";

// "Maple / PDF Review / Product Listing": the filter card, results row and grid.
const product = (handle: string, title: string): Product => ({ id: handle, handle, title, description: "A chair.",
  category: "chairs", images: [`https://example.com/${handle}.jpg`], published: true, source: "test",
  sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: `${handle}-v`, title: "Default", sku: null, pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, options: {} } as never] });

async function render(handle: string, raw: Record<string, string>, check: (doc: Document) => void) {
  const dom = new JSDOM("<div id='root'></div>", { url: `http://localhost:3000/collections/${handle}` });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0,
    currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><CollectionListing handle={handle} title={handle === "all" ? "All furniture" : "Chairs"}
      query={collectionQuery(raw)} products={[toProductCard(product("aero-dining-chair", "Aero Dining Chair")), toProductCard(product("caro", "Caro"))]}
      total={2} collectionTotal={2} limit={24} inStock={2} outOfStock={0} highestPrice={6_500_000} /></ShopProvider>));
    check(dom.window.document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
}

const desktopFilters = (doc: Document) => doc.querySelector('[aria-label="Collection filters"]')!;
// The label as read aloud: decorative glyphs (aria-hidden) are not part of it.
const labelOf = (input: HTMLInputElement) => {
  const label = input.closest("label")!.cloneNode(true) as Element;
  label.querySelectorAll("[aria-hidden=true]").forEach((glyph) => glyph.remove());
  return label.textContent?.replace(/\s+/g, " ").trim();
};

test("availability is a pair of tick boxes: ticking neither (or both) shows every piece", async () => {
  await render("chairs", {}, (doc) => {
    const filters = desktopFilters(doc);
    const boxes = [...filters.querySelectorAll<HTMLInputElement>('input[name="availability"]')];
    assert.deepEqual(boxes.map((box) => box.type), ["checkbox", "checkbox"]);
    assert.deepEqual(boxes.map((box) => box.value), ["in", "out"]);
    assert.deepEqual(boxes.map(labelOf), ["Available to order 2", "Enquiry only 0"], "Counts come from the catalogue");
    assert.deepEqual(boxes.map((box) => box.checked), [false, false]);
  });
  await render("chairs", { availability: "out" }, (doc) => {
    const boxes = [...desktopFilters(doc).querySelectorAll<HTMLInputElement>('input[name="availability"]')];
    assert.deepEqual(boxes.map((box) => box.checked), [false, true]);
  });
});

test("the all-furniture category facet lists each category as a choice instead of a drop-down", async () => {
  await render("all", { category: "beds" }, (doc) => {
    const facet = desktopFilters(doc).querySelector('[data-facet="category"]')!;
    assert.ok(facet, "The category facet is shown on all furniture");
    assert.equal(facet.querySelector("select"), null);
    const choices = [...facet.querySelectorAll<HTMLInputElement>('input[name="category"]')];
    assert.deepEqual(choices.map((choice) => choice.value), ["", "sofas", "chairs", "tables", "beds", "storage", "outdoors"]);
    assert.deepEqual(choices.map(labelOf), ["All furniture", "Sofas", "Chairs", "Tables", "Beds", "Storage", "Outdoors"]);
    assert.deepEqual(choices.filter((choice) => choice.checked).map((choice) => choice.value), ["beds"]);
  });
  await render("chairs", {}, (doc) => {
    assert.equal(desktopFilters(doc).querySelector('[data-facet="category"]'), null, "A single collection has no category to choose");
  });
});

test("the filter card offers only the facets the catalogue can answer, in the design's order", async () => {
  await render("all", {}, (doc) => {
    const facets = [...desktopFilters(doc).querySelectorAll("[data-facet]")].map((facet) => facet.getAttribute("data-facet"));
    // Material, colour and size are in the design but the catalogue has no data for them yet.
    assert.deepEqual(facets, ["availability", "price", "category", "search"]);
    assert.equal(desktopFilters(doc).querySelector("[data-price-caption]")?.textContent, "Rs. 0 — Rs. 65,000");
  });
});

test("the results row reads collection, count and sort in one line above outlined cards", async () => {
  await render("chairs", { sort: "featured" }, (doc) => {
    const bar = doc.querySelector("[data-results-bar]")!;
    assert.ok(bar, "The results row is rendered");
    const [heading, count, sort] = [...bar.querySelectorAll("[data-results-heading], [data-item-count], [data-sort]")];
    assert.equal(heading?.textContent, "All chairs");
    assert.equal(count?.textContent, "2 products");
    assert.equal(sort?.querySelector("label")?.textContent, "Sort:");
    const select = sort?.querySelector<HTMLSelectElement>("select[name=sort]");
    assert.equal(select?.selectedOptions[0]?.textContent, "Featured");
    const cards = [...doc.querySelectorAll("[data-collection-products] [data-product-card]")];
    assert.equal(cards.length, 2);
    assert.ok(cards.every((card) => card.getAttribute("data-card-surface") === "outlined"), "Grid cards use the design's 243 px outlined surface");
  });
});
