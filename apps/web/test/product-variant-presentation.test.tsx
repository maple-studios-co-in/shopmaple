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
    assert.equal(document.querySelector(".pdp-price-block strong")?.textContent, "Price on request");
    const link = document.querySelector<HTMLAnchorElement>(".pdp-purchase a")!;
    assert.equal(new URL(link.href).searchParams.get("variant"), "Nordic Ivory");
    assert.equal(new URL(link.href).searchParams.get("sku"), "AERO-NI");
  }, { initialVariant: "catalogue-nordic" });
});
test("default chooses the mapped Deep Atlantic option without enabling ordering", async () => {
  await mount(async requests => {
    assert.equal(selected(), "preview-atlantic");
    assert.match(document.querySelector(".pdp-price-block strong")!.textContent!, /23,600/);
    assert.equal(document.querySelectorAll('input[name="variant"]').length, 6);
    assert.equal(document.querySelector(".pdp-purchase button"), null);
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
    assert.equal(document.querySelector(".product-main-image img")?.getAttribute("src"), "https://example.com/blue.webp");
    assert.match(tile("catalogue-nordic").textContent!, /Photo unavailable/);
    assert.equal(tile("catalogue-nordic").querySelector("img"), null);
    assert.equal(new URL(window.location.href).searchParams.get("variant"), "catalogue-nordic");
    assert.deepEqual(replacements, [], "variant URL changes do not request a new server route");
    assert.equal(document.querySelector(".pdp-price-block strong")?.textContent, "Price on request");
    await act(async () => tile("preview-atlantic").querySelector("input")!.click());
    assert.equal(notice(), undefined);
  });
});
test("repeated option titles are distinguished by differing public item codes", async () => {
  await mount(async () => {
    for (const [id, code] of [["catalogue-taupe", "AERO-DT"], ["preview-taupe", "AERO-DT-02"], ["catalogue-slate", "AERO-SM"], ["preview-slate", "AERO-SM-03"]]) {
      assert.equal(tile(id!).querySelector(".pdp-variant-code")?.textContent, `Item code: ${code}`);
    }
    assert.doesNotMatch(document.querySelector(".pdp-info")!.textContent!, /catalogue-taupe|preview-taupe|shopify-preview/);
  });
});
test("all six options stay selectable for enquiry and never send cart mutations", async () => {
  await mount(async requests => {
    for (const v of product.variants) {
      await act(async () => tile(v.id).querySelector("input")!.click());
      assert.equal(selected(), v.id);
      assert.equal(document.querySelector(".pdp-purchase button"), null);
      const link = document.querySelector<HTMLAnchorElement>(".pdp-purchase a")!;
      assert.equal(new URL(link.href).searchParams.get("sku"), v.sku);
      if (v.pricePaise === null) assert.equal(document.querySelector(".pdp-price-block strong")?.textContent, "Price on request");
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
