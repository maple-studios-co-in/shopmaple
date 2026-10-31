import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import { CategoryLanding } from "../components/category-landing";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import categories from "../data/landing-categories.json";

type Slug = "sofas" | "tables" | "chairs";

async function render(slug: Slug, content: unknown = defaultStorefrontContent) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/content/storefront")) return Response.json({ version: 3, content });
    if (new URL(String(url)).pathname === "/api/catalogue/cards") return Response.json({ products: [], published: true });
    throw new Error(`Unexpected network request: ${String(url)}`);
  };
  try {
    const html = await new Response(await renderToReadableStream(<ShopProvider><CategoryLanding slug={slug} /></ShopProvider>)).text();
    return new JSDOM(html, { url: `http://localhost/pages/${slug}` }).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}

const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(text);

test("the chair category page follows the design from top to bottom on the page's own content", async () => {
  const doc = await render("chairs");
  const page = doc.querySelector("[data-store][data-category-landing='chairs']");
  assert.ok(page, "The rebuilt template carries data-store and names its category");
  assert.equal(doc.querySelector(".landing-parity, .landing-categories, .landing-banner, .landing-products, .campaign-banner"), null, "No legacy landing markup remains");

  // Section order: hero card, introduction, categories, wide banner, rails, rooms, promise, paired rail.
  const order = [...page.querySelectorAll("[data-category-section]")].map((node) => node.getAttribute("data-category-section"));
  assert.deepEqual(order, ["hero", "intro", "categories", "banner", "rail", "rooms", "rail", "rail", "rail", "values", "rail"]);

  // Hero: a rounded campaign card with its headline, offer and the collection link the page already had.
  const hero = page.querySelector("[data-category-hero]")!;
  assert.ok(hero.matches("[data-campaign='chairs-hero']"));
  assert.match(text(hero), /Save a seat for someone special\./);
  assert.match(text(hero), /Up to 20% off selected chairs/);
  const cta = hero.querySelector<HTMLAnchorElement>("a[data-campaign-cta]")!;
  assert.equal(cta.getAttribute("href"), "/collections/chairs");
  assert.equal(text(cta), "Shop Chairs →");
  assert.ok(hero.querySelector("img"), "The campaign artwork is shown");

  // Introduction: the page's one h1 and its admin-edited description behind Read more.
  const intro = page.querySelector("[data-category-intro]")!;
  assert.equal(doc.querySelectorAll("h1").length, 1);
  assert.equal(text(intro.querySelector("h1")), "Chairs");
  const more = intro.querySelector("button[aria-expanded='false']")!;
  assert.equal(text(more), "Read more");
  assert.ok(doc.getElementById(more.getAttribute("aria-controls")!), "Read more names the text it expands");

  // Categories: eyebrow, serif heading and a sideways row of round images with labelled arrows.
  const tiles = page.querySelector("[data-category-tiles]")!;
  assert.equal(text(tiles.querySelector("[data-eyebrow]")), "Explore by category");
  assert.equal(text(tiles.querySelector("h2")), "Find what fits your space");
  const links = [...tiles.querySelectorAll<HTMLAnchorElement>("[data-category-tile]")];
  assert.deepEqual(links.map((link) => link.getAttribute("href")), (categories.chairs.sections[1]!.items as { href: string }[]).map((item) => item.href));
  assert.deepEqual(links.map(text), ["Accent Chair", "Bedroom Chair", "Dining Chair", "Iconic/Bar Chair", "Lounge/Wing Chair", "Rocking Chair"]);
  assert.deepEqual(links.map((link) => link.querySelector("img")?.getAttribute("alt")), ["", "", "", "", "", ""], "The label names each link, so its picture is decorative");
  const scroller = tiles.querySelector("[data-rail-track]")!;
  assert.equal(scroller.getAttribute("tabindex"), "0", "The row scrolls from the keyboard");
  assert.equal(scroller.getAttribute("aria-label"), "Chairs categories");
  assert.ok(tiles.querySelector("button[aria-label='Next Chairs categories']"));
  assert.ok(tiles.querySelector("button[aria-label='Previous Chairs categories']"));

  // Wide banner: the sale campaign as a rounded banner.
  const banner = page.querySelector("[data-category-banner]")!;
  assert.ok(banner.matches("[data-campaign='chairs-sale']"));
  assert.match(text(banner), /Up to 20% off chairs/);

  // Shop by room: the three room pictures, each opening the product row it introduces.
  const rooms = page.querySelector("[data-category-rooms]")!;
  assert.equal(text(rooms.querySelector("[data-eyebrow]")), "Shop by room");
  assert.equal(text(rooms.querySelector("h2")), "Curated for every corner of your home");
  const cards = [...rooms.querySelectorAll<HTMLAnchorElement>("a[data-room-card]")];
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((card) => card.querySelector("img")?.getAttribute("src")?.match(/Chair_Mobile_banner_Outdoor|Sofa_Mobile_banner_Bedroom|Sofa_Mobile_banner_Living_room_1/)?.[0]),
    ["Chair_Mobile_banner_Outdoor", "Sofa_Mobile_banner_Bedroom", "Sofa_Mobile_banner_Living_room_1"]);
  assert.deepEqual(cards.map((card) => text(doc.querySelector(`${card.getAttribute("href")} h2`))), ["Chairs", "Bedrooms", "Living"]);
  assert.deepEqual(cards.map(text), ["See Chairs", "See Bedrooms", "See Living"]);

  // Product rows keep their headings, order, destinations and labelled arrows.
  const rails = [...page.querySelectorAll("[data-category-rail]")];
  assert.deepEqual(rails.map((rail) => text(rail.querySelector("h2"))), ["Best Sellers", "Chairs", "Bedrooms", "Living", "Paired Together"]);
  assert.equal(rails[0]!.querySelector("a[data-view-all]")?.getAttribute("href"), "/collections/chair-collection");
  assert.equal(rails[1]!.querySelector("a[data-view-all]"), null, "Rows without a destination get none");
  for (const rail of rails) {
    const heading = text(rail.querySelector("h2"));
    assert.ok(rail.querySelector(`button[aria-label='Next ${heading}']`), heading);
    assert.ok(rail.querySelector(`button[aria-label='Previous ${heading}']`), heading);
  }

  // Our promise: the page's own difference heading and four value cards.
  const values = page.querySelector("[data-category-values]")!;
  assert.equal(text(values.querySelector("[data-eyebrow]")), "The Maple Difference");
  assert.equal(text(values.querySelector("h2")), "Every element is yours to reshape");
  assert.deepEqual(texts(values, "[data-value-card] h3"), ["Quiet Luxury", "Built for Real Living", "Ages Beautifully", "Strength You Don’t See"]);
  assert.match(text(values.querySelector("[data-value-card] p")), /Furniture that doesn’t shout/);

  assert.equal(doc.querySelectorAll("[data-promise-strip] li").length, 4, "The house promises close the page");
  assert.doesNotMatch(text(page), /\d+\+?\s*Products/i, "No invented product counts");
});

