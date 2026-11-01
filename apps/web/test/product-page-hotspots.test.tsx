import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

// The owner asked for a white-background photo with hotspots about fabric and material that changes with the finish
// (2026-11-02). Cut-outs and hotspot positions are presentation data; every note is read from the product's own text.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const materials = "• Frame & Legs: Solid wood, dark walnut and natural oak finishes\n • Upholstery: Velvet and Boucle over high-resilience foam\n \n The Beauty of Natural Materials\n Slight variations are part of its character.";
const dimensions = '• Width: 22" (≈ 56 cm)\n • Depth: 24" (≈ 61 cm)\n • Height: 34" (≈ 86 cm)';
const aero: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A dining chair.", category: "chairs", published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  images: ["https://example.com/p-1.jpg", "https://example.com/p-2.jpg"],
  sourceDetails: { details: "Details.", materials, dimensions, careInstructions: null, warranty: null },
  variants: [
    { id: "ivory", title: "Nordic Ivory", sku: "A", pricePaise: 2_400_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: ["https://example.com/ivory-1.jpg", "https://example.com/ivory-2.jpg"], slug: "nordic-ivory" },
    { id: "atlantic", title: "Deep Atlantic", sku: "B", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: ["https://example.com/atlantic-1.jpg"], slug: "deep-atlantic" },
    { id: "plain", title: "Plain", sku: "C", pricePaise: 2_500_000, compareAtPaise: null, available: false, stockPolicy: "unverified", slug: "plain" },
  ],
};
const spots = [
  { x: 0.5, y: 0.5, label: "Upholstery", from: "materials", line: "Upholstery" },
  { x: 0.3, y: 0.75, label: "Frame & legs", from: "materials", line: "Frame & Legs" },
  { x: 0.5, y: 0.1, label: "Size", from: "dimensions" },
];
const cutouts = {
  "deep-atlantic": { image: "/product-page/cutouts/aero-dining-chair/deep-atlantic.jpg", hotspots: spots },
  "nordic-ivory": { image: "/product-page/cutouts/aero-dining-chair/nordic-ivory.jpg", hotspots: [{ ...spots[0], x: 0.4 }] },
};
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = aero, presentation: object | undefined = { variantImages: {}, reviewLabel: null, cutouts }) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  window.history.replaceState(null, "", "/products/aero-dining-chair");
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} presentation={presentation as never} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const mainSrc = (doc: Document) => decodeURIComponent(doc.querySelector("[data-main-image] img")!.getAttribute("src")!);
const markers = (doc: Document) => [...doc.querySelectorAll<HTMLButtonElement>("button[data-hotspot]")];

test("the chosen finish opens on its white-background photo, also the first thumbnail, with a marker per hotspot", async () => {
  await mount((doc) => {
    assert.match(mainSrc(doc), /cutouts\/aero-dining-chair\/deep-atlantic\.jpg/);
    assert.match(decodeURIComponent(doc.querySelector("[data-thumbnails] button img")!.getAttribute("src")!), /deep-atlantic\.jpg/);
    assert.match(decodeURIComponent(doc.querySelectorAll("[data-thumbnails] button img")[1]!.getAttribute("src")!), /atlantic-1\.jpg/, "then the finish's own photos");
    assert.deepEqual(markers(doc).map((marker) => marker.getAttribute("aria-label")), ["Upholstery", "Frame & legs", "Size"]);
  });
});

test("a marker opens a note read from the product's own text, one at a time, and Escape closes it", async () => {
  await mount(async (doc) => {
    const [fabric, frame, size] = markers(doc);
    assert.equal(fabric!.getAttribute("aria-expanded"), "false");
    assert.equal(doc.querySelector("[data-hotspot-note]"), null);
    await act(async () => fabric!.click());
    assert.equal(fabric!.getAttribute("aria-expanded"), "true");
    assert.equal(text(doc.querySelector("[data-hotspot-note]")), "Upholstery Velvet and Boucle over high-resilience foam");
    await act(async () => frame!.click());
    assert.equal(doc.querySelectorAll("[data-hotspot-note]").length, 1);
    assert.equal(text(doc.querySelector("[data-hotspot-note]")), "Frame & legs Solid wood, dark walnut and natural oak finishes");
    assert.equal(fabric!.getAttribute("aria-expanded"), "false");
    await act(async () => size!.click());
    assert.equal(text(doc.querySelector("[data-hotspot-note]")), 'Size Width 22" (≈ 56 cm) · Depth 24" (≈ 61 cm) · Height 34" (≈ 86 cm)');
    await act(async () => { size!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(doc.querySelector("[data-hotspot-note]"), null);
    assert.ok(document.activeElement === size, "focus stays on the marker");
  });
});

test("changing the finish swaps the white-background photo and its hotspots, and a finish without one shows its normal photo and no markers", async () => {
  await mount(async (doc) => {
    await act(async () => markers(doc)[0]!.click());
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="ivory"]')!.click());
    assert.match(mainSrc(doc), /nordic-ivory\.jpg/);
    assert.equal(markers(doc).length, 1);
    assert.equal(doc.querySelector("[data-hotspot-note]"), null, "an open note closes with the finish");
    assert.equal(markers(doc)[0]!.style.left, "40%");
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="plain"]')!.click());
    assert.doesNotMatch(mainSrc(doc), /cutouts/);
    assert.equal(markers(doc).length, 0);
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="atlantic"]')!.click());
    assert.match(mainSrc(doc), /deep-atlantic\.jpg/);
    assert.equal(markers(doc).length, 3);
  });
});

test("markers show only on the white-background photo, not on the finish's other photos", async () => {
  await mount(async (doc) => {
    await act(async () => doc.querySelectorAll<HTMLButtonElement>("[data-thumbnails] button")[1]!.click());
    assert.match(mainSrc(doc), /atlantic-1\.jpg/);
    assert.equal(markers(doc).length, 0);
    await act(async () => doc.querySelectorAll<HTMLButtonElement>("[data-thumbnails] button")[0]!.click());
    assert.equal(markers(doc).length, 3);
  });
});

test("a hotspot whose text is not in the product's data is left out, never invented", async () => {
  await mount((doc) => assert.deepEqual(markers(doc).map((marker) => marker.getAttribute("aria-label")), ["Upholstery", "Frame & legs"]),
    { ...aero, sourceDetails: { ...aero.sourceDetails!, dimensions: null } });
  await mount((doc) => assert.deepEqual(markers(doc).map((marker) => marker.getAttribute("aria-label")), ["Size"]),
    { ...aero, sourceDetails: { ...aero.sourceDetails!, materials: "Beech frame." } });
  await mount((doc) => { assert.equal(markers(doc).length, 0, "no text, no markers"); assert.match(mainSrc(doc), /deep-atlantic\.jpg/, "the white-background photo still shows"); },
    { ...aero, sourceDetails: null });
});

test("products without cut-out data behave as before", async () => {
  await mount((doc) => {
    assert.equal(markers(doc).length, 0);
    assert.doesNotMatch(mainSrc(doc), /cutouts/);
    assert.match(mainSrc(doc), /atlantic-1\.jpg/, "the finish's own first photo, as before");
  }, aero, { variantImages: {}, reviewLabel: null });
});
