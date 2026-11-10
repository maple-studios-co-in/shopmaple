import assert from "node:assert/strict";
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

const files = "https://shop.maplefurnishers.com/cdn/shop/files/";
// Independent source expectations catch altered originals and incorrect key-to-slot wiring.
const slots = [
  ["home-workshop-poster", "home", ".hero-film img", "https://shop.maplefurnishers.com/cdn/shop/files/preview_images/f9239e922cef45df9972f1dac1b89e0a.thumbnail.0000000000.jpg?v=1792990295&width=1600", "Arranging flowers on a Maple sideboard beside a floral armchair"],
  ["home-hero-sofas", "home", '.category-tile[href="/sofas"] img', "/media/home/hero-sofas.webp", ""],
  ["home-hero-chairs", "home", '.category-tile[href="/chairs"] img', "/media/home/hero-chairs.webp", ""],
  ["home-hero-tables", "home", '.category-tile[href="/tables"] img', "/media/home/hero-tables.webp", ""],
  ["home-hero-beds", "home", '.category-tile[href="/collections/beds"] img', "/media/home/hero-beds.webp", ""],
  ["home-nimbus", "home", ".nimbus-stage-media img", "/media/home/nimbus-clouds.webp", "The Nimbus Collection — cloud-like upholstered furniture", "/media/home/nimbus-clouds.webp"],
  ["home-newsletter", "home", ".home-newsletter img", files + "Cover_Image_Maple_1.png", "Maple Furnishers"],
  ["home-testimonial-poster", "home", ".home-testimonial video", files + "preview_images/aee33cd277cb42e7804bfce64be22297.thumbnail.0000000000.jpg?v=1778852379&width=960", "Maple customer testimonial"],
  // The Nimbus redesign (Figma 311:548, owner 10 Nov 2026): its photos keep the slots whose roles they took.
  ["nimbus-hero-poster", "nimbus", '[data-collection-section="hero"] img', "/media/nimbus-collection/hero.webp", "A cream sofa, bouclé lounge chairs and a marble nesting table set on a bank of soft cloud", "/media/nimbus-collection/hero-mobile.webp"],
  ["nimbus-origin", "nimbus", '[data-collection-section="origin"] img', "/media/nimbus-collection/origin.webp", "A travertine archway opening onto a sea of cloud at sunrise"],
  ["nimbus-craft-poster", "nimbus", '[data-collection-section="material"] img', "/media/nimbus-collection/detail.webp", "The piped arm of a cream bouclé armchair, close up"],
  ["nimbus-room-living", "nimbus", "[data-collection-card]:nth-child(1) img", "/media/nimbus-collection/sofas.webp", "A cream modular sectional around a round travertine table in a sunlit room above the clouds"],
  ["nimbus-room-collection", "nimbus", "[data-collection-card]:nth-child(2) img", "/media/nimbus-collection/accent-chairs.webp", "A cream bouclé accent chair on walnut legs beside a bronze side table", "/media/nimbus-collection/accent-chairs.webp"],
  ["nimbus-room-dining", "nimbus", "[data-collection-card]:nth-child(3) img", "/media/nimbus-collection/tables.webp", "Two fluted travertine nesting tables on a woven rug, a walnut console behind them"],
  ["nimbus-room-bedroom", "nimbus", "[data-collection-card]:nth-child(4) img", "/media/nimbus-collection/beds.webp", "A cream upholstered bed and bench in a bedroom whose arches open onto the clouds"],
  ["story-hero", "story", ".story-hero-media img", files + "Frame129.png?height=4291&v=1777318243", "A hand resting on the bouclé seat of a Maple armchair"],
  ["story-belief", "story", ".story-belief-media img", files + "preview_images/84351f35cf124a0ab27f853cb96b817f.thumbnail.0000000000_2500x.jpg?v=1776870599", "The hand-woven cord seat of a Maple chair"],
  ["story-chapter-1", "story", '[data-story-chapter="chapter-1"] img', "/media/our-story/chapter-1.webp", "A walnut chair frame on a workbench strewn with shavings and hand planes"],
  ["story-chapter-2", "story", '[data-story-chapter="chapter-2"] img', "/media/our-story/chapter-2.webp", "A cream sofa with burgundy cushions in a sunlit Indian living room"],
  ["story-chapter-3", "story", '[data-story-chapter="chapter-3"] img', "/media/our-story/chapter-3.webp", "A bouclé lounge chair on a walnut frame beneath an arched alcove"],
  ["story-chapter-4", "story", '[data-story-chapter="chapter-4"] img', "/media/our-story/chapter-4.webp", "An upholsterer fitting burgundy fabric over a chair beside paper patterns"],
  ["story-chapter-5", "story", '[data-story-chapter="chapter-5"] img', "/media/our-story/chapter-5.webp", "A cream armchair with a burgundy cushion lit for a photo shoot"],
  ["story-chapter-6", "story", '[data-story-chapter="chapter-6"] img', "/media/our-story/chapter-6.webp", "Cream dining chairs around a round walnut table in a stone-floored room"],
  ["story-chapter-7", "story", '[data-story-chapter="chapter-7"] img', "/media/our-story/chapter-7.webp", "A craftsman wrapping a walnut sideboard in protective cloth"],
] as const;
const overrides = () => slots.map(([key, , , , , mobile]) => ({ key, image: `/media/${key}.webp`, alt: `Edited ${key}`, ...(mobile ? { mobileImage: `/media/${key}-small.webp` } : {}) }));
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
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ products: [], published: true });
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
  const element = page === "home" ? <ShopProvider><Home /></ShopProvider> : page === "nimbus" ? await NimbusPage() : await StoryPage();
  return new JSDOM(await new Response(await renderToReadableStream(element)).text()).window.document;
}
/** Sections a fresh homepage keeps hidden (it closes on the values); their artwork is checked wherever a document shows them. */
const hiddenByDefault = new Set(["home-newsletter", "home-testimonial-poster"]);
async function checkArtwork(edited: boolean, fallback = false) {
  for (const page of ["home", "nimbus", "story"] as const) {
    const doc = await documentFor(page);
    for (const [key, scope, selector, image, alt, mobile] of slots) {
      if (scope !== page) continue;
      const node = doc.querySelector(selector)!;
      // Content that falls back to the defaults draws a fresh homepage, without those sections.
      if (!node && fallback && hiddenByDefault.has(key)) continue;
      assert.ok(node, key);
      const video = node.tagName === "VIDEO";
      assert.equal(node.getAttribute(video ? "poster" : "src"), edited ? `/media/${key}.webp` : image, key);
      assert.equal(node.getAttribute(video ? "aria-label" : "alt"), edited ? `Edited ${key}` : alt, `${key} accessible description`);
      if (mobile && !video) assert.equal(node.parentElement?.querySelector("source")?.getAttribute("srcset"), edited ? `/media/${key}-small.webp` : mobile, `${key} mobile`);
    }
    if (page === "home") {
      assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Explore Collection");
      assert.equal(doc.querySelector(".hero-cta")?.getAttribute("href"), "/nimbus-collection");
      // The latest shop film plays on its own as decoration, with no controls (owner, 2026-11-01).
      assert.equal(doc.querySelector(".hero-film video")?.getAttribute("aria-hidden"), "true");
      assert.equal(doc.querySelector(".hero-film button:not([data-slider-dot])"), null, "no video control (the dots are slide buttons)");
      if (!fallback || doc.querySelector(".home-testimonial")) assert.ok(doc.querySelector('.home-testimonial video[controls] source[src$="84199271.mp4?v=0"]'));
      if (!fallback || doc.querySelector(".home-newsletter")) assert.equal(doc.querySelector(".home-newsletter h2")?.textContent, "Soft presence. Strong craftsmanship.");
    }
    if (page === "nimbus") {
      assert.equal(doc.querySelector('[data-collection-section="philosophy"] h2')?.textContent, "Comfort is\nthe starting point.");
      // The film loads only when a visitor opens it.
      assert.ok(doc.querySelector("[data-collection-film]"));
      assert.equal(doc.querySelector("video")?.getAttribute("src"), null, "Server markup must defer the film source");
    }
    // The redesign (10 Nov 2026) shows the old film's poster as a still and no film.
    if (page === "story") assert.equal(doc.querySelector("video"), null, "Our Story no longer carries the film");
  }
}

test("legacy published pages preserve all 24 artwork slots and three responsive pairs", async () => {
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
      assert.equal(photos[2]?.getAttribute("src"), edited ? "/media/nimbus-room-dining.webp" : "/media/nimbus-collection/tables.webp");
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
