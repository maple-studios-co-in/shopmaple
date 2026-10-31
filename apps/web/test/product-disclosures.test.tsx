import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product, ProductRichText } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const product: Product = {
  id: "source-chair", handle: "source-chair", title: "Source Chair", description: "Standard description must not replace captured Details.",
  category: "chairs", images: [], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [{ id: "chair-option", title: "Natural", sku: "CHAIR-NAT", pricePaise: 2360000, compareAtPaise: null, available: false, stockPolicy: "unverified" }],
};
const text = (value: string): ProductRichText => ({ type: "root", children: [{ type: "paragraph", children: [{ type: "text", value }] }] });
const captured = (details: ProductRichText | null, materialsCare: ProductRichText | null = null, shippingReturns: ProductRichText | null = null): Product => ({
  ...product, pdpContent: { source: "shopify-metafields", sourceProductId: "gid://shopify/Product/123", capturedAt: "2026-10-26T00:00:00Z", details, materialsCare, shippingReturns },
});
async function mount(value: Product, check: () => void) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  try {
    await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}><ProductDetail product={value} /></AppRouterContext.Provider></ShopProvider>));
    check();
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; }
}
function disclosure(label: string) {
  const element = [...document.querySelectorAll("[data-accordions] details")].find(item => item.querySelector("summary")?.textContent === label);
  assert.ok(element, `Disclosure ${label} is available`);
  return element;
}

test("products without captured disclosures retain description, care and delivery enquiry fallback", async () => {
  for (const value of [product, { ...product, source: "keeri", pdpContent: null }]) {
    await mount(value, () => {
      assert.equal(disclosure("Details").querySelector("p")?.textContent, "Standard description must not replace captured Details.");
      assert.match(disclosure("Materials + Care").textContent!, /Contact our team for the materials and care guidance/);
      assert.equal(disclosure("Materials + Care").querySelector("a")?.textContent, "Request care guidance");
      assert.match(disclosure("Shipping + Returns").textContent!, /Confirm delivery serviceability/);
      assert.equal(disclosure("Shipping + Returns").querySelector("a")?.textContent, "Ask about delivery");
    });
  }
});

test("captured source disclosures replace generic copy without changing purchase or specification behavior", async () => {
  await mount(captured(text("Source Details for this chair."), text("Oak frame. Wipe with a dry cloth."), text("Source delivery and returns terms.")), () => {
    assert.equal(disclosure("Details").querySelector("p")?.textContent, "Source Details for this chair.");
    assert.equal(disclosure("Materials + Care").querySelector("p")?.textContent, "Oak frame. Wipe with a dry cloth.");
    assert.equal(disclosure("Shipping + Returns").querySelector("p")?.textContent, "Source delivery and returns terms.");
    assert.equal(disclosure("Materials + Care").querySelector("a"), null);
    assert.equal(disclosure("Shipping + Returns").querySelector("a"), null);
    assert.equal(document.querySelector("h1")?.textContent, "Source Chair");
    assert.match(document.querySelector("[data-price-block] strong")!.textContent!, /23,600/);
    assert.equal(document.querySelector("[data-purchase] button[data-primary]")?.textContent, "Add to cart");
    assert.match(document.querySelector("[data-disclosure]")!.textContent!, /Delivery and payment options will be confirmed before ordering/);
    assert.match(disclosure("Dimensions & specifications").textContent!, /SKU: CHAIR-NAT/);
  });
});

test("captured empty disclosure bodies stay empty and never invent fallback copy", async () => {
  for (const empty of [null, { type: "root", children: [] } as ProductRichText]) {
    await mount(captured(empty, empty, empty), () => {
      for (const label of ["Details", "Materials + Care", "Shipping + Returns"]) {
        assert.equal(disclosure(label).textContent, label);
        assert.equal(disclosure(label).querySelector("p, a"), null);
      }
    });
  }
});

