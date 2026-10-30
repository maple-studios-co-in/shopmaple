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
  id: "chair", handle: "chair", title: "Aero Chair", description: "A chair", category: "chairs",
  images: ["https://example.com/blue.jpg", "https://example.com/red.jpg", "https://example.com/green.jpg"],
  published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "blue", title: "Blue", sku: "BLUE", pricePaise: 1000000, compareAtPaise: null, available: false, stockPolicy: "unverified" },
    { id: "red", title: "Red", sku: "RED", pricePaise: 1200000, compareAtPaise: null, available: false, stockPolicy: "unverified" },
  ],
};
async function mount(check: () => Promise<void>, images = product.images) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  try {
    await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}>
      <ProductDetail product={{ ...product, images }} presentation={{ variantImages: { blue: product.images[0]!, red: product.images[1]! }, reviewLabel: null }} />
    </AppRouterContext.Provider></ShopProvider>));
    await check();
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; }
}
function button(label: string) { return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
function selected() { return document.querySelector('[data-thumbnails] button[aria-pressed="true"]')?.getAttribute("aria-label"); }
async function key(target: Element, value: string) {
  const event = new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}
async function touch(target: Element, type: string, x: number, y: number, count = 1) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  const points = Array.from({ length: count }, (_, identifier) => ({ clientX: x, clientY: y, identifier }));
  Object.assign(event, { touches: type === "touchend" ? [] : points, changedTouches: points });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}
