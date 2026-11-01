import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3003/products/nola" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const product: Product = {
  id: "nola", handle: "nola", title: "Nola Accent Chair", description: "A soft barrel-back accent chair.", category: "chairs",
  images: ["https://example.com/nola-1.jpg", "https://example.com/nola-2.jpg"], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "rust", title: "Rust", sku: "MF-NOLA-R", pricePaise: 2_950_000, compareAtPaise: 3_540_000, available: true, stockPolicy: "stocked" },
    { id: "ivory", title: "Ivory", sku: "MF-NOLA-I", pricePaise: 2_950_000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
  ],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = product) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}

test("the purchase column follows the design: title, price, struck-out price, description, finish heading and designer link", async () => {
  await mount((doc) => {
    const card = doc.querySelector("[data-product-info]")!;
    assert.equal(card.querySelector("h1")?.textContent, "Nola Accent Chair");
    assert.equal(card.querySelector("[data-price-block] strong")?.textContent, "Rs. 29,500.00");
    assert.equal(card.querySelector("[data-price-block] del")?.textContent, "Rs. 35,400.00");
    assert.equal(card.querySelector("[data-description]")?.textContent, "A soft barrel-back accent chair.");
    assert.equal(card.querySelector("[data-variants] legend")?.textContent, "Personalise your finish");
    const custom = card.querySelector<HTMLAnchorElement>("a[data-customization]")!;
    assert.match(custom.getAttribute("href") ?? "", /^\/pages\/contact\?product=Nola\+Accent\+Chair/);
  });
});

test("add to cart sits beside the quantity, with the customisation panel below", async () => {
  await mount((doc) => {
    const purchase = doc.querySelector("[data-purchase]")!;
    assert.equal(purchase.querySelector("button[data-primary]")?.textContent, "Add to cart");
    assert.ok(purchase.querySelector('[aria-label="Increase quantity"]'));
    const team = doc.querySelector<HTMLAnchorElement>("[data-custom] a")!;
    assert.equal(team.textContent?.trim(), "Speak to a designer →");
    assert.ok(doc.querySelector("button[data-share]"), "Share stays a real control");
  });
});

const rich = (heading: string, ...paragraphs: string[]) => ({ type: "root" as const, children: [
  { type: "heading" as const, level: 3, children: [{ type: "text" as const, value: heading }] },
  ...paragraphs.map((value) => ({ type: "paragraph" as const, children: [{ type: "text" as const, value }] })),
] });

test("admin rich text keeps its headings and paragraph spacing, and plain source text keeps its line breaks", async () => {
  const captured = { ...product, pdpContent: { source: "shopify-metafields" as const, sourceProductId: "gid://shopify/Product/1", capturedAt: "2026-10-26T00:00:00Z",
    details: rich("Frame", "Solid oak.", "Hand finished."), materialsCare: rich("Care", "Dry cloth."), shippingReturns: rich("Delivery", "Ask us.") } };
  await mount((doc) => {
    const panels = [...doc.querySelectorAll("[data-accordions] [data-prose]")];
    assert.equal(panels.length, 4, "Every accordion panel is styled as prose");
    for (const panel of panels) {
      assert.match(panel.className, /\[&_:is\(h2,h3,h4,h5,h6\)\]:font-serif/, "Headings keep a heading style");
      assert.match(panel.className, /\[&_p\+p\]:mt-2\.5/, "Paragraphs keep their spacing");
    }
    assert.equal(panels[0]!.querySelector("h3")?.textContent, "Frame");
  }, captured as Product);
  await mount((doc) => {
    const details = doc.querySelector("[data-accordions] [data-prose] p")!;
    assert.match(details.className, /whitespace-pre-line/, "Line breaks in source text survive");
  }, { ...product, sourceDetails: { details: "Line one\nLine two", materials: null, dimensions: null, careInstructions: null, warranty: null } } as Product);
});

test("the option group is named by its heading alone, and the customisation link sits outside it", async () => {
  await mount((doc) => {
    assert.equal(doc.querySelector("[data-variants] legend")?.textContent, "Personalise your finish");
    assert.equal(Boolean(doc.querySelector("[data-variants] a")), false, "The customisation link is outside the option group");
    assert.ok(doc.querySelector("a[data-customization]"));
  });
});

test("Share says so when the link cannot be copied", async () => {
  const nav = window.navigator as Navigator & { clipboard?: unknown };
  const saved = Object.getOwnPropertyDescriptor(nav, "clipboard");
  Object.defineProperty(nav, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
  try {
    await mount(async (doc) => {
      const status = doc.querySelector("[data-share-status]")!;
      assert.equal(status.getAttribute("role"), "status", "The live region is always present");
      await act(async () => doc.querySelector<HTMLButtonElement>("button[data-share]")!.click());
      assert.equal(status.textContent, "Couldn’t copy the link");
    });
  } finally { if (saved) Object.defineProperty(nav, "clipboard", saved); else Reflect.deleteProperty(nav, "clipboard"); }
});
