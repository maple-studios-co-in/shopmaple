import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CategorySlideshow } from "../components/category-controls";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

async function withClient(small: boolean | null, element: React.ReactNode, run: (doc: Document, viewport: (small: boolean) => void) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const listeners = new Set<() => void>();
  const media = { matches: small ?? false, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  if (small !== null) dom.window.matchMedia = () => media as unknown as MediaQueryList;
  // JSDOM has no native dialog implementation; emulate only open/close events.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event("close")); };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(element));
    await run(document, (value) => {
      media.matches = value;
      listeners.forEach(fn => fn());
      if (small === null) {
        Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: value ? 390 : 1200 });
        dom.window.dispatchEvent(new dom.window.Event("resize"));
      }
    });
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}

test("manual room navigation announces room and position without moving keyboard focus", async () => {
  const slides = [
    { key: "living", desktop: "/living.png", mobile: "/living-small.png", alt: "Living room" },
    { key: "bed", desktop: "/bed.png", mobile: "/bed-small.png", alt: "Bedroom" },
    { key: "dining", desktop: "/dining.png", mobile: "/dining-small.png", alt: "Dining room" },
  ];
  await withClient(false, <CategorySlideshow slides={slides} />, async doc => {
    const status = doc.querySelector('[role="status"]');
    assert.ok(status, "manual slideshow changes need an accessible status");
    assert.equal(status.getAttribute("aria-live"), "polite");
    assert.equal(status.getAttribute("aria-atomic"), "true");
    assert.equal(status.textContent, "Living room — 1 / 3");
    for (const [name, expected] of [["Previous room", "Dining room — 3 / 3"], ["Next room", "Living room — 1 / 3"], ["Show Bedroom", "Bedroom — 2 / 3"]]) {
      const button = doc.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
      button.focus();
      await act(async () => button.click());
      assert.equal(status.textContent, expected);
      assert.equal(doc.activeElement, button);
    }
  });
});

test("homepage keeps one existing brand heading across default, reordered and disabled sections", async () => {
  const previous = globalThis.fetch;
  try {
    for (const arrangement of ["default", "reordered", "disabled"]) {
      const content = structuredClone(defaultStorefrontContent);
      if (arrangement === "reordered") content.homeSections.reverse();
      if (arrangement === "disabled") content.homeSections.forEach(section => { section.enabled = false; });
      globalThis.fetch = async input => String(input).endsWith("/api/content/storefront")
        ? Response.json({ version: 1, content }) : new Response(null, { status: 404 });
      const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
      const dom = new JSDOM(await new Response(stream).text());
      try {
        const headings = dom.window.document.querySelectorAll("h1");
        assert.equal(headings.length, 1, `${arrangement} homepage needs a primary heading`);
        assert.equal(headings[0]!.textContent, "Maple Furnishers");
        assert.equal(headings[0]!.className, "sr-only", "preserve the original visible design");
      } finally { dom.window.close(); }
    }
  } finally { globalThis.fetch = previous; }
});
