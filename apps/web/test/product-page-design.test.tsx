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
async function mount(check: (doc: Document) => void) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={product} /></ShopProvider></AppRouterContext.Provider>));
    check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}

test("the purchase card follows the design: title, price with discount chip, description, option label and customization link", async () => {
  await mount((doc) => {
    const card = doc.querySelector("[data-product-info]")!;
    assert.equal(card.querySelector("h1")?.textContent, "Nola Accent Chair");
    assert.equal(card.querySelector("[data-price-block] strong")?.textContent, "Rs. 29,500.00");
    assert.equal(card.querySelector("[data-discount]")?.textContent, "17% off");
    assert.equal(card.querySelector("[data-price-block] del")?.textContent, "Rs. 35,400.00");
    assert.equal(card.querySelector("[data-description]")?.textContent, "A soft barrel-back accent chair.");
    assert.match(card.querySelector("[data-variants] legend")?.textContent ?? "", /^Option: Rust/);
    const custom = card.querySelector<HTMLAnchorElement>("[data-variants] a[data-customization]")!;
    assert.equal(custom.textContent?.trim(), "Customization available");
    assert.match(custom.getAttribute("href") ?? "", /^\/pages\/contact\?product=Nola\+Accent\+Chair/);
  });
});

test("add to cart sits beside the quantity, with a full-width enquiry below and the promises after", async () => {
  await mount((doc) => {
    const purchase = doc.querySelector("[data-purchase]")!;
    assert.equal(purchase.querySelector("button[data-primary]")?.textContent, "Add to cart");
    assert.ok(purchase.querySelector('[aria-label="Increase quantity"]'));
    const team = doc.querySelector<HTMLAnchorElement>("[data-custom] a")!;
    assert.equal(team.textContent?.trim(), "Speak to our team");
    assert.deepEqual([...doc.querySelectorAll("[data-product-promises] li")].map((item) => item.textContent), ["Made to order in Delhi", "36-month warranty", "Delivery across India"]);
    assert.equal(doc.querySelector<HTMLAnchorElement>("a[data-ask]")?.textContent?.trim(), "Ask a question");
    assert.ok(doc.querySelector("button[data-share]"), "Share stays a real control");
  });
});

test("the details read as the design's 'Precision in every detail' section beside a product picture", async () => {
  await mount((doc) => {
    const section = doc.querySelector("[data-product-details]")!;
    assert.equal(section.querySelector("h2")?.textContent, "Precision in every detail");
    assert.deepEqual([...section.querySelectorAll("[data-accordions] summary")].map((summary) => summary.textContent), ["Details", "Materials + Care", "Shipping + Returns", "Dimensions & specifications"]);
    assert.equal(section.querySelector("img")?.getAttribute("src")?.includes("nola-2"), true, "The second photo pictures the details");
  });
});
