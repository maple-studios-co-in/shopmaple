import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product, Variant } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ProductCard } from "../components/product-card";
import { ProductCard as FigmaCard } from "../components/store/product-card-figma";
import { ShopProvider } from "../components/shop-provider";
import { toProductCard } from "../lib/product-card-model";

// The "Free delivery" badge for variants Keeri staff ticked (Keeri docs/shopmaple-catalogue-v2.md, `freeDelivery=1`). Synthetic values only.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/demo-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
const cart: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: true, mode: "preview" };
const finish = (id: string, title: string, extra: Partial<Variant> = {}): Variant =>
  ({ id, title, sku: id.toUpperCase(), pricePaise: 1_250_000, compareAtPaise: null, available: true, stockPolicy: "made_to_order", leadTimeDays: 28, slug: id, ...extra });
const chair = (variants: Variant[]): Product => ({
  id: "demo", handle: "demo-chair", title: "Demo Chair", description: "A demo chair.", category: "chairs", published: true, source: "keeri:maple",
  sourceUpdatedAt: "2026-11-13T00:00:00Z", images: ["https://store.maplefurnishers.com/media/keeri/chair.webp"], variants,
});
const mixed = chair([finish("grey", "Ash Grey", { freeDelivery: true }), finish("oak", "Natural Oak", { freeDelivery: false })]);

async function render(node: React.ReactNode, check: (doc: Document) => void | Promise<void>, path = "/products/demo-chair") {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(cart);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  window.history.replaceState(null, "", path);
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider>{node}</ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const page = (product: Product, variant: string, check: (doc: Document) => void) =>
  render(<ProductDetail product={product} initialVariant={variant} />, check, `/products/demo-chair?variant=${variant}`);
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const strip = (doc: Document) => [...doc.querySelectorAll("[data-assurances] li")].map(text);
const ticker = (doc: Document) => [...doc.querySelectorAll("[data-ticker] [data-ticker-item]")].slice(0, 4).map(text);
const promise = (doc: Document) => doc.querySelector("[data-promises] li");

test("a finish Keeri ticked free delivery says \"Free delivery\" in the buy box, the strip, the ticker and the promises", async () => {
  await page(mixed, "grey", (doc) => {
    const badge = doc.querySelector("[data-product-info] [data-free-delivery]");
    assert.equal(text(badge), "Free delivery");
    assert.equal(strip(doc)[0], "Free delivery");
    assert.equal(ticker(doc)[3], "Free delivery");
    assert.match(doc.querySelector("[data-ticker-copy]")!.textContent!, /Fully customisable\. Free delivery\.$/);
    assert.equal(text(promise(doc)!.querySelector("strong")), "Free delivery");
    // Checkout still asks the courier about the address, so the page names no pincode and no place.
    assert.equal(text(promise(doc)!.querySelector("span:not([aria-hidden])")), "Confirmed for your address at checkout.");
    assert.equal(text(doc.querySelector("[data-shipping-note]")), "Free delivery on this piece, confirmed for your address at checkout.");
    const shipping = [...doc.querySelectorAll("[data-faq-item]")].find((item) => text(item.querySelector("summary")) === "Is shipping included in the price?");
    assert.equal(text(shipping?.querySelector("[data-faq-answer]")), "Delivery is free on this piece. It is confirmed for your address at checkout.");
    assert.doesNotMatch(text(doc.querySelector("[data-product-page]"))!, /Shipping is charged separately|Delivery across India|free delivery (to|across|anywhere)|pincode/i);
  });
});

test("a finish that is not ticked keeps the store's delivery wording, on the same product", async () => {
  await page(mixed, "oak", (doc) => {
    assert.equal(doc.querySelector("[data-free-delivery]"), null);
    assert.equal(strip(doc)[0], "Delivery across India");
    assert.equal(ticker(doc)[3], "Delivery across India");
    assert.equal(text(promise(doc)!.querySelector("strong")), "Delivery across India");
    assert.equal(text(doc.querySelector("[data-shipping-note]")), "Shipping is charged separately and quoted before you confirm your order.");
    assert.match(text(doc.querySelector("[data-faq]"))!, /No\. Shipping is charged separately/);
    assert.doesNotMatch(text(doc.querySelector("[data-product-page]"))!, /free delivery/i);
  });
});

test("a ticked finish the shopper cannot buy promises nothing: checkout would never apply it", async () => {
  for (const blocked of [{ available: false }, { pricePaise: null }, { stockPolicy: "dropship" as const }]) {
    await page(chair([finish("grey", "Ash Grey", { freeDelivery: true, ...blocked })]), "grey", (doc) => {
      assert.equal(doc.querySelector("[data-free-delivery]"), null, JSON.stringify(blocked));
      assert.doesNotMatch(text(doc.querySelector("[data-product-page]"))!, /free delivery/i, JSON.stringify(blocked));
    });
  }
});

test("a product from before the tick, with no free-delivery field at all, reads as it always did", async () => {
  await page(chair([finish("grey", "Ash Grey")]), "grey", (doc) => {
    assert.equal(doc.querySelector("[data-free-delivery]"), null);
    assert.equal(strip(doc)[0], "Delivery across India");
  });
});

for (const [name, Card] of [["classic", ProductCard], ["product page", FigmaCard]] as const) {
  test(`the ${name} card says "Free delivery" only when the catalogue says the whole piece ships free`, async () => {
    // The API states it on the card (`freeDelivery: true`) when every finish a shopper can buy is ticked, and leaves it out otherwise.
    await render(<Card product={{ ...toProductCard(mixed), freeDelivery: true }} />, (doc) => {
      assert.equal(text(doc.querySelector("[data-product-card] [data-card-free-delivery]")), "Free delivery");
    });
    await render(<Card product={toProductCard(mixed)} />, (doc) => {
      assert.equal(doc.querySelector("[data-card-free-delivery]"), null, "one finish is charged delivery");
      assert.doesNotMatch(text(doc.querySelector("[data-product-card]"))!, /free delivery/i);
    });
  });
}
