import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { cheapestPriced } from "../components/store/product-assurances";
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
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = aero, initialVariant?: string) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  window.history.replaceState(null, "", "/products/aero-dining-chair");
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} initialVariant={initialVariant} /></ShopProvider></AppRouterContext.Provider>));
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

test("the page opens on a priced finish with a photo, and the chosen finish is the one shown", async () => {
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

test("every finish tile names its finish for hover and screen readers, and finishes that share a name are told apart by position, not by code", async () => {
  await mount((doc) => {
    const labels = [...doc.querySelectorAll<HTMLElement>("[data-variants] label")];
    const names = ["Nordic Ivory", "Desert Taupe (option 1 of 2)", "Deep Atlantic", "Desert Taupe (option 2 of 2)"];
    assert.deepEqual(labels.map((label) => label.getAttribute("title")), names);
    const accessibleName = (label: HTMLElement) => { const copy = label.cloneNode(true) as HTMLElement; copy.querySelectorAll("[aria-hidden=true]").forEach((hidden) => hidden.remove()); return text(copy); };
    assert.deepEqual(labels.map(accessibleName), names, "The accessible name of each radio is its label text, without the decorative tile");
  });
});

const variant = (id: string, pricePaise: number | null, images?: string[]) => ({ id, title: id, sku: id.toUpperCase(), pricePaise, compareAtPaise: null, available: false, stockPolicy: "made_to_order" as const, ...(images ? { images } : {}), slug: id });
const withVariants = (...variants: Product["variants"]): Product => ({ ...aero, variants });
const photo = (id: string) => `https://example.com/${id}.jpg`;
const checked = (doc: Document) => doc.querySelector<HTMLInputElement>("input[name=variant]:checked")?.value;

test("the default finish is the cheapest priced one that has a photo, so the page opens on a finish with both", async () => {
  await mount((doc) => {
    assert.equal(checked(doc), "cheap-photo");
    assert.equal(text(doc.querySelector("[data-price]")), "Rs. 20,000.00");
    assert.match(doc.querySelector("[data-main-image] img")!.getAttribute("src")!, /cheap\.jpg/);
  }, withVariants(variant("dear-photo", 3_000_000, [photo("dear")]), variant("cheap-photo", 2_000_000, [photo("cheap")]), variant("cheapest-plain", 1_500_000), variant("unpriced", null, [photo("u")])));
});

test("without a priced finish that has a photo, the cheapest priced one; ties go to the first; unpriced pieces open on the first photo, else the first finish", async () => {
  await mount((doc) => assert.equal(checked(doc), "cheap-plain"), withVariants(variant("dear-plain", 3_000_000), variant("cheap-plain", 2_000_000), variant("unpriced", null, [photo("u")])));
  await mount((doc) => assert.equal(checked(doc), "b-photo"), withVariants(variant("a-plain", 2_000_000), variant("b-photo", 2_000_000, [photo("b")]), variant("c-photo", 2_000_000, [photo("c")])));
  await mount((doc) => assert.equal(checked(doc), "a-plain"), withVariants(variant("a-plain", 2_000_000), variant("b-plain", 2_000_000)));
  await mount((doc) => assert.equal(checked(doc), "has-photo"), withVariants(variant("none", null), variant("has-photo", null, [photo("h")])));
  await mount((doc) => assert.equal(checked(doc), "none"), withVariants(variant("none", null), variant("none-2", null)));
  assert.equal(cheapestPriced([variant("x", null)], () => true), undefined);
});

test("a finish named in the address wins over the default", async () => {
  await mount((doc) => assert.equal(checked(doc), "ivory"), aero, "nordic-ivory");
  await mount((doc) => assert.equal(checked(doc), "taupe-k"), aero, "desert-taupe-2");
});
