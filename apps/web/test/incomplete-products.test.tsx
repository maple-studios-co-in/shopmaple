import { toProductCard } from "../lib/product-card-model";
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product, Cart } from "@shopmaple/contracts";
import { ProductCard } from "../components/product-card";
import { ProductDetail } from "../components/product-detail";
import { CollectionListing } from "../components/collection-listing";
import { CartContents } from "../components/cart";
import { ShopProvider } from "../components/shop-provider";
import { collectionMembers, collectionQuery, filterCollection } from "../lib/collections";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3003" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const model: Product = { id: "model", handle: "new-model", title: "New Model", description: "", category: null, images: [], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] };
const unknown = { id: "option", title: "Natural", sku: null, pricePaise: null, compareAtPaise: 50000, available: true, stockPolicy: "stocked" as const };
const known = { ...unknown, id: "priced", title: "Oak", pricePaise: 25000, compareAtPaise: null };
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
async function mount(ui: React.ReactNode, check: () => void | Promise<void>, cart = empty) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(cart);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider>{ui}</ShopProvider></AppRouterContext.Provider>));
    await check();
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
test("model-only cards remain browsable with an honest price and image placeholder", async () => {
  await mount(<ProductCard product={toProductCard(model)} />, () => {
    assert.match(document.querySelector(".product-card-price")!.textContent!, /Price on request/);
    assert.ok(document.querySelector('[role="img"][aria-label*="Image unavailable"]'));
    assert.ok(document.querySelector('a[href="/products/new-model"]'));
    assert.equal(document.querySelector(".card-sale"), null);
  });
});
test("unknown option prices never become zero or a discount", async () => {
  await mount(<ProductCard product={toProductCard({ ...model, variants: [unknown] })} />, () => {
    assert.equal(document.querySelector(".product-card-price")!.textContent?.trim(), "Price on request");
    assert.equal(document.querySelector(".card-sale"), null);
  });
});
test("mixed known and unknown options show the known starting price and disclose other prices on request", async () => {
  await mount(<ProductCard product={toProductCard({ ...model, variants: [unknown, known] })} />, () => {
    assert.match(document.querySelector(".product-card-price")!.textContent!, /From Rs. 250.00/);
    assert.match(document.querySelector(".product-card")!.textContent!, /Other options on request/);
  });
});
test("a model-only detail page offers an enquiry without inventing a variant, SKU or category", async () => {
  await mount(<ProductDetail product={model} />, () => {
    assert.match(document.querySelector(".pdp-price-block")!.textContent!, /Price on request/);
    assert.ok(document.querySelector('.breadcrumb a[href="/collections/all"]'));
    assert.equal(document.querySelector('[aria-label="Enlarge product image"]'), null);
    const enquiry = document.querySelector<HTMLAnchorElement>(".pdp-purchase a")!;
    const params = new URL(enquiry.href).searchParams;
    assert.equal(params.get("product"), "New Model");
    assert.equal(params.has("variant"), false);
    assert.equal(params.has("sku"), false);
    assert.equal(document.querySelector(".pdp-purchase button"), null);
    assert.equal(document.querySelector('a[href*="shop.maplefurnishers.com/products/new-model"]'), null);
  });
});
test("selecting an unpriced option replaces cart purchase with enquiry without a fabricated SKU", async () => {
  await mount(<ProductDetail product={{ ...model, variants: [known, unknown] }} />, async () => {
    assert.equal(document.querySelector(".pdp-purchase button.button")?.textContent, "Add to cart");
    await act(async () => document.querySelector<HTMLInputElement>('input[value="option"]')!.click());
    assert.match(document.querySelector(".pdp-price-block")!.textContent!, /Price on request/);
    assert.equal(document.querySelector(".pdp-discount"), null);
    assert.equal(document.querySelector(".pdp-purchase button"), null);
    const params = new URL(document.querySelector<HTMLAnchorElement>(".pdp-purchase a")!.href).searchParams;
    assert.equal(params.get("variant"), "Natural");
    assert.equal(params.has("sku"), false);
  });
});
test("failed product images retain a neutral accessible fallback", async () => {
  await mount(<ProductCard product={toProductCard({ ...model, images: ["https://example.com/unavailable.jpg"], variants: [known] })} />, async () => {
    await act(async () => document.querySelector(".product-card-image img")!.dispatchEvent(new dom.window.Event("error")));
    assert.ok(document.querySelector('[role="img"][aria-label*="Image unavailable"]'));
    assert.equal(document.querySelector(".product-card-image img"), null);
  });
});
test("an unpriced saved cart uses unknown totals and an enquiry instead of checkout", async () => {
  const cart: Cart = { ...empty, itemCount: 1, subtotalPaise: null, items: [{ variantId: "option", handle: model.handle, title: model.title, variantTitle: "Natural", image: "", pricePaise: null, lineTotalPaise: null, quantity: 1, available: true, stockPolicy: "stocked" }] };
  await mount(<CartContents />, () => {
    assert.match(document.querySelector(".cart-summary strong")!.textContent!, /Price on request/);
    assert.equal(document.querySelector('a[href="/checkout"]'), null);
    assert.ok(document.querySelector('.cart-summary a[href="/pages/contact"]'));
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Increase quantity of New Model"]')!.disabled, true);
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Decrease quantity of New Model"]')!.disabled, true);
    assert.ok(document.querySelector('[role="img"][aria-label*="Image unavailable"]'));
  }, cart);
});
test("model-only listings remain in unfiltered and enquiry collections but not price-filtered results", () => {
  assert.deepEqual(filterCollection([model], collectionQuery({})), [model]);
  assert.deepEqual(filterCollection([model], collectionQuery({ availability: "out" })), [model]);
  assert.deepEqual(filterCollection([model], collectionQuery({ max: "300" })), []);
  assert.deepEqual(collectionMembers([model], "all"), [model]);
  assert.deepEqual(collectionMembers([model], "chairs"), []);
});
test("unknown prices sort last in either direction and cannot satisfy a price bound", () => {
  const request = { ...model, variants: [unknown] };
  const priced = { ...model, id: "priced", handle: "priced", variants: [known] };
  for (const sort of ["price-asc", "price-desc"]) assert.deepEqual(filterCollection([request, priced], collectionQuery({ sort })).map(p => p.id), ["priced", "model"]);
  assert.deepEqual(filterCollection([request], collectionQuery({ max: "300" })), []);
});

