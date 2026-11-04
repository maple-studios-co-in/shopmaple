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

test("collection image slots follow the four-across grid while retaining product artwork and links", async () => {
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
    const image = document.querySelector<HTMLImageElement>(".collection-products img")!;
    // Two across on phones, three on tablets and beside the filters, then frame 1:1155's four 243px cards.
    // From 1600px the grid grows with the screen, and from 1900px it holds six across (owner, 4 Nov 2026).
    assert.equal(image.sizes, "(max-width:767px) calc((100vw - 44px) / 2), (max-width:1023px) calc((100vw - 96px) / 3), (max-width:1279px) calc((100vw - 452px) / 3), (min-width:1900px) calc((100vw - 468px) / 6), (min-width:1600px) calc((100vw - 436px) / 4), (min-width:1440px) 243px, calc((100vw - 468px) / 4)");
    assert.equal(image.getAttribute("src"), "https://example.com/chair.jpg");
    assert.equal(image.closest("a")?.getAttribute("href"), "/products/chair");
    assert.equal(document.querySelectorAll(".collection-products [data-product-card]").length, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});