test("source paragraphs, emphasis, newlines, headings and ordered and unordered lists render semantically", async () => {
  await mount(captured({ type: "root", children: [
    { type: "heading", level: 3, children: [{ type: "text", value: "Crafted for comfort" }] },
    { type: "paragraph", children: [{ type: "text", value: "Solid oak", bold: true }, { type: "text", value: " and " }, { type: "text", value: "woven fabric", italic: true }] },
    { type: "paragraph", children: [{ type: "text", value: "First line\nSecond line", bold: true, italic: true }] },
    { type: "list", listType: "unordered", children: [{ type: "list-item", children: [{ type: "text", value: "Soft seat" }] }] },
    { type: "list", listType: "ordered", children: [{ type: "list-item", children: [{ type: "text", value: "Wipe gently" }] }] },
  ] }), () => {
    const details = disclosure("Details");
    assert.equal(details.querySelector("h3")?.textContent, "Crafted for comfort");
    assert.deepEqual([...details.querySelectorAll("p")].map(p => p.textContent), ["Solid oak and woven fabric", "First line\nSecond line"]);
    assert.equal(details.querySelector("p strong")?.textContent, "Solid oak");
    assert.equal(details.querySelector("p em")?.textContent, "woven fabric");
    assert.ok(details.querySelector("strong em, em strong"));
    assert.equal(details.querySelector("ul > li")?.textContent, "Soft seat");
    assert.equal(details.querySelector("ol > li")?.textContent, "Wipe gently");
  });
});

test("approved links keep source text and owned Shopify links navigate locally", async () => {
  await mount(captured({ type: "root", children: [{ type: "paragraph", children: [
    { type: "link", url: "https://shop.maplefurnishers.com/pages/contact?product=chair#delivery", children: [{ type: "text", value: "Delivery help" }] },
    { type: "link", url: "/pages/care", title: null, target: null, children: [{ type: "text", value: "Care" }] },
    { type: "link", url: "https://example.com/care", target: "_blank", title: "Care guide", children: [{ type: "text", value: "External guide" }] },
    { type: "link", url: "mailto:care@example.com", children: [{ type: "text", value: "Email care" }] },
  ] }] }), () => {
    const links = [...disclosure("Details").querySelectorAll("a")];
    assert.deepEqual(links.map(a => a.getAttribute("href")), ["/pages/contact?product=chair#delivery", "/pages/care", "https://example.com/care", "mailto:care@example.com"]);
    assert.deepEqual(links.map(a => a.textContent), ["Delivery help", "Care", "External guide", "Email care"]);
    assert.equal(links[2]?.target, "_blank");
    assert.match(links[2]?.rel ?? "", /noopener/);
    assert.equal(links[2]?.title, "Care guide");
  });
});

test("malicious source text stays literal and unsafe link destinations are inert", async () => {
  const unsafe = ["javascript:alert(1)", "data:text/html,bad", "//evil.example/path", "/\\evil.example/path", "https://example.com/\npath", "https://user:password@example.com/path"];
  await mount(captured({ type: "root", children: [{ type: "paragraph", children: [
    { type: "text", value: '<img src=x onerror="alert(1)"><script>alert(1)</script>' },
    ...unsafe.map((url, i) => ({ type: "link" as const, url, children: [{ type: "text" as const, value: `Unsafe ${i}` }] })),
  ] }] }), () => {
    const details = disclosure("Details");
    assert.match(details.textContent!, /<img src=x onerror="alert\(1\)"><script>alert\(1\)<\/script>/);
    assert.equal(details.querySelector("img, script, iframe"), null);
    assert.equal(details.querySelector("a"), null);
    for (let i = 0; i < unsafe.length; i++) assert.ok(details.textContent!.includes(`Unsafe ${i}`));
  });
});

test('Keeri product details show source materials, dimensions, care and warranty as escaped text', async()=>{
 await mount({...product,source:'keeri:maple',sourceDetails:{details:'Handcrafted <script>chair</script>',materials:'Oak and linen',dimensions:'80 x 60 cm',careInstructions:'Dry cloth',warranty:'One year'}},()=>{
  assert.match(disclosure('Details').textContent!,/Handcrafted <script>chair<\/script>/);
  assert.equal(disclosure('Details').querySelector('script'),null);
  assert.match(disclosure('Materials + Care').textContent!,/Oak and linen/);
  assert.match(disclosure('Materials + Care').textContent!,/Dry cloth/);
  assert.match(disclosure('Dimensions & specifications').textContent!,/80 x 60 cm/);
  assert.match(document.querySelector('[data-accordions]')!.textContent!,/One year/);
 });
});

test('missing Shopify fields use real Keeri details without replacing populated Shopify copy',async()=>{
 await mount({...captured(null,text('Original Shopify care')),sourceDetails:{details:'Keeri construction details',materials:'Keeri oak',dimensions:null,careInstructions:null,warranty:null}},()=>{
  assert.match(disclosure('Details').textContent!,/Keeri construction details/);
  assert.match(disclosure('Materials + Care').textContent!,/Original Shopify care/);
  assert.doesNotMatch(disclosure('Materials + Care').textContent!,/Keeri oak/);
 });
});