test("the category template keeps headings in order and every image described or decorative", async () => {
  for (const slug of ["chairs", "sofas", "tables"] as const) {
    const doc = await render(slug);
    const levels = [...doc.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((node) => Number(node.tagName[1]));
    assert.equal(levels[0], 1, `${slug}: the page opens with its h1`);
    levels.reduce((previous, level) => {
      assert.ok(level <= previous + 1, `${slug}: heading levels never skip (${levels.join(",")})`);
      return level;
    });
    for (const image of doc.querySelectorAll("img")) assert.ok(image.hasAttribute("alt"), `${slug}: ${image.getAttribute("src")}`);
  }
});

test("sofas and tables follow the same template from their own content", async () => {
  const sofas = await render("sofas");
  assert.ok(sofas.querySelector("[data-store][data-category-landing='sofas']"));
  assert.equal(text(sofas.querySelector("h1")), "Sofas");
  assert.equal(sofas.querySelectorAll("[data-category-tile]").length, 10);
  assert.equal(sofas.querySelector("[data-category-hero] a[data-campaign-cta]")?.getAttribute("href"), "/collections/sofas");
  assert.equal(sofas.querySelectorAll("a[data-room-card]").length, 3);
  assert.deepEqual(texts(sofas, "[data-value-card] h3"), ["Grain", "Edge", "Fabric", "Polish"]);

  const tables = await render("tables");
  assert.equal(text(tables.querySelector("h1")), "Tables");
  assert.equal(tables.querySelectorAll("[data-category-tile]").length, 6);
  const cards = [...tables.querySelectorAll<HTMLAnchorElement>("a[data-room-card]")];
  assert.equal(cards.length, 4, "Tables have four room pictures, so the row shows four");
  assert.deepEqual(cards.map((card) => text(tables.querySelector(`${card.getAttribute("href")} h2`))), ["Dinings", "Bedroom", "Living", "Consoles"]);
  assert.deepEqual(texts(tables, "[data-category-rail] h2"), ["Best Sellers", "Dinings", "Bedroom", "Living", "Consoles", "Paired Together"]);
});

test("editorial products missing from the catalogue stay honest enquiries in the rebuilt rows", async () => {
  const doc = await render("chairs");
  const source = doc.querySelector("[data-category-rail] [data-source-product]");
  assert.ok(source, "Source-only products are shown as enquiry cards");
  assert.match(source.querySelector("[data-card-name]")?.getAttribute("href") ?? "", /^\/pages\/contact\?product=/);
  assert.equal(text(source.querySelector("[data-card-price]")), "Price on request");
  assert.equal(source.querySelector("img")?.getAttribute("alt"), text(source.querySelector("[data-card-name]")));
});

test("a room picture not followed by its product row stays a plain picture, and hiding the campaigns keeps the heading", async () => {
  const content = structuredClone(defaultStorefrontContent) as typeof defaultStorefrontContent & { landingPages: unknown[] };
  content.landingPages = [{
    slug: "chairs", title: "Chairs", introduction: "Seats for every room.",
    sections: [{ key: "hero", enabled: false }, { key: "sale", enabled: false }, { key: "primary-products", enabled: false }],
  }];
  const doc = await render("chairs", content);
  assert.equal(doc.querySelector("[data-campaign]"), null);
  assert.equal(text(doc.querySelector("[data-category-intro] h1")), "Chairs");
  assert.equal(doc.querySelector("[data-category-intro] button"), null, "A short introduction needs no Read more");
  const rooms = doc.querySelector("[data-category-rooms]")!;
  assert.equal(rooms.querySelectorAll("[data-room-card]").length, 3);
  assert.equal(rooms.querySelectorAll("a[data-room-card]").length, 2, "The outdoor picture lost its row, so it links nowhere");
  assert.ok(rooms.querySelector("div[data-room-card] img[alt]"));
});
