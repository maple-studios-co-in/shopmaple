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

test("Bestsellers has an eyebrow and a lede, and still no View all link", async () => {
  const bestsellers = section(await renderHome(), "bestsellers");
  assert.equal(text(bestsellers.querySelector("[data-rail-eyebrow]")), "Handpicked favourites");
  assert.equal(text(bestsellers.querySelector("h2")), "Bestsellers");
  assert.equal(text(bestsellers.querySelector("[data-rail-lede]")), "Discover the pieces that make a room feel complete.");
  assert.equal(bestsellers.querySelector("[data-rail-viewall]"), null, "the owner removed it");
});

test("Chairs has the same eyebrow and a boxed link to every chair", async () => {
  const chairs = section(await renderHome(), "chairs");
  assert.equal(text(chairs.querySelector("[data-rail-eyebrow]")), "Handpicked favourites");
  assert.equal(text(chairs.querySelector("h2")), "Chairs");
  const link = chairs.querySelector<HTMLAnchorElement>("[data-rail-viewall]")!;
  assert.equal(link.getAttribute("href"), "/collections/chairs");
  assert.match(text(link), /^View all chairs/);
  assert.equal(chairs.querySelector("[data-rail-lede]"), null, "the frame has no lede under Chairs");
});

test("Nimbus states its tagline and offers an Explore button before anyone hovers", async () => {
  const nimbus = section(await renderHome((content) => { content.homeDetails!.nimbus.tagline = "Soft presence. Strong craftsmanship."; content.homeDetails!.nimbus.cta = "Explore"; }), "nimbus");
  assert.equal(text(nimbus.querySelector("[data-nimbus-lead]")), "Soft presence. Strong craftsmanship.");
  const explore = nimbus.querySelector<HTMLAnchorElement>("[data-nimbus-explore]")!;
  assert.equal(explore.getAttribute("href"), "/pages/nimbus-collection");
  assert.equal(text(explore), "Explore");
});

test("campaign banners keep three layouts: strip, full band and card", async () => {
  const doc = await renderHome();
  assert.deepEqual(["announcement", "dining-banner", "seating-banner", "promos"].map((key) => [...section(doc, key).querySelectorAll("[data-campaign-layout]")].map((node) => node.getAttribute("data-campaign-layout"))),
    [["strip"], ["band"], ["band"], ["card", "card", "card"]]);
});
