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

test("the chair category page follows the PDF Review frame from top to bottom on the page's own content", async () => {
  const doc = await render("chairs");
  const page = doc.querySelector("[data-store][data-category-landing='chairs']");
  assert.ok(page, "The rebuilt template carries data-store and names its category");
  assert.equal(doc.querySelector(".landing-parity, .landing-categories, .landing-banner, .landing-products, .campaign-banner"), null, "No legacy landing markup remains");

  // Section order follows the admin's order: hero card, categories, sale banner, rails and rooms,
  // the difference band, the paired rail, then the introduction's full text.
  const order = [...page.querySelectorAll("[data-category-section]")].map((node) => node.getAttribute("data-category-section"));
  assert.deepEqual(order, ["hero", "categories", "banner", "rail", "rooms", "rail", "rail", "rail", "values", "rail", "intro"]);

  // Hero: the frame's image-and-copy card. The category's name is the page's one h1, set as the eyebrow;
  // the campaign gives the headline, offer, artwork and link.
  const hero = page.querySelector("[data-category-hero]")!;
  assert.ok(hero.matches("[data-campaign='chairs-hero']"));
  assert.equal(doc.querySelectorAll("h1").length, 1);
  const title = hero.querySelector("h1")!;
  assert.ok(title.matches("[data-hero-eyebrow]"), "The h1 is the hero's eyebrow");
  assert.equal(text(title), "Chairs");
  assert.equal(text(hero.querySelector("[data-hero-headline]")), "Save a seat for someone special.");
  assert.match(text(hero.querySelector("[data-hero-copy]")), /Up to 20% off selected chairs/);
  const cta = hero.querySelector<HTMLAnchorElement>("a[data-campaign-cta]")!;
  assert.equal(cta.getAttribute("href"), "/collections/chairs");
  assert.equal(text(cta), "Shop Chairs →");
  assert.ok(hero.querySelector("[data-hero-media] img"), "The campaign artwork fills the picture side");

  // Categories: the shared section heading and a row of round pictures with arrowed labels.
  const tiles = page.querySelector("[data-category-tiles]")!;
  assert.equal(text(tiles.querySelector("[data-section-eyebrow]")), "Explore by category");
  assert.equal(text(tiles.querySelector("h2")), "Find what fits your space.");
  const links = [...tiles.querySelectorAll<HTMLAnchorElement>("a[data-category-tile]")];
  assert.deepEqual(links.map((link) => link.getAttribute("href")), (categories.chairs.sections[1]!.items as { href: string }[]).map((item) => item.href));
  assert.deepEqual(links.map((link) => text(link.querySelector("[data-tile-label]"))), ["Accent Chair", "Bedroom Chair", "Dining Chair", "Iconic/Bar Chair", "Lounge/Wing Chair", "Rocking Chair"]);
  assert.ok(links.every((link) => link.querySelector("[aria-hidden='true']")?.textContent === "→"), "Each label ends in a decorative arrow");
  assert.deepEqual(links.map((link) => link.querySelector("img")?.getAttribute("alt")), ["", "", "", "", "", ""], "The label names each link, so its picture is decorative");
  const scroller = tiles.querySelector("[data-rail-track]")!;
  assert.equal(scroller.getAttribute("tabindex"), "0", "The row scrolls from the keyboard");
  assert.equal(scroller.getAttribute("aria-label"), "Chairs categories");
  assert.ok(tiles.querySelector("button[aria-label='Next Chairs categories']"));
  assert.ok(tiles.querySelector("button[aria-label='Previous Chairs categories']"));
  assert.equal(tiles.querySelector("[data-tile-count], [data-tile-icon]"), null, "No invented counts or icons");

  // Sale banner: unchanged campaign slot.
  const banner = page.querySelector("[data-category-banner]")!;
  assert.ok(banner.matches("[data-campaign='chairs-sale']"));
  assert.match(text(banner), /Up to 20% off chairs/);

  // Shop by room: each picture is labelled with the product row it opens, as the frame's "Living room →".
  const rooms = page.querySelector("[data-category-rooms]")!;
  assert.equal(text(rooms.querySelector("[data-section-eyebrow]")), "Shop by room");
  assert.equal(text(rooms.querySelector("h2")), "Curated for every corner of your home.");
  const cards = [...rooms.querySelectorAll<HTMLAnchorElement>("a[data-room-card]")];
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((card) => card.querySelector("img")?.getAttribute("src")?.match(/Chair_Mobile_banner_Outdoor|Sofa_Mobile_banner_Bedroom|Sofa_Mobile_banner_Living_room_1/)?.[0]),
    ["Chair_Mobile_banner_Outdoor", "Sofa_Mobile_banner_Bedroom", "Sofa_Mobile_banner_Living_room_1"]);
  assert.deepEqual(cards.map((card) => text(card.querySelector("[data-room-label]"))), ["Chairs", "Bedrooms", "Living"]);
  assert.deepEqual(cards.map((card) => text(doc.querySelector(`${card.getAttribute("href")} h2`))), ["Chairs", "Bedrooms", "Living"]);
  assert.ok(cards.every((card) => card.querySelector("img")?.getAttribute("alt") === ""), "The label names the link");

  // Product rows: the shared heading over the row; headings, order, destinations and arrows kept.
  const rails = [...page.querySelectorAll("[data-category-rail]")];
  assert.deepEqual(rails.map((rail) => text(rail.querySelector("h2"))), ["Best Sellers", "Chairs", "Bedrooms", "Living", "Paired Together"]);
  assert.ok(rails.every((rail) => text(rail.querySelector("[data-section-eyebrow]")) === "Shop by"));
  assert.equal(rails[0]!.querySelector("a[data-view-all]")?.getAttribute("href"), "/collections/chair-collection");
  assert.equal(rails[1]!.querySelector("a[data-view-all]"), null, "Rows without a destination get none");
  for (const rail of rails) {
    const heading = text(rail.querySelector("h2"));
    assert.ok(rail.querySelector(`button[aria-label='Next ${heading}']`), heading);
    assert.ok(rail.querySelector(`button[aria-label='Previous ${heading}']`), heading);
  }

  // The frame's promise band carries the page's own difference heading and its four values.
  const values = page.querySelector("[data-category-values]")!;
  assert.equal(text(values.querySelector("[data-section-eyebrow]")), "The Maple Difference");
  assert.equal(text(values.querySelector("h2")), "Every element is yours to reshape");
  const items = [...values.querySelectorAll("ul > li[data-value-card]")];
  assert.deepEqual(items.map((item) => text(item.querySelector("strong"))), ["Quiet Luxury", "Built for Real Living", "Ages Beautifully", "Strength You Don’t See"]);
  assert.match(text(items[0]!), /Furniture that doesn’t shout/);
  assert.equal(doc.querySelectorAll("[data-promise-strip]").length, 0, "One promise band, as in the frame");

  // The introduction's text follows the rows, folded behind Read more, under the hero's h1.
  const intro = page.querySelector("[data-category-intro]")!;
  assert.equal(intro.querySelector("h1, h2"), null);
  assert.match(text(intro.querySelector("p")), /^Chairs do more than complete a room/);
  const more = intro.querySelector("button[aria-expanded='false']")!;
  assert.equal(text(more), "Read more");
  assert.ok(doc.getElementById(more.getAttribute("aria-controls")!), "Read more names the text it expands");

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
  assert.equal(text(sofas.querySelector("[data-category-hero] h1")), "Sofas");
  assert.equal(text(sofas.querySelector("[data-category-hero] [data-hero-headline]")), "Settle in for the celebrations.");
  assert.equal(sofas.querySelectorAll("[data-category-tile]").length, 10);
  assert.equal(sofas.querySelector("[data-category-hero] a[data-campaign-cta]")?.getAttribute("href"), "/collections/sofas");
  assert.equal(sofas.querySelectorAll("a[data-room-card]").length, 3);
  assert.deepEqual(texts(sofas, "[data-value-card] strong"), ["Grain", "Edge", "Fabric", "Polish"]);

  const tables = await render("tables");
  assert.equal(text(tables.querySelector("h1")), "Tables");
  assert.equal(tables.querySelectorAll("[data-category-tile]").length, 6);
  const cards = [...tables.querySelectorAll<HTMLAnchorElement>("a[data-room-card]")];
  assert.equal(cards.length, 4, "Tables have four room pictures, so the row shows four");
  assert.deepEqual(cards.map((card) => text(tables.querySelector(`${card.getAttribute("href")} h2`))), ["Dinings", "Bedroom", "Living", "Consoles"]);
  assert.deepEqual(cards.map((card) => text(card.querySelector("[data-room-label]"))), ["Dinings", "Bedroom", "Living", "Consoles"]);
  assert.equal(text(tables.querySelector("[data-category-hero] h1")), "Tables");
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

test("a room picture not followed by its product row stays a plain picture, and hiding the hero puts the introduction first", async () => {
  const content = structuredClone(defaultStorefrontContent) as typeof defaultStorefrontContent & { landingPages: unknown[] };
  content.landingPages = [{
    slug: "chairs", title: "Chairs", introduction: "Seats for every room.",
    sections: [{ key: "hero", enabled: false }, { key: "sale", enabled: false }, { key: "primary-products", enabled: false }],
  }];
  const doc = await render("chairs", content);
  assert.equal(doc.querySelector("[data-campaign]"), null);
  const order = [...doc.querySelectorAll("[data-category-section]")].map((node) => node.getAttribute("data-category-section"));
  assert.equal(order[0], "intro", "Without a hero the introduction opens the page");
  assert.equal(doc.querySelectorAll("[data-category-intro]").length, 1);
  assert.equal(text(doc.querySelector("[data-category-intro] h1")), "Chairs");
  assert.equal(text(doc.querySelector("[data-category-intro] p")), "Seats for every room.");
  assert.equal(doc.querySelector("[data-category-intro] button"), null, "A short introduction needs no Read more");
  const rooms = doc.querySelector("[data-category-rooms]")!;
  assert.equal(rooms.querySelectorAll("[data-room-card]").length, 3);
  assert.equal(rooms.querySelectorAll("a[data-room-card]").length, 2, "The outdoor picture lost its row, so it links nowhere");
  assert.ok(rooms.querySelector("div[data-room-card] img[alt]"));
  assert.equal(rooms.querySelector("div[data-room-card] [data-room-label]"), null, "A picture with no row gets no invented label");
});

test("a hero campaign outside its schedule leaves the introduction, with the h1, at the top", async () => {
  const content = structuredClone(defaultStorefrontContent);
  const hero = content.campaigns.find((campaign) => campaign.key === "chairs-hero")!;
  Object.assign(hero, { schedule: { startsAt: null, endsAt: "2020-01-01T00:00:00.000Z" } });
  const doc = await render("chairs", content);
  assert.equal(doc.querySelector("[data-category-hero]"), null);
  assert.equal(doc.querySelectorAll("h1").length, 1);
  const intros = [...doc.querySelectorAll("[data-category-intro]")];
  assert.equal(intros.length, 1, "The introduction shows once");
  assert.equal(text(intros[0]!.querySelector("h1")), "Chairs");
  const order = [...doc.querySelectorAll("[data-category-section]")].map((node) => node.getAttribute("data-category-section"));
  assert.deepEqual(order.slice(0, 2), ["intro", "categories"]);
});
