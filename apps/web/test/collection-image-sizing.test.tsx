import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { Product } from "@shopmaple/contracts";
import { CollectionListing } from "../components/collection-listing";
import { ShopProvider } from "../components/shop-provider";
import { collectionQuery } from "../lib/collections";

test("changing collection density updates image slots while retaining product artwork and links", async () => {
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
      query={collectionQuery({})} products={[product]} total={1} collectionTotal={1} limit={24}
      inStock={0} outOfStock={1} highestPrice={null} /></ShopProvider>));
    const image = document.querySelector<HTMLImageElement>(".collection-products img")!;
    const standard = "(max-width:749px) calc((100vw - 44px) / 2), (max-width:1100px) calc((100vw - 274px) / 2), (max-width:1599px) calc((100vw - 356px) / 3), (min-width:1920px) 387px, calc((100vw - 372px) / 4)";
    assert.equal(image.sizes, standard);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Compact grid"]')!.click());
    // Compact mobile retains its 8px gap even though it uses two columns.
    assert.equal(image.sizes, "(max-width:749px) calc((100vw - 40px) / 2), (max-width:1100px) calc((100vw - 306px) / 5), (min-width:1920px) 309.6px, calc((100vw - 372px) / 5)");
    assert.equal(image.getAttribute("src"), "https://example.com/chair.jpg");
    assert.equal(image.closest("a")?.getAttribute("href"), "/products/chair");
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Standard grid"]')!.click());
    assert.equal(image.sizes, standard);
    assert.equal(document.querySelectorAll(".collection-products .product-card").length, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});
