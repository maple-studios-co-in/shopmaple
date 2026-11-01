import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The top of the homepage as the "Maple / Impact Layout" frame (Figma 1049:27656) lays it out:
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

test("the hero is a bento: the film tile with its headline and four category tiles that invite a visit", async () => {
  const hero = section(await renderHome(), "hero");
  assert.ok(hero.querySelector("[data-hero-bento]"), "bento container");
  assert.equal(text(hero.querySelector("[data-hero-headline]")), "Timeless Craftsmanship for Modern Living");
  assert.equal(text(hero.querySelector("[data-hero-intro]")), "Handcrafted furniture that brings elegance to every corner of your home.");
  assert.equal(hero.querySelector("[data-hero-film] video")?.getAttribute("src")?.includes("f9239e922cef45df9972f1dac1b89e0a"), true, "the owner's film still plays in the large tile");
  const tiles = [...hero.querySelectorAll("[data-hero-tile]")];
  assert.deepEqual(tiles.map((tile) => tile.getAttribute("data-hero-tile")), ["sofas", "chairs", "tables", "beds"]);
  assert.deepEqual(tiles.map((tile) => text(tile.querySelector("[data-hero-tile-title]"))), ["Sofas", "Chairs", "Tables", "Beds"]);
  assert.deepEqual(tiles.map((tile) => text(tile.querySelector("[data-hero-tile-cta]"))), Array(4).fill("View Collection"));
  assert.ok(!hero.textContent!.includes("Starting from"), "the frame shows no price line on the tiles");
});

test("hero tile titles follow the admin's edits", async () => {
  const doc = await renderHome((content) => { content.homeDetails!.hero.tiles[0]!.label = "Welcoming sofas"; });
  assert.equal(text(section(doc, "hero").querySelector('[data-hero-tile="sofas"] [data-hero-tile-title]')), "Welcoming sofas");
});

test("the announcement is a split strip: ornament, title, supporting line and a button", async () => {
  const doc = await renderHome((content) => {
    const announcement = content.campaigns.find((campaign) => campaign.key === "landing-announcement")!;
    Object.assign(announcement, { label: "", headline: ["Always Together"], supporting: "For every laugh, fight, and memory.", offer: [], cta: "Celebrate Together", href: "/collections/all" });
  });
  const strip = section(doc, "announcement").querySelector('[data-campaign-layout="strip"]')!;
  assert.ok(strip, "announcement uses the strip layout");
  assert.ok(strip.querySelector("[data-campaign-ornament]"), "ornament above the title");
  assert.equal(text(strip.querySelector("h2")), "Always Together");
  assert.equal(text(strip.querySelector(".campaign-supporting")), "For every laugh, fight, and memory.");
  const cta = strip.querySelector("a")!;
  assert.equal(cta.getAttribute("href"), "/collections/all");
  assert.match(text(cta), /^Celebrate Together/);
  for (const key of ["dining-banner", "seating-banner"]) assert.equal(section(doc, key).querySelector('[data-campaign-layout="strip"]'), null, `${key} keeps the full banner`);
});

test("the Maple Difference row is plain: eyebrow, serif heading, a text link and four promises", async () => {
  const difference = section(await renderHome(), "difference");
  assert.equal(text(difference.querySelector("[data-difference-eyebrow]")), "The Maple Difference");
  assert.equal(text(difference.querySelector("h2")), "Every element is yours to reshape");
  const link = difference.querySelector<HTMLAnchorElement>("[data-difference-link]")!;
  assert.equal(link.getAttribute("href"), "/pages/contact");
  assert.match(text(link), /^Tell Us About Your Space/);
  assert.deepEqual([...difference.querySelectorAll("[data-difference-promise]")].map(text), ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"]);
  assert.equal(difference.querySelectorAll("[data-difference-promise] img").length, 4, "each promise keeps its icon");
});

test("categories show round photos with an arrow badge under a heading with an ornament", async () => {
  const categories = section(await renderHome(), "categories");
  assert.equal(text(categories.querySelector("h2")), "Shop By Category");
  assert.ok(categories.querySelector("[data-heading-ornament]"), "ornament under the heading");
  const tiles = [...categories.querySelectorAll<HTMLAnchorElement>("[data-category-tile]")];
  assert.equal(tiles.length, 6);
  assert.deepEqual(tiles.slice(0, 3).map((tile) => text(tile.querySelector("[data-category-title]"))), ["Sofas", "Dining Chair", "Coffee Tables"]);
  for (const tile of tiles) {
    assert.match(tile.getAttribute("href")!, /^\/collections\//);
    assert.ok(tile.querySelector("[data-category-arrow]"), "arrow badge");
    assert.ok(tile.querySelector("img"), "photo");
  }
});

test("the statement band is static burgundy text with the last word set apart", async () => {
  const band = section(await renderHome((content) => { content.homeCopy.ticker = "Elegance isn't found. At Maple, it is crafted."; }), "ticker").querySelector("[data-statement-band]")!;
  assert.ok(band, "band");
  assert.equal(text(band), "Elegance isn't found. At Maple, it is crafted.");
  assert.equal(text(band.querySelector("[data-statement-accent]")), "crafted");
  assert.equal(band.querySelector("button"), null, "no scrolling, so no pause control");
});

test("offers are four light cards with an arrow badge", async () => {
  const offers = section(await renderHome(), "offers");
  const tiles = [...offers.querySelectorAll<HTMLAnchorElement>("[data-offer-tile]")];
  assert.equal(tiles.length, 4);
  for (const tile of tiles) {
    assert.ok(tile.querySelector("img"), "artwork");
    assert.ok(tile.querySelector("[data-offer-arrow]"), "arrow badge");
  }
});