test("unknown prices do not advertise a zero-price collection maximum", async () => {
  await mount(<CollectionListing handle="all" title="All Furniture" query={collectionQuery({})} products={[toProductCard(model)]} total={1} collectionTotal={1} limit={24} inStock={0} outOfStock={1} highestPrice={null} />, () => {
    assert.match(document.querySelector(".collection-price-caption")!.textContent!, /Prices available on request/);
    assert.equal(document.querySelector<HTMLInputElement>('input[name="max"]')!.placeholder, "Any price");
    assert.match(document.querySelector(".collection-filter-form")!.textContent!, /Enquiry only/);
  });
});
test("new catalogue members use their known category without requiring dated preview membership", () => {
  const chair = { ...model, category: "chairs" as const };
  assert.deepEqual(collectionMembers([chair], "chairs"), [chair]);
});
test("an unverified stock policy never offers purchase even when a price and available flag are present", async () => {
  await mount(<ProductDetail product={{ ...model, variants: [{ ...known, stockPolicy: "unverified" }] }} />, () => {
    assert.equal(document.querySelector(".pdp-purchase button"), null);
    assert.ok(document.querySelector(".pdp-purchase a"));
  });
});

test("Shopify-origin details keep review and support navigation internal", async () => {
  await mount(
    <ProductDetail product={{ ...model, source: "shopify-preview" }} />,
    () => {
      assert.equal(
        Boolean(document.querySelector('a[href*="shop.maplefurnishers.com"]')),
        false,
      );
      assert.ok(
        document.querySelector('#product-reviews a[href^="/pages/contact"]'),
      );
    },
  );
});

test("chair results do not send shoppers back to the same page as a complete collection", async () => {
  await mount(<CollectionListing handle="chairs" title="Chairs" query={collectionQuery({})} products={[toProductCard(model)]} total={1} collectionTotal={1} limit={24} inStock={0} outOfStock={1} highestPrice={null} />, () => {
    const destinations = [...document.querySelectorAll<HTMLAnchorElement>('a')].map(a => a.getAttribute('href'));
    assert.ok(destinations.includes('/products/new-model'), 'The actual product remains discoverable');
    const discovery = [...document.querySelectorAll<HTMLAnchorElement>('.collection-preview-note a')].map(a => a.getAttribute('href'));
    assert.equal(discovery.filter(href => href === '/collections/chairs').length, 0, 'A discovery link must not loop back to these same results');
  });
});