test("thumbnails, variant images and zoom retain their existing behavior", async () => {
  await mount(async () => {
    await act(async () => button("Show product image 3").click());
    assert.equal(selected(), "Show product image 3");
    await act(async () => button("Enlarge product image").click());
    assert.equal(document.querySelector("dialog")?.open, true);
    assert.equal(document.querySelector("[data-zoom] img")?.getAttribute("src"), "https://example.com/green.jpg");
    await act(async () => button("Close Aero Chair").click());
    await act(async () => document.querySelector<HTMLInputElement>('input[value="red"]')!.click());
    assert.equal(selected(), "Show product image 2");
    assert.equal(document.querySelector("[data-main-image] img")?.getAttribute("src"), "https://example.com/red.jpg");
  });
});
test("empty and broken image sources retain a readable fallback", async () => {
  await mount(async () => {
    assert.match(document.querySelector("[data-main-image]")!.textContent!, /Image unavailable/);
    assert.equal(document.querySelector('[aria-label="Enlarge product image"]'), null);
  }, []);
  await mount(async () => {
    await act(async () => document.querySelector("[data-main-image] img")!.dispatchEvent(new dom.window.Event("error")));
    assert.match(document.querySelector("[data-main-image]")!.textContent!, /Image unavailable/);
  });
});
test("focused gallery arrows wrap images while control buttons keep their keyboard behavior", async () => {
  await mount(async () => {
    const gallery = document.querySelector<HTMLElement>("[data-gallery]")!;
    gallery.focus();
    await key(gallery, "ArrowLeft");
    assert.equal(selected(), "Show product image 3");
    assert.equal(document.activeElement, gallery);
    await key(gallery, "ArrowRight");
    assert.equal(selected(), "Show product image 1");
    const controlEvent = await key(button("Next product image"), "ArrowRight");
    assert.equal(selected(), "Show product image 1");
    assert.equal(controlEvent.defaultPrevented, false);
  });
});
test("horizontal swipes change images without consuming vertical scrolling or control gestures", async () => {
  await mount(async () => {
    const stage = button("Enlarge product image");
    await touch(stage, "touchstart", 200, 100);
    const move = await touch(stage, "touchmove", 100, 105);
    await touch(stage, "touchend", 100, 105);
    assert.equal(selected(), "Show product image 2");
    assert.equal(move.defaultPrevented, false);
    await act(async () => { stage.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 1 })); });
    assert.equal(document.querySelector("dialog")?.open, false, "swiping must not open zoom");
    await touch(stage, "touchstart", 100, 100);
    await touch(stage, "touchmove", 105, 180);
    await touch(stage, "touchend", 220, 185);
    assert.equal(selected(), "Show product image 2", "vertical gesture stays scrolling even if it later turns");
    await touch(button("Next product image"), "touchstart", 200, 100);
    await touch(button("Next product image"), "touchend", 100, 100);
    assert.equal(selected(), "Show product image 2");
    await touch(stage, "touchstart", 100, 100);
    await touch(stage, "touchend", 200, 100);
    assert.equal(selected(), "Show product image 1");
    await touch(stage, "touchstart", 100, 100, 2);
    await touch(stage, "touchend", 200, 100, 2);
    assert.equal(selected(), "Show product image 1", "pinch gestures do not change the image");
  });
});
test("previous image stays visible until the chosen image loads, then yields to it", async () => {
  await mount(async () => {
    await act(async () => { document.querySelector("[data-main-image] img")!.dispatchEvent(new dom.window.Event("load")); });
    await act(async () => button("Next product image").click());
    const images = [...document.querySelectorAll<HTMLImageElement>("[data-main-image] img")];
    assert.equal(images.length, 2, "retain only the previous and requested full-size images");
    assert.equal(images[0]!.getAttribute("src"), "https://example.com/red.jpg");
    assert.equal(images[0]!.parentElement!.style.opacity, "0");
    assert.equal(images[1]!.getAttribute("src"), "https://example.com/blue.jpg");
    await act(async () => { images[0]!.dispatchEvent(new dom.window.Event("load")); });
    assert.equal(images[0]!.parentElement!.style.opacity, "1");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 220)));
    assert.equal(document.querySelectorAll("[data-main-image] img").length, 1);
  });
});
test("failed replacement images reveal the fallback rather than hiding it behind the previous photo", async () => {
  await mount(async () => {
    await act(async () => button("Next product image").click());
    await act(async () => { document.querySelector("[data-main-image] img")!.dispatchEvent(new dom.window.Event("error")); });
    const fallback = document.querySelector('[data-main-image] [role="img"]')!;
    assert.match(fallback.getAttribute("aria-label")!, /Aero Chair — view 2 — Image unavailable/);
    assert.equal((fallback.parentElement as HTMLElement).style.opacity, "1");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 220)));
    assert.equal(document.querySelectorAll("[data-main-image] img").length, 0);
  });
});
test("rapid selections keep the last loaded image while obsolete requests cannot become visible", async () => {
  await mount(async () => {
    await act(async () => button("Next product image").click());
    const obsolete = document.querySelector("[data-main-image] img")!;
    await act(async () => button("Next product image").click());
    await act(async () => { obsolete.dispatchEvent(new dom.window.Event("load")); });
    const images = [...document.querySelectorAll<HTMLImageElement>("[data-main-image] img")];
    assert.equal(images.length, 2);
    assert.equal(images[0]!.getAttribute("src"), "https://example.com/green.jpg");
    assert.equal(images[0]!.parentElement!.style.opacity, "0");
    assert.equal(images[1]!.getAttribute("src"), "https://example.com/blue.jpg");
  });
});

test("all photos in a large gallery remain selectable, zoomable and keyboard reachable", async () => {
  const images = Array.from({ length: 240 }, (_, i) => `https://example.com/gallery-${i}.jpg`);
  await mount(async () => {
    assert.equal(document.querySelectorAll("[data-thumbnails] button").length, 240);
    await act(async () => button("Show product image 240").click());
    assert.equal(selected(), "Show product image 240");
    assert.match(document.querySelector("[data-gallery-controls]")!.textContent!, /240 \/ 240/);
    assert.equal(document.querySelector("[data-main-image] img")?.getAttribute("src"), "https://example.com/gallery-239.jpg");
    await act(async () => button("Enlarge product image").click());
    assert.equal(document.querySelector("[data-zoom] img")?.getAttribute("src"), "https://example.com/gallery-239.jpg");
    await act(async () => button("Close Aero Chair").click());
    const gallery = document.querySelector<HTMLElement>("[data-gallery]")!;
    gallery.focus();
    await key(gallery, "ArrowRight");
    assert.equal(selected(), "Show product image 1");
    await key(gallery, "ArrowLeft");
    assert.equal(selected(), "Show product image 240");
    assert.ok(document.querySelectorAll("[data-main-image] img").length <= 2, "full-size stage stays bounded as galleries grow");
  }, images);
});
