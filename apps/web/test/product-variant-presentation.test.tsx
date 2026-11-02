import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A dining chair", category: "chairs",
  images: ["https://example.com/blue.webp", "https://example.com/side.webp"],
  published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "catalogue-nordic", title: "Nordic Ivory", sku: "AERO-NI", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" },
    { id: "catalogue-taupe", title: "Desert Taupe", sku: "AERO-DT", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" },
    { id: "catalogue-slate", title: "Slate Modern", sku: "AERO-SM", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" },
    { id: "preview-atlantic", title: "Deep Atlantic", sku: "AERO-DA-01", pricePaise: 2360000, compareAtPaise: null, available: false, stockPolicy: "unverified" },
    { id: "preview-taupe", title: "Desert Taupe", sku: "AERO-DT-02", pricePaise: 2360000, compareAtPaise: null, available: false, stockPolicy: "unverified" },
    { id: "preview-slate", title: "Slate Modern", sku: "AERO-SM-03", pricePaise: 2360000, compareAtPaise: null, available: false, stockPolicy: "unverified" },
  ],
};
const mapped = { "preview-atlantic": product.images[0]! };
async function mount(check: (requests: string[], replacements: string[]) => Promise<void>, options: {
  initialVariant?: string; images?: Record<string, string>; value?: Product;
} = {}) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch, requests: string[] = [], replacements: string[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    return Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  };
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace(href: string) { replacements.push(href); }, prefetch() {} };
  try {
    await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}>
      <ProductDetail product={options.value ?? product} initialVariant={options.initialVariant}
        presentation={{ variantImages: options.images ?? mapped, reviewLabel: null }} />
    </AppRouterContext.Provider></ShopProvider>));
    await check(requests, replacements);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; }
}
const selected = () => document.querySelector<HTMLInputElement>('input[name="variant"]:checked')?.value;
const tile = (id: string) => document.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.closest("label")!;
const notice = () => [...document.querySelectorAll('[role="status"]')].find(element => element.textContent === "Photo for this option unavailable");
test("explicit unpriced option remains selected and keeps its enquiry identity", async () => {
  await mount(async () => {
    assert.equal(selected(), "catalogue-nordic");
    assert.equal(document.querySelector("[data-price-block] strong")?.textContent, "Price on request");
    const link = document.querySelector<HTMLAnchorElement>("[data-purchase] a")!;
    assert.equal(new URL(link.href).searchParams.get("variant"), "Nordic Ivory");
    assert.equal(new URL(link.href).searchParams.get("sku"), "AERO-NI");
  }, { initialVariant: "catalogue-nordic" });
});
test("default chooses the mapped priced Deep Atlantic option for cart selection", async () => {
  await mount(async requests => {
    assert.equal(selected(), "preview-atlantic");
    assert.match(document.querySelector("[data-price-block] strong")!.textContent!, /23,600/);
    assert.equal(document.querySelectorAll('input[name="variant"]').length, 6);
    assert.ok([...document.querySelectorAll("[data-purchase] button")].some(e => e.textContent === "Add to cart"));
    assert.deepEqual(requests, ["GET /api/cart"]);
  });
});
test("invalid query and invalid image mapping fall back to a known priced option", async () => {
  await mount(async () => {
    assert.equal(selected(), "preview-atlantic");
    assert.ok(notice());
    assert.equal(tile("catalogue-nordic").querySelector("img"), null);
  }, { initialVariant: "unknown", images: { "catalogue-nordic": "https://example.com/not-in-gallery.webp" } });
});
test("validated imagery takes priority over an earlier priced option", async () => {
  await mount(async () => { assert.equal(selected(), "preview-atlantic"); },
    { value: { ...product, variants: product.variants.map(v => v.id === "catalogue-nordic" ? { ...v, pricePaise: 1000000 } : v) } });
});
test("selecting an unmapped option keeps the product gallery and discloses the missing photo", async () => {
  await mount(async (_requests, replacements) => {
    await act(async () => tile("preview-atlantic").querySelector("input")!.click());
    assert.equal(notice(), undefined);
    await act(async () => tile("catalogue-nordic").querySelector("input")!.click());
    assert.ok(notice());
    assert.equal(document.querySelector("[data-main-image] img")?.getAttribute("src"), "https://example.com/blue.webp");
    assert.ok(tile("catalogue-nordic").querySelector("[data-variant-placeholder]"), "The option's circle stays empty rather than borrowing another photo");
    assert.equal(tile("catalogue-nordic").querySelector("img"), null);
    assert.equal(new URL(window.location.href).searchParams.get("variant"), "catalogue-nordic");
    assert.deepEqual(replacements, [], "variant URL changes do not request a new server route");
    assert.equal(document.querySelector("[data-price-block] strong")?.textContent, "Price on request");
    await act(async () => tile("preview-atlantic").querySelector("input")!.click());
    assert.equal(notice(), undefined);
  });
});
test("repeated option titles stay separate options with no item code written, and each carries its own code into enquiries", async () => {
  await mount(async () => {
    for (const [id, code] of [["catalogue-taupe", "AERO-DT"], ["preview-taupe", "AERO-DT-02"], ["catalogue-slate", "AERO-SM"], ["preview-slate", "AERO-SM-03"]]) {
      assert.equal(tile(id!).querySelector("[data-variant-code]"), null);
      await act(async () => tile(id!).querySelector("input")!.click());
      assert.equal(selected(), id);
      assert.equal(tile(id!).getAttribute("data-selected"), "true");
      assert.equal(new URL(document.querySelector<HTMLAnchorElement>("a[data-ask]")!.href, "http://localhost").searchParams.get("sku"), code);
    }
    assert.doesNotMatch(document.querySelector("[data-product-info]")!.textContent!, /Item code|AERO-|catalogue-taupe|preview-taupe|shopify-preview/);
  });
});
test("all six options stay selectable while only priced options offer cart selection", async () => {
  await mount(async requests => {
    for (const v of product.variants) {
      await act(async () => tile(v.id).querySelector("input")!.click());
      assert.equal(selected(), v.id);
      if (v.pricePaise === null) {
        assert.equal(document.querySelector("[data-purchase] button"), null);
        const link = document.querySelector<HTMLAnchorElement>("[data-purchase] a")!;
        assert.equal(new URL(link.href).searchParams.get("sku"), v.sku);
        assert.equal(document.querySelector("[data-price-block] strong")?.textContent, "Price on request");
      } else {
        assert.ok([...document.querySelectorAll("[data-purchase] button")].some(e => e.textContent === "Add to cart"));
      }
    }
    assert.deepEqual(requests, ["GET /api/cart"]);
  });
});
test("legacy explicit preview query stays authoritative over presentation default", async () => {
  await mount(async () => { assert.equal(selected(), "preview-taupe"); }, { initialVariant: "taupe" });
});

