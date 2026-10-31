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

const product = (handle: string, title: string): Product => ({ id: handle, handle, title, description: "A chair.",
  category: "chairs", images: [`https://example.com/${handle}.jpg`], published: true, source: "test",
  sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: `${handle}-v`, title: "Default", sku: null, pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, options: {} } as never] });

async function render(handle: string, title: string, headingLevel: "h1" | "h2", check: (doc: Document) => void) {
  const dom = new JSDOM("<div id='root'></div>", { url: `http://localhost:3000/collections/${handle}` });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0,
    currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><CollectionListing handle={handle} title={title} headingLevel={headingLevel}
      query={collectionQuery({})} products={[toProductCard(product("aero-dining-chair", "Aero Dining Chair")), toProductCard(product("caro", "Caro"))]}
      total={2} collectionTotal={2} limit={24} inStock={2} outOfStock={0} highestPrice={6_500_000} /></ShopProvider>));
    check(dom.window.document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
}

test("the chair listing opens with the design's introduction: collection name, headline, image and a jump to the results", async () => {
  await render("chairs", "Chairs", "h1", (doc) => {
    const intro = doc.querySelector("[data-collection-intro]")!;
    assert.ok(intro, "The introduction is rendered");
    assert.equal(intro.querySelector("h1")?.textContent, "Chairs", "The collection name stays the page heading");
    assert.match(intro.textContent ?? "", /Made for long conversations\./);
    assert.equal(intro.querySelector<HTMLAnchorElement>("a[data-intro-cta]")?.getAttribute("href"), "#collection-results");
    assert.equal(intro.querySelector("a[data-intro-cta]")?.textContent?.trim(), "Find your chair");
    assert.equal(intro.querySelector("img")?.getAttribute("src"), "https://example.com/aero-dining-chair.jpg", "The first piece pictures the collection");
    assert.equal(doc.querySelectorAll("[data-promise-strip] li").length, 4, "The four promises follow the introduction");
  });
});

test("other collections get a generic introduction, and the editorial chair page keeps its own hero", async () => {
  await render("sofas", "Sofas", "h1", (doc) => {
    assert.equal(doc.querySelector("[data-collection-intro] h1")?.textContent, "Sofas");
    assert.equal(doc.querySelector("a[data-intro-cta]")?.textContent?.trim(), "Browse sofas");
  });
  await render("chairs", "Chairs", "h2", (doc) => {
    assert.equal(doc.querySelector("[data-collection-intro]"), null, "No second hero under the editorial page");
    assert.equal(doc.querySelector("#collection-products h2")?.textContent, "Chairs");
  });
});

test("the all-furniture results row does not repeat the word all", async () => {
  await render("all", "All furniture", "h1", (doc) => {
    assert.equal(doc.querySelector("[data-results-heading]")?.textContent, "All furniture");
  });
});

test("the results row, filter card and custom order prompt follow the design", async () => {
  await render("chairs", "Chairs", "h1", (doc) => {
    const results = doc.querySelector("[data-results-heading]")!;
    assert.match(results.textContent ?? "", /All chairs/);
    assert.equal(doc.querySelector("[data-item-count]")?.textContent, "2 products");
    assert.ok(doc.querySelector('select[name="sort"]'), "Sorting stays a real control");
    const filters = doc.querySelector('[aria-label="Collection filters"]')!;
    assert.match(filters.querySelector("h2")?.textContent ?? "", /^Filters$/);
    assert.ok(filters.querySelector('a[href="/collections/chairs?page=1"]')?.textContent?.includes("Clear all"));
    assert.equal(filters.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent?.trim(), "Apply filters");
    const custom = doc.querySelector("[data-custom-order]")!;
    assert.equal(custom.querySelector("h2")?.textContent, "Can’t find what you’re looking for?");
    assert.equal(custom.querySelector("a")?.getAttribute("href"), "/pages/contact?product=Custom%20furniture");
    assert.equal(doc.querySelectorAll("[data-collection-products] [data-product-card]").length, 2);
  });
});
