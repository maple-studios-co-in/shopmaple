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

test("listing image slots follow the design grid while retaining product artwork and links", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000/collections/all" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0,
    currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const product: Product = { id: "chair", handle: "chair", title: "Dining Chair", description: "A chair.",
    category: "chairs", images: ["https://example.com/chair.jpg"], published: true, source: "test",
    sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><CollectionListing handle="all" title="Furniture"
      query={collectionQuery({})} products={[toProductCard(product)]} total={1} collectionTotal={1} limit={24}
      inStock={0} outOfStock={1} highestPrice={null} /></ShopProvider>));
    const image = document.querySelector<HTMLImageElement>("[data-collection-products] img")!;
    // Two columns on phones, three beside the filter card on tablets and small laptops, four from
    // 1280 px, and a fixed 243 px card once the 1312 px content width is reached.
    assert.equal(image.sizes, "(max-width:767px) calc((100vw - 44px) / 2), (max-width:1023px) calc((100vw - 96px) / 3), (max-width:1279px) calc((100vw - 420px) / 3), (min-width:1440px) 243px, calc((100vw - 468px) / 4)");
    assert.equal(image.getAttribute("src"), "https://example.com/chair.jpg");
    assert.equal(image.closest("a")?.getAttribute("href"), "/products/chair");
    assert.equal(document.querySelector('[aria-label="Product grid size"]'), null, "The design has one grid density");
    assert.equal(document.querySelectorAll("[data-collection-products] [data-product-card]").length, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});
