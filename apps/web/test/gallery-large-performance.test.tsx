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

// JSDOM has no IntersectionObserver or scrollIntoView; the test drives both explicitly.
const observers: Observer[] = [];
class Observer {
  targets = new Set<Element>();
  constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) { observers.push(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  takeRecords() { return []; }
  notify(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0, time: 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
Object.assign(globalThis, { IntersectionObserver: Observer });
Object.assign(dom.window, { IntersectionObserver: Observer });
const scrolled: { element: Element; options: unknown }[] = [];
const pageScrolls: Element[] = [];
dom.window.Element.prototype.scrollTo = function (options?: unknown) { scrolled.push({ element: this, options }); };
dom.window.Element.prototype.scrollIntoView = function () { pageScrolls.push(this); };

const images = Array.from({ length: 60 }, (_, i) => `https://example.com/gallery-${i + 1}.jpg`);
const product: Product = {
  id: "imperio", handle: "imperio", title: "Imperio", description: "A chair", category: "chairs", images,
  published: true, source: "keeri:tenant", sourceUpdatedAt: "2026-10-27T00:00:00Z",
  variants: [{ id: "oak", title: "Light Oak", sku: "IMP-OAK", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" }],
};
async function mount(check: () => Promise<void>) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  observers.length = 0; scrolled.length = 0; pageScrolls.length = 0;
  try {
    await act(async () => root.render(<ShopProvider><AppRouterContext.Provider value={router}>
      <ProductDetail product={product} />
    </AppRouterContext.Provider></ShopProvider>));
    await check();
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; }
}
const thumbButtons = () => [...document.querySelectorAll<HTMLButtonElement>("[data-thumbnails] button")];
const thumbImages = () => document.querySelectorAll("[data-thumbnails] img").length;
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
async function key(target: Element, value: string) {
  await act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
}

test("a sixty-image strip only mounts thumbnail images near the viewport until they scroll into view", async () => {
  await mount(async () => {
    assert.equal(thumbButtons().length, 60, "every photo keeps its selectable control");
    assert.ok(thumbImages() <= 16, `expected at most 16 eager thumbnail images, found ${thumbImages()}`);
    assert.equal(thumbButtons()[59]!.querySelector("img"), null, "the last thumbnail waits until it is near the viewport");
    const strip = observers.find(observer => observer.targets.has(thumbButtons()[59]!));
    assert.ok(strip, "thumbnails are observed for intersection");
    await act(async () => strip!.notify(thumbButtons()[49]!, true));
    assert.ok(thumbButtons()[49]!.querySelector("img"), "an intersecting thumbnail renders its image");
    assert.equal(thumbButtons()[49]!.querySelector("img")!.getAttribute("src"), images[49]);
  });
});

test("arrow navigation keeps the selected thumbnail visible and rendered without scrolling the page", async () => {
  await mount(async () => {
    const strip = document.querySelector<HTMLElement>("[data-thumbnails]")!;
    assert.equal(scrolled.length, 0, "mounting never scrolls the strip");
    const gallery = document.querySelector<HTMLElement>("[data-gallery]")!;
    gallery.focus();
    await key(gallery, "ArrowLeft");
    const last = thumbButtons()[59]!;
    assert.equal(last.getAttribute("aria-pressed"), "true");
    assert.ok(last.querySelector("img"), "the selected thumbnail always renders its image");
    assert.equal(scrolled.length, 1, "the strip scrolls once per selection");
    assert.equal(scrolled[0]!.element, strip, "only the thumbnail strip scrolls");
    assert.equal((scrolled[0]!.options as ScrollToOptions).behavior, "auto", "the strip's own scroll-behavior decides smoothness so reduced motion is honoured");
    assert.equal(pageScrolls.length, 0, "the page is never scrolled on the user's behalf");
    await act(async () => button("Next product image").click());
    assert.equal(scrolled.length, 2, "wrapping back to the first photo scrolls the strip again");
  });
});

test("the photos next to the current one are preloaded once the current photo has settled", async () => {
  await mount(async () => {
    const preloads = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')].map(link => link.getAttribute("href"));
    await act(async () => { document.querySelector("[data-main-image] img")!.dispatchEvent(new dom.window.Event("load")); });
    assert.ok(preloads().includes(images[1]!), `next photo is preloaded, found ${preloads().join(", ")}`);
    assert.ok(preloads().includes(images[59]!), "previous photo (wrapping) is preloaded");
    assert.equal(preloads().length, 2, "only the two neighbours are preloaded");
    await act(async () => button("Next product image").click());
    await act(async () => { document.querySelector("[data-main-image] img")!.dispatchEvent(new dom.window.Event("load")); });
    assert.ok(preloads().includes(images[2]!), "moving forward preloads the following photo");
  });
});
