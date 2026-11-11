import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The owner's fixes on the classic homepage (2026-11-01): the hero has no play or pause control, Instagram points at
// @maplefurnishers, and Bestsellers scrolls without arrows. The shop film itself was on Shopify and left the store
// (11 Nov 2026); a staff film slide's autoplay is covered in hero-video-motion.test.tsx.
const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: `https://store.maplefurnishers.com/media/keeri/${handle}.webp`, pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

async function renderHome() {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content: structuredClone(defaultStorefrontContent) });
    if (url.pathname.endsWith("/api/catalogue/cards")) return Response.json({ products: (url.searchParams.get("handles") ?? "").split(",").map(card), published: true });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
    // The product rails stream in after the rest of the page (9 Nov 2026); read the finished page in one piece, as a crawler gets it.
    await stream.allReady;
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}
const section = (doc: Document, key: string) => doc.querySelector(`[data-home-section="${key}"]`)!;

test("the default hero shows stills, with no film and no play or pause control", async () => {
  const hero = section(await renderHome(), "hero");
  assert.equal(hero.querySelector("video"), null);
  assert.equal(hero.querySelectorAll("[data-hero-slide] img").length, 4);
  assert.equal([...hero.querySelectorAll("button")].filter((button) => /play|pause|video|motion/i.test(button.getAttribute("aria-label") ?? button.textContent ?? "")).length, 0, "no video controls");
});

test("the Instagram section no longer shows the old account anywhere on the homepage (the frame has no handle under the heading)", async () => {
  const doc = await renderHome();
  assert.ok(!doc.body.innerHTML.includes("the_maple_experience"), "the old account is gone from the homepage");
  assert.equal(section(doc, "instagram").querySelector('a[href="https://www.instagram.com/maplefurnishers/"]'), null);
});

test("Bestsellers scrolls and drags without arrows or a drawn scrollbar, with the frame's View all bestsellers button", async () => {
  const bestsellers = section(await renderHome(), "bestsellers");
  assert.equal(bestsellers.querySelectorAll('[data-product-card], .product-card, article').length > 0, true, "products are listed");
  assert.equal(bestsellers.querySelectorAll('button[aria-label^="Previous"], button[aria-label^="Next"]').length, 0);
  assert.equal(bestsellers.querySelector(".home-scroll-track"), null);
  assert.ok(bestsellers.querySelector("[data-scroll-rail]"));
  assert.ok(bestsellers.querySelector('a[aria-label^="View all"]'));
});
