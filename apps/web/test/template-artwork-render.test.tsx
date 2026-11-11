import assert from "node:assert/strict";
import { shown } from "./support/rendered-src";
import { cardFixture } from "./support/catalogue-fixtures";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import NimbusPage from "../app/nimbus-collection/page";
import StoryPage from "../app/our-story/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultNimbusPage } from "../lib/nimbus-content-defaults";
import { templateMediaResponsiveKeys } from "@shopmaple/contracts";

/** Each listed Keeri product's own photo, as the catalogue's cards carry it. */
const photo = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle}.webp`;
// Independent expectations catch altered originals and incorrect key-to-slot wiring. The originals first published on
// Shopify left the store (owner, 11 Nov 2026): such a slot shows its Keeri stand-in product's photo (desktop and mobile
// alike), or, with none, nothing (`null`) until staff upload artwork. No page draws a film.
const slots = [
  ["home-workshop-poster", "home", ".hero-film [data-hero-slide] img", photo("arbor-sofa"), "Maple furniture"],
  ["home-hero-sofas", "home", '.category-tile[href="/sofas"] img', "/media/home/hero-sofas.webp", ""],
  ["home-hero-chairs", "home", '.category-tile[href="/chairs"] img', "/media/home/hero-chairs.webp", ""],
  ["home-hero-tables", "home", '.category-tile[href="/tables"] img', "/media/home/hero-tables.webp", ""],
  ["home-hero-beds", "home", '.category-tile[href="/collections/beds"] img', "/media/home/hero-beds.webp", ""],
  ["home-nimbus", "home", ".nimbus-stage-media img", "/media/home/nimbus-clouds.webp", "The Nimbus Collection — cloud-like upholstered furniture", "/media/home/nimbus-clouds.webp"],
  ["home-newsletter", "home", ".home-newsletter img", null, "Maple Furnishers"],
  ["home-testimonial-poster", "home", ".home-testimonial img", null, "Maple customer testimonial"],
  ["nimbus-hero-poster", "nimbus", '[data-collection-section="hero"] img', "/media/nimbus-collection/hero.webp", "A cream sofa, bouclé lounge chairs and a marble nesting table set on a bank of soft cloud", "/media/nimbus-collection/hero-mobile.webp"],
  ["nimbus-origin", "nimbus", '[data-collection-section="origin"] img', "/media/nimbus-collection/origin.webp", "A travertine archway opening onto a sea of cloud at sunrise"],
  ["nimbus-craft-poster", "nimbus", '[data-collection-section="material"] img', "/media/nimbus-collection/detail.webp", "The piped arm of a cream bouclé armchair, close up"],
  ["nimbus-room-living", "nimbus", "[data-collection-card]:nth-child(1) img", "/media/nimbus-collection/sofas.webp", "A cream modular sectional around a round travertine table in a sunlit room above the clouds"],
  ["nimbus-room-collection", "nimbus", "[data-collection-card]:nth-child(2) img", "/media/nimbus-collection/accent-chairs.webp", "A cream bouclé accent chair on walnut legs beside a bronze side table", "/media/nimbus-collection/accent-chairs.webp"],
  ["nimbus-room-dining", "nimbus", "[data-collection-card]:nth-child(3) img", "/media/nimbus-collection/tables.webp", "Two fluted travertine nesting tables on a woven rug, a walnut console behind them"],
  ["nimbus-room-bedroom", "nimbus", "[data-collection-card]:nth-child(4) img", "/media/nimbus-collection/beds.webp", "A cream upholstered bed and bench in a bedroom whose arches open onto the clouds"],
  ["story-hero", "story", ".story-hero-media img", photo("luca"), "A Maple armchair"],
  ["story-belief", "story", ".story-belief-media img", photo("varin"), "A Maple dining chair"],
  ["story-chapter-1", "story", '[data-story-chapter="chapter-1"] img', "/media/our-story/chapter-1.webp", "A walnut chair frame on a workbench strewn with shavings and hand planes"],
  ["story-chapter-2", "story", '[data-story-chapter="chapter-2"] img', "/media/our-story/chapter-2.webp", "A cream sofa with burgundy cushions in a sunlit Indian living room"],
  ["story-chapter-3", "story", '[data-story-chapter="chapter-3"] img', "/media/our-story/chapter-3.webp", "A bouclé lounge chair on a walnut frame beneath an arched alcove"],
  ["story-chapter-4", "story", '[data-story-chapter="chapter-4"] img', "/media/our-story/chapter-4.webp", "An upholsterer fitting burgundy fabric over a chair beside paper patterns"],
  ["story-chapter-5", "story", '[data-story-chapter="chapter-5"] img', "/media/our-story/chapter-5.webp", "A cream armchair with a burgundy cushion lit for a photo shoot"],
  ["story-chapter-6", "story", '[data-story-chapter="chapter-6"] img', "/media/our-story/chapter-6.webp", "Cream dining chairs around a round walnut table in a stone-floored room"],
  ["story-chapter-7", "story", '[data-story-chapter="chapter-7"] img', "/media/our-story/chapter-7.webp", "A craftsman wrapping a walnut sideboard in protective cloth"],
] as const;
const responsive = (key: string) => (templateMediaResponsiveKeys as readonly string[]).includes(key);
const overrides = () => slots.map(([key]) => ({ key, image: `/media/${key}.webp`, alt: `Edited ${key}`, ...(responsive(key) ? { mobileImage: `/media/${key}-small.webp` } : {}) }));
function published(media?: unknown) {
  const content = structuredClone(defaultStorefrontContent);
  delete (content as Record<string, unknown>).templateMedia;
  if (media !== undefined) Object.assign(content, { templateMedia: media });
  content.homeSections = ["hero", "nimbus", "newsletter", "testimonial"].map(key => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, revealSections: false };
  return { version: 10, content };
}
async function withPublished(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const requests: { url: string; method: string; cache?: RequestCache }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", cache: init?.cache });
    if (new URL(url).pathname === "/api/catalogue/cards")
      return Response.json({ published: true, products: (new URL(url).searchParams.get("handles") ?? "").split(",").map(handle => ({ ...cardFixture(handle), image: photo(handle) })) });
    if (!url.endsWith("/api/content/storefront")) throw new Error("Unexpected endpoint");
    if (body === "offline") throw new Error("offline");
    return Response.json(body);
  };
  try {
    await run();
    assert.ok(requests.every(r => r.method === "GET" && (["/api/catalogue/cards", "/api/instagram/feed"].includes(new URL(r.url).pathname) || r.url.endsWith("/api/content/storefront"))), "Pages must only read public content and catalogue, never drafts or writes");
    assert.ok(requests.filter(r => r.url.endsWith("/api/content/storefront")).every(r => r.cache === "no-store"));
  } finally { globalThis.fetch = previous; }
}
async function documentFor(page: "home" | "nimbus" | "story") {
  // The Nimbus series rail draws real product cards, which read the shop's cart context.
  const element = page === "home" ? <ShopProvider><Home /></ShopProvider> : page === "nimbus" ? <ShopProvider>{await NimbusPage()}</ShopProvider> : await StoryPage();
  return new JSDOM(await new Response(await renderToReadableStream(element)).text()).window.document;
}
/** Sections a fresh homepage keeps hidden (it closes on the values); their artwork is checked wherever a document shows them. */
const hiddenByDefault = new Set(["home-newsletter", "home-testimonial-poster"]);
async function checkArtwork(edited: boolean, fallback = false) {
  for (const page of ["home", "nimbus", "story"] as const) {
    const doc = await documentFor(page);
    for (const [key, scope, selector, image, alt, mobile] of slots) {
      if (scope !== page) continue;
      const node = doc.querySelector(selector);
      // Content that falls back to the defaults draws a fresh homepage, without those sections.
      if (!node && fallback && hiddenByDefault.has(key)) continue;
      if (!edited && image === null) { assert.equal(node, null, `${key}: nothing drawn until staff upload artwork`); continue; }
      assert.ok(node, key);
      assert.equal(shown(node.getAttribute("src")), edited ? `/media/${key}.webp` : image, key);
      assert.equal(node.getAttribute("alt"), edited ? `Edited ${key}` : alt, `${key} accessible description`);
      // A stand-in photo serves both crops; an upload brings its own mobile crop where the placement takes one.
      const source = node.parentElement?.querySelector("source")?.getAttribute("srcset") ?? null;
      if (edited) { if (mobile) assert.equal(source, responsive(key) ? `/media/${key}-small.webp` : null, `${key} mobile`); }
      else if (mobile) assert.equal(source, mobile, `${key} mobile`);
    }
    // No film anywhere: they were Shopify files, and films cannot be uploaded yet.
    assert.equal(doc.querySelector("video"), null, `${page} draws no film`);
    if (page === "home") {
      assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Explore Collection");
      assert.equal(doc.querySelector(".hero-cta")?.getAttribute("href"), "/nimbus-collection");
      assert.equal(doc.querySelector(".hero-film button:not([data-slider-dot])"), null, "no video control (the dots are slide buttons)");
      if (!fallback || doc.querySelector(".home-newsletter")) assert.equal(doc.querySelector(".home-newsletter h2")?.textContent, "Soft presence. Strong craftsmanship.");
    }
    if (page === "nimbus") {
      assert.equal(doc.querySelector('[data-collection-section="philosophy"] h2')?.textContent, "Comfort is\nthe starting point.");
      assert.equal(doc.querySelector("[data-collection-film]"), null, "Nimbus has no film to open");
    }
  }
}

test("legacy published pages show every bundled original, Keeri stand-ins for the former Shopify artwork, and nothing else", async () => {
  await withPublished(published(), () => checkArtwork(false));
});

test("published artwork overrides reach all 24 slots, three responsive pairs and accessible descriptions", async () => {
  await withPublished(published(overrides()), () => checkArtwork(true));
});

test("draft-only, malformed artwork, malformed responsive pairs and unavailable content fall back to original artwork", async () => {
  for (const body of [
    { version: 10, draft: published(overrides()).content },
    published([{ key: "story-hero", image: "javascript:alert(1)", alt: "Unsafe" }]),
    published([{ key: "home-nimbus", image: "/media/incomplete.webp", alt: "Incomplete" }]),
    "offline",
  ]) await withPublished(body, () => checkArtwork(false, true));
});

test("renamed Nimbus collection cards keep their photos and descriptions, and keyed overrides follow their slots", async () => {
  for (const edited of [false, true]) {
    const body = published(edited ? overrides() : undefined);
    const page = structuredClone(defaultNimbusPage);
    page.browse.items = [{ title: "Sit back" }, { title: "Take a seat" }, { title: "Gather here" }, { title: "Rest here" }];
    body.content.nimbusPage = page;
    await withPublished(body, async () => {
      const doc = await documentFor("nimbus");
      assert.deepEqual([...doc.querySelectorAll("[data-collection-card] h3")].map(n => n.textContent), ["Sit back", "Take a seat", "Gather here", "Rest here"]);
      const photos = [...doc.querySelectorAll("[data-collection-card] img")];
      assert.deepEqual(photos.map(n => n.getAttribute("alt")), edited
        ? ["Edited nimbus-room-living", "Edited nimbus-room-collection", "Edited nimbus-room-dining", "Edited nimbus-room-bedroom"]
        : slots.filter(s => s[0].startsWith("nimbus-room-")).map(s => s[4]));
      assert.equal(shown(photos[2]?.getAttribute("src")), edited ? "/media/nimbus-room-dining.webp" : "/media/nimbus-collection/tables.webp");
    });
  }
});

test("published artwork descriptions remain literal accessible text", async () => {
  const media = overrides();
  const markup = '<img src=x onerror="alert(1)">';
  media.find(item => item.key === "story-hero")!.alt = markup;
  media.find(item => item.key === "story-belief")!.alt = markup;
  media.find(item => item.key === "story-chapter-4")!.alt = markup;
  await withPublished(published(media), async () => {
    const doc = await documentFor("story");
    assert.equal(doc.querySelector(".story-hero-media img")?.getAttribute("alt"), markup);
    assert.equal(doc.querySelector(".story-belief-media img")?.getAttribute("alt"), markup);
    assert.equal(doc.querySelector('[data-story-chapter="chapter-4"] img')?.getAttribute("alt"), markup);
    assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
  });
});
