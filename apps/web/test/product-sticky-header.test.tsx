import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { StoreChromeView } from "../components/admin/store-chrome";
import { ShopProvider } from "../components/shop-provider";
import { ProductDetail } from "../components/product-detail";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";

// "In product detail page make the header sticky" (owner, 10 Nov 2026): on a product page the store's header stays
// pinned to the top while the page scrolls, on a phone too, with its menu, search, account, wishlist and cart; the
// page's own sticky parts (the photos beside the buy box, the questions' heading) stop under it, not behind it.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const chrome = (path: string) => new JSDOM(renderToStaticMarkup(
  <ShopProvider><StoreChromeView path={path} siteChrome={defaultSiteChrome}><h1>Page</h1></StoreChromeView></ShopProvider>,
)).window.document;

test("a product page's header is marked to stay pinned; every other page's header scrolls away as before", () => {
  for (const path of ["/products/aero-dining-chair", "/products/nola"]) {
    const header = chrome(path).querySelector("header.site-header")!;
    assert.equal(header.hasAttribute("data-sticky"), true, path);
    assert.equal(header.hasAttribute("data-header"), false, `${path}: still the store's one-row header`);
    assert.ok(header.querySelector(".header-main > .maple-desktop-nav"), `${path}: with its menu`);
    // The account icon is a link to /account (owner's spec, 10 Nov 2026); the others open panels.
    assert.deepEqual([...header.querySelectorAll(".header-actions :is(button, a)")].map((control) => control.getAttribute("aria-label")),
      ["Search furniture", "Your account", "Saved furniture (0)", "Open cart (0 items)"], `${path}: and every shopping action`);
  }
  for (const path of ["/", "/collections/chairs", "/our-story", "/blogs/recent-stories", "/productsx", "/policies/privacy-policy"])
    assert.equal(chrome(path).querySelector("header.site-header")!.hasAttribute("data-sticky"), false, path);
  assert.equal(chrome("/blogs/recent-stories").querySelector("header.site-header")!.hasAttribute("data-header"), false, "the blog has the store's own header");
});

test("the pinned header sticks to the top above the page, lifts off it with a soft shadow once scrolled, and offsets anchors", () => {
  const css = source("../styles/product-parity.css");
  const rule = /\.site-header\[data-sticky\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /position: sticky;/);
  assert.match(rule, /top: 0;/);
  assert.match(css, /animation-timeline: scroll\(root\)/, "the shadow follows the scroll, with no script");
  assert.match(css, /@supports \(animation-timeline: scroll\(\)\)/, "and only where the browser can tie it to the scroll");
  // The header's height, for what sticks under it: the header's own heights until the page measures it.
  assert.match(css, /\.site-header\[data-sticky\] ~ main \{\s*--site-header-offset: 96px;/);
  assert.match(css, /@media \(max-width: 1099px\) \{\s*\.site-header\[data-sticky\] ~ main \{\s*--site-header-offset: 76px;/);
  assert.match(css, /@media \(max-width: 749px\) \{\s*\.site-header\[data-sticky\] ~ main \{\s*--site-header-offset: 68px;/);
  assert.match(css, /\[data-product-page\] \[id\] \{\s*scroll-margin-top: calc\(var\(--site-header-offset, 0px\) \+ 24px\);/, "a link to a part of the page lands under the header");
});

const dom = new JSDOM("<!doctype html><header class='site-header' data-sticky></header><main><div id='root'></div></main>", { url: "http://localhost:3000/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A dining chair.", category: "chairs", published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  images: ["https://example.com/aero-1.jpg", "https://example.com/aero-2.jpg"],
  sourceDetails: { details: "Details.", materials: "Frame: Oak", dimensions: "Width: 56 cm", careInstructions: "Dust weekly.", warranty: null },
  variants: [{ id: "atlantic", title: "Deep Atlantic", sku: "A", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }],
};

test("the product page measures the pinned header, and its photos and questions' heading stop just under it", async () => {
  const header = document.querySelector<HTMLElement>(".site-header")!;
  let height = 96;
  header.getBoundingClientRect = () => ({ height, width: 1280, top: 0, left: 0, right: 1280, bottom: height, x: 0, y: 0, toJSON() {} });
  const observers: (() => void)[] = [];
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(private callback: () => void) { observers.push(() => this.callback()); } observe() {} unobserve() {} disconnect() {} } as never;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={product} /></ShopProvider></AppRouterContext.Provider>));
    const page = document.querySelector<HTMLElement>("[data-product-page]")!;
    assert.equal(page.style.getPropertyValue("--site-header-offset"), "96px", "the header's height, measured");
    height = 76;
    await act(async () => observers.forEach((notify) => notify()));
    assert.equal(page.style.getPropertyValue("--site-header-offset"), "76px", "and measured again when it changes");
    const column = document.querySelector("[data-gallery]")!.parentElement!;
    assert.match(column.className, /lg:sticky/);
    assert.match(column.className, /lg:top-\[calc\(var\(--site-header-offset,0px\)\+24px\)\]/, "the photos stop 24px under the header");
    assert.match(document.querySelector("[data-main-image]")!.className, /lg:max-h-\[calc\(100svh-48px-var\(--gallery-below,0px\)-var\(--site-header-offset,0px\)\)\]/, "and still fit the window under it");
    const heading = document.querySelector("[data-faq-heading]")!;
    assert.match(heading.className, /lg:top-\[calc\(var\(--site-header-offset,0px\)\+32px\)\]/, "the questions' heading too");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    globalThis.ResizeObserver = previousObserver;
  }
});
