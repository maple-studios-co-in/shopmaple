import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The owner's fixes on the classic homepage (2026-11-01): the latest shop film plays on its own
// with no controls, Instagram points at @maplefurnishers, and Bestsellers scrolls without
// arrows or a "View all" link.
const film = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0";
const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.jpg", pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

async function renderHome() {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content: structuredClone(defaultStorefrontContent) });
    if (url.pathname.endsWith("/api/catalogue/cards")) return Response.json({ products: (url.searchParams.get("handles") ?? "").split(",").map(card), published: true });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}
const section = (doc: Document, key: string) => doc.querySelector(`[data-home-section="${key}"]`)!;

test("the hero plays the latest shop film on its own, looping, with no play or pause control", async () => {
  const hero = section(await renderHome(), "hero");
  const video = hero.querySelector("video")!;
  assert.equal(video.getAttribute("src"), film);
  for (const attribute of ["autoplay", "muted", "loop", "playsinline"]) assert.ok(video.hasAttribute(attribute), `${attribute} is set`);
  assert.equal([...hero.querySelectorAll("button")].filter((button) => /play|pause|video|motion/i.test(button.getAttribute("aria-label") ?? button.textContent ?? "")).length, 0, "no video controls");
});

test("the Instagram section links to @maplefurnishers", async () => {
  const doc = await renderHome();
  const link = section(doc, "instagram").querySelector<HTMLAnchorElement>('a[href^="https://www.instagram.com/"]:not([href*="/p/"]):not([href*="/reel/"])')!;
  assert.equal(link.getAttribute("href"), "https://www.instagram.com/maplefurnishers/");
  assert.match(link.textContent ?? "", /@maplefurnishers/);
  assert.ok(!doc.body.innerHTML.includes("the_maple_experience"), "the old account is gone from the homepage");
});

test("Bestsellers scrolls on its own scrollbar, without arrows or a View all link", async () => {
  const bestsellers = section(await renderHome(), "bestsellers");
  assert.equal(bestsellers.querySelectorAll('[data-product-card], .product-card, article').length > 0, true, "products are listed");
  assert.equal(bestsellers.querySelector('a[aria-label^="View all"]'), null);
  assert.equal(bestsellers.querySelectorAll('button[aria-label^="Previous"], button[aria-label^="Next"]').length, 0);
  assert.ok(bestsellers.querySelector("[data-scroll-rail]"), "the rail shows a scrollbar");
});
