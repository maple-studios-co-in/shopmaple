import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Follow-up to the owner's review of the live page against the "Maple / Impact Layout" frame (Figma 1049:27656):
// the hero bento, the announcement strip, the Maple Difference row, round category photos, the
// statement band and the offer tiles. Copy still comes from the admin's content document.
const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.jpg", pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

async function renderHome(edit?: (content: typeof defaultStorefrontContent) => void) {
  const content = structuredClone(defaultStorefrontContent);
  edit?.(content);
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content });
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
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

import { existsSync, statSync } from "node:fs";
const local = (path: string) => new URL(`../public${path}`, import.meta.url);
const shownSrc = (img: Element) => decodeURIComponent(new URL(img.getAttribute("src")!, "http://x").searchParams.get("url") ?? img.getAttribute("src")!);

test("the heading ornament is the frame's flower between two lines", async () => {
  const ornament = section(await renderHome(), "categories").querySelector("[data-heading-ornament]")!;
  assert.ok(ornament.querySelector("svg[data-ornament-flower]"), "an eight-petal flower, drawn as SVG");
  assert.equal(ornament.querySelectorAll("[data-ornament-line]").length, 2);
});

test("category photos are the frame's, filling the circle, served from this repo", async () => {
  const tiles = [...section(await renderHome(), "categories").querySelectorAll("[data-category-tile]")];
  assert.deepEqual(tiles.map((tile) => shownSrc(tile.querySelector("img")!)), ["sofas", "dining-chair", "center-tables", "accent-chair", "beds", "dinings"].map((key) => `/media/home/category-${key}.webp`));
  for (const tile of tiles) { const file = local(shownSrc(tile.querySelector("img")!)); assert.ok(existsSync(file) && statSync(file).size > 5000); }
});

test("the statement band reads as the frame: 'crafted' in script, from the admin's line", async () => {
  const band = section(await renderHome(), "ticker").querySelector("[data-statement-band]")!;
  assert.equal(text(band), "Elegance isn’t found. At Maple, it is crafted.");
  assert.equal(text(band.querySelector("[data-statement-accent]")), "crafted");
});

test("offer cards carry the frame's artwork edge to edge, with no second arrow on top of the artwork's own", async () => {
  const tiles = [...section(await renderHome(), "offers").querySelectorAll("[data-offer-tile]")];
  assert.deepEqual(tiles.map((tile) => shownSrc(tile.querySelector("img")!)), ["clearance-sale", "minimum-30", "best-buy-50k", "furniture-25k"].map((key) => `/media/home/offer-${key}.webp`));
  assert.equal(tiles.filter((tile) => tile.querySelector("[data-offer-arrow]")).length, 0);
});

test("Our Social Proof has no Instagram icon or handle under its heading", async () => {
  const social = section(await renderHome(), "instagram");
  assert.equal(text(social.querySelector("h2")), "Our Social Proof");
  assert.equal(social.querySelector('h2 ~ a[href="https://www.instagram.com/maplefurnishers/"]'), null);
  assert.ok(!/@maplefurnishers/.test(social.textContent!), "no handle text");
});

test("Bestsellers has neither arrows nor a scrollbar, and the frame's View all bestsellers button", async () => {
  const bestsellers = section(await renderHome(), "bestsellers");
  const viewAll = bestsellers.querySelector<HTMLAnchorElement>("[data-rail-viewall]")!;
  assert.equal(viewAll.getAttribute("href"), "/collections/all");
  assert.equal(text(viewAll), "View all bestsellers →");
  assert.equal(bestsellers.querySelectorAll('button[aria-label^="Previous"], button[aria-label^="Next"]').length, 0);
  assert.equal(bestsellers.querySelector(".home-scroll-track"), null, "no drawn scrollbar");
  assert.ok(bestsellers.querySelector("[data-scroll-rail]"), "the row still scrolls and drags");
});

test("the announcement default is the frame's Always Together strip with its own photo", async () => {
  const strip = section(await renderHome(), "announcement").querySelector('[data-campaign-layout="strip"]')!;
  assert.equal(text(strip.querySelector("h2")), "Always Together");
  assert.equal(text(strip.querySelector(".campaign-supporting")), "For every laugh, fight, and memory.");
  assert.match(text(strip.querySelector("a")), /^Celebrate Together/);
  assert.equal(shownSrc(strip.querySelector('[data-artwork="desktop"] img')!), "/media/home/strip-always-together.webp");
});

test("Nimbus shows the frame's clean cloud photo with the collection name set as live text", async () => {
  const nimbus = section(await renderHome(), "nimbus");
  const base = nimbus.querySelector("[data-nimbus-slide]")!;
  assert.equal(text(base.querySelector("[data-nimbus-title]")), "Nimbus");
  assert.equal(text(base.querySelector("[data-nimbus-lead]")), "Soft presence. Strong craftsmanship.");
  assert.equal(shownSrc(base.querySelector("picture img")!), "/media/home/nimbus-clouds.webp");
  assert.ok(existsSync(local("/media/home/nimbus-clouds.webp")));
});

test("Nimbus with the staff's own artwork keeps the word in the artwork, with no live word on top", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HomeNimbus } = await import("../components/home-nimbus");
  const media = [{ key: "home-nimbus" as const, image: "https://shop.maplefurnishers.com/cdn/shop/files/custom-nimbus.webp", alt: "Staff artwork" }];
  const doc = new JSDOM(renderToStaticMarkup(<HomeNimbus media={media} />)).window.document;
  assert.equal(doc.querySelector("[data-nimbus-title]"), null);
  assert.match(doc.querySelector("picture img")!.getAttribute("src")!, /custom-nimbus\.webp/);
});

test("the hero ships with four slides, as the frame has four dots: the shop film, then three Maple room photos", async () => {
  const hero = section(await renderHome(), "hero");
  const slides = [...hero.querySelectorAll("[data-hero-slide]")];
  assert.equal(slides.length, 4);
  assert.equal(hero.querySelectorAll("[data-slider-dots] button, .slider-dots button").length, 4, "one dot per slide");
  assert.ok(slides[0]!.querySelector("video"), "slide 1 is the film");
  assert.deepEqual(slides.slice(1).map((slide) => slide.querySelector("video")), [null, null, null]);
  assert.deepEqual(slides.slice(1).map((slide) => slide.querySelector("img")!.getAttribute("alt")), ["Living room", "Bedroom", "Dining room"]);
  for (const slide of slides) assert.equal(text(slide.querySelector("[data-hero-headline]")), "Timeless Craftsmanship for Modern Living");
});

test("the strip's ornament is the frame's outlined rosette between two fading lines", async () => {
  const ornament = section(await renderHome(), "announcement").querySelector("[data-campaign-ornament]")!;
  assert.ok(ornament.querySelector("svg[data-strip-rosette]"), "an outlined rosette, drawn as SVG");
  assert.equal(ornament.querySelectorAll("i").length, 2);
  assert.ok(existsSync(local("/media/home/strip-flowers.webp")), "the line-art flowers on the strip's right");
});