test("an exact explicit option wins over an earlier legacy query alias", async () => {
  await mount(async () => { assert.equal(selected(), "atlantic"); }, {
    initialVariant: "atlantic",
    value: { ...product, variants: [...product.variants, { ...product.variants[0]!, id: "atlantic" }] },
  });
});

test("a single option without any product photos retains the unavailable notice", async () => {
  await mount(async () => {
    assert.ok(notice());
    assert.equal(document.querySelector('[data-main-image] [role="img"]')?.getAttribute("aria-label"),
      "Aero Dining Chair — Image unavailable");
    assert.equal(document.querySelector('[aria-label="Enlarge product image"]'), null);
  }, { value: { ...product, variants: [product.variants[0]!], images: [] }, images: {} });
});

test("a single option keeps a readable gallery fallback when its product photo fails", async () => {
  await mount(async () => {
    await act(async () => {
      document.querySelector("[data-main-image] img")!.dispatchEvent(new dom.window.Event("error"));
    });
    assert.equal(document.querySelector('[data-main-image] [role="img"]')?.getAttribute("aria-label"),
      "Aero Dining Chair — view 1 — Image unavailable");
    assert.equal(document.querySelector("[data-main-image] img"), null);
  }, { value: { ...product, variants: [product.variants[0]!], images: ["https://example.com/broken.webp"] }, images: {} });
});

test("a single option uses its product gallery without a misleading missing-option-photo notice", async () => {
  await mount(async () => {
    assert.equal(document.querySelector("[data-main-image] img")?.getAttribute("src"), "https://example.com/blue.webp");
    assert.equal(document.querySelector('input[name="variant"]'), null);
    assert.equal(Boolean(notice()), false, "a product photo does not need a separate option mapping when there is only one option");
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Show product image 2"]')!.click());
    assert.equal(document.querySelector('[data-thumbnails] button[aria-pressed="true"]')?.getAttribute("aria-label"),
      "Show product image 2");
    assert.equal(notice(), undefined);
  }, { value: { ...product, variants: [product.variants[0]!] }, images: {} });
});
