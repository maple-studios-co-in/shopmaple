import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

// The product page shows the chosen variant's own photos (then the photos every variant shares),
// pictures each option with its own photo, and names the option in the address by its slug.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3003/products/alain" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const photo = (name: string) => `https://store.maplefurnishers.com/media/keeri/${name}.webp`;
const product: Product = {
  id: "keeri:t:alain", handle: "alain", title: "Alain", description: "A boucle dining chair.", category: "chairs",
  images: [photo("room"), photo("ivory-front"), photo("ivory-side"), photo("walnut-front")], published: true, source: "keeri:t", sourceUpdatedAt: "2026-10-31T00:00:00Z",
  variants: [
    { id: "keeri:t:v1", title: "Ivory Boucle", sku: "ALAIN-IB", pricePaise: 2_950_000, compareAtPaise: null, available: true, stockPolicy: "stocked", slug: "ivory-boucle", images: [photo("ivory-front"), photo("ivory-side")] },
    { id: "keeri:t:v2", title: "Dark Walnut", sku: "ALAIN-DW", pricePaise: 2_950_000, compareAtPaise: null, available: true, stockPolicy: "stocked", slug: "dark-walnut", images: [photo("walnut-front")] },
  ],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
async function mount(check: (doc: Document) => void | Promise<void>, initialVariant?: string, value: Product = product) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} initialVariant={initialVariant} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
/** The photo names the gallery's thumbnails show, in order. */
const gallery = (doc: Document) => [...doc.querySelectorAll("[data-thumbnails] button[data-index] img")]
  .map((img) => decodeURIComponent(img.getAttribute("src") ?? "").match(/keeri\/([a-z-]+)\.webp/)?.[1]);
const option = (doc: Document, name: string) => [...doc.querySelectorAll<HTMLElement>("[data-variants] label, [data-variants] button")].find((el) => el.textContent?.includes(name))!;

test("the chosen variant's own photos come first, then the shared ones; the other variant's photos stay out", async () => {
  await mount((doc) => {
    assert.deepEqual(gallery(doc), ["walnut-front", "room"]);
  }, "dark-walnut");
  await mount((doc) => {
    assert.deepEqual(gallery(doc), ["ivory-front", "ivory-side", "room"], "with no choice, the first variant shows");
  });
});

test("each option is pictured by its own photo", async () => {
  await mount((doc) => {
    assert.equal(doc.querySelector("[data-variants]")?.getAttribute("data-variants"), "photo");
    const pictured = [...doc.querySelectorAll("[data-variants] [data-variant-image] img")].map((img) => decodeURIComponent(img.getAttribute("src") ?? "").match(/keeri\/([a-z-]+)\.webp/)?.[1]);
    assert.deepEqual(pictured, ["ivory-front", "walnut-front"]);
  });
});

test("choosing an option swaps the gallery and names it in the address by its slug", async () => {
  await mount(async (doc) => {
    const walnut = option(doc, "Dark Walnut").querySelector<HTMLInputElement>("input") ?? option(doc, "Dark Walnut");
    await act(async () => walnut.click());
    assert.deepEqual(gallery(doc), ["walnut-front", "room"]);
    assert.equal(new URL(window.location.href).searchParams.get("variant"), "dark-walnut");
  });
});

test("an older link that names the variant by id still opens it", async () => {
  await mount((doc) => assert.deepEqual(gallery(doc), ["walnut-front", "room"]), "keeri:t:v2");
});

test("a product without per-variant photos keeps its whole gallery", async () => {
  const plain: Product = { ...product, variants: product.variants.map(({ images: _images, ...v }) => v) };
  await mount((doc) => assert.deepEqual(gallery(doc), ["room", "ivory-front", "ivory-side", "walnut-front"]), undefined, plain);
});
