import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

// The owner's review of the live page (2026-11-02): item codes, and the chosen finish not coming up properly.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
// Shaped like the live aero-dining-chair: finishes from two sources, three of them unpriced, one priced with photos,
// two priced without photos, and names that repeat.
const aero: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A dining chair.", category: "chairs", published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  images: ["https://example.com/a-1.jpg", "https://example.com/a-2.jpg", "https://example.com/a-3.jpg"],
  sourceDetails: { details: "Details.", materials: "Oak.", dimensions: "Width 56 cm", careInstructions: null, warranty: null },
  variants: [
    { id: "ivory", title: "Nordic Ivory", sku: "MPL-CH-DIN-AERO-SWLNOBN", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: ["https://example.com/ivory.jpg"], slug: "nordic-ivory" },
    { id: "taupe-k", title: "Desert Taupe", sku: "MPL-CH-DIN-AERO-MTHBLNN", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: ["https://example.com/taupe.jpg"], slug: "desert-taupe-2" },
    { id: "atlantic", title: "Deep Atlantic", sku: "MPL-CH-DIN-AERO-RTBDWVN", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: false, stockPolicy: "made_to_order", images: ["https://example.com/atlantic.jpg"], slug: "deep-atlantic" },
    { id: "taupe-s", title: "Desert Taupe", sku: "MPL-CH-DIN-NOR-07-03", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: false, stockPolicy: "unverified", slug: "desert-taupe" },
  ],
};
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = aero) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  window.history.replaceState(null, "", "/products/aero-dining-chair");
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

test("item codes are not written on the page, while the enquiry links still carry them", async () => {
  await mount((doc) => {
    const page = doc.querySelector("[data-product-page]")!;
    assert.doesNotMatch(page.textContent!, /Item code|MPL-CH|SKU/i);
    assert.equal(doc.querySelector("[data-variant-code]"), null);
    assert.match(doc.querySelector<HTMLAnchorElement>("a[data-ask]")!.getAttribute("href")!, /sku=MPL-CH-DIN-AERO-RTBDWVN/);
  });
});

test("the page opens on a priced finish with a photo, so its price matches the cards and the chosen finish is the one shown", async () => {
  await mount((doc) => {
    assert.equal(doc.querySelector<HTMLInputElement>("input[name=variant]:checked")?.value, "atlantic");
    assert.equal(text(doc.querySelector("[data-variants] legend")), "Finish: Deep Atlantic");
    assert.equal(text(doc.querySelector("[data-price]")), "Rs. 23,600.00");
    assert.match(doc.querySelector("[data-main-image] img")!.getAttribute("src")!, /atlantic\.jpg/);
  });
});

test("exactly one finish tile is marked as chosen, it is the checked one, and the mark moves with the choice", async () => {
  await mount(async (doc) => {
    const marked = () => [...doc.querySelectorAll("[data-variants] label")].filter((label) => label.getAttribute("data-selected") === "true");
    assert.equal(marked().length, 1);
    assert.equal(marked()[0]!.querySelector<HTMLInputElement>("input")!.value, "atlantic");
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="ivory"]')!.click());
    assert.equal(marked().length, 1);
    assert.equal(marked()[0]!.querySelector<HTMLInputElement>("input")!.value, "ivory");
    assert.equal(text(doc.querySelector("[data-variants] legend")), "Finish: Nordic Ivory");
    assert.equal(new URL(window.location.href).searchParams.get("variant"), "nordic-ivory");
    assert.match(doc.querySelector("[data-main-image] img")!.getAttribute("src")!, /ivory\.jpg/);
  });
});

test("every finish tile names its finish for hover and screen readers, since photo tiles show no caption", async () => {
  await mount((doc) => {
    const labels = [...doc.querySelectorAll<HTMLElement>("[data-variants] label")];
    assert.deepEqual(labels.map((label) => label.getAttribute("title")), ["Nordic Ivory", "Desert Taupe", "Deep Atlantic", "Desert Taupe"]);
  });
});
