import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { isShopifyImage, shopifyLoader, shopifySized } from "../lib/image-loading";
import { ProductImage } from "../components/store/product-image";
import { ContentImage } from "../components/content-image";

// Photos lagged because the server's optimizer fetched multi-megabyte Shopify originals and encoded them on a cold
// cache. Shopify's photos now come resized from Shopify's own edge, fall back to the original once, and fade in.
const shopify = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/nola.webp?v=1788542868";

test("only Shopify's own file addresses go to Shopify's resizer, which keeps the version and sets the width", () => {
  assert.equal(isShopifyImage(shopify), true);
  assert.equal(isShopifyImage("https://shop.maplefurnishers.com/cdn/shop/files/a.jpg"), true);
  for (const other of ["https://store.maplefurnishers.com/media/keeri/a.webp", "/media/home/hero.webp", "https://cdn.shopify.com.evil.example/s/files/a.png", "http://cdn.shopify.com/s/files/a.png", null])
    assert.equal(isShopifyImage(other), false, String(other));
  assert.equal(shopifyLoader({ src: shopify, width: 640 }), shopify + "&width=640");
  assert.equal(shopifySized(shopify, 28), shopify + "&width=56", "twice a small slot");
  assert.equal(shopifySized(shopify, undefined), shopify + "&width=1920", "a filling image");
});

async function mount(node: React.ReactNode, check: (doc: Document) => void | Promise<void>) {
  const dom = new JSDOM("<div id='root' style='position:relative'></div>", { url: "http://localhost:3000/" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(node));
    await check(document);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
}

test("a Shopify photo asks Shopify for each width, tries the original once if that fails, then says it is unavailable", async () => {
  // The test image stand-in (support/next-image.tsx) shows the loader decision; the real resizing runs in the browser.
  await mount(<ProductImage src={shopify} alt="Nola" fill sizes="300px" />, async (doc) => {
    const image = () => doc.querySelector("img")!;
    assert.equal(image().getAttribute("data-loader"), "custom", "Shopify's resizer, not the server's optimizer");
    await act(async () => image().dispatchEvent(new window.Event("error")));
    assert.equal(image().getAttribute("src"), shopify, "the original, as stored");
    assert.equal(image().hasAttribute("data-unoptimized"), true);
    assert.equal(image().hasAttribute("data-loader"), false);
    assert.equal(doc.querySelector("[data-image-placeholder]"), null);
    await act(async () => image().dispatchEvent(new window.Event("error")));
    assert.equal(doc.querySelector("img"), null);
    assert.equal(doc.querySelector("[data-image-placeholder]")?.getAttribute("aria-label"), "Nola — Image unavailable");
  });
});

test("a filling photo fades in once it has loaded; a preloaded one paints at once", async () => {
  await mount(<ProductImage src={shopify} alt="Nola" fill sizes="300px" />, async (doc) => {
    const image = doc.querySelector("img")!;
    assert.match(image.className, /opacity-0/);
    await act(async () => image.dispatchEvent(new window.Event("load")));
    assert.doesNotMatch(doc.querySelector("img")!.className, /opacity-0/);
  });
  await mount(<ProductImage src={shopify} alt="Nola" fill preload sizes="300px" />, (doc) => {
    assert.doesNotMatch(doc.querySelector("img")!.className ?? "", /opacity-0/);
  });
});

test("content artwork keeps its exact URL and the optimizer, Shopify-hosted or not: only product photos are resized by Shopify", () => {
  for (const src of [shopify, "https://shop.maplefurnishers.com/cdn/shop/files/Custom_F.svg", "/media/home/hero.webp"]) {
    const html = renderToStaticMarkup(<ContentImage src={src} alt="Hero" width={640} height={400} />);
    assert.ok(html.includes(`src="${src.replaceAll("&", "&amp;")}"`), src);
    assert.doesNotMatch(html, /data-unoptimized|data-loader/, src);
  }
});
