import assert from "node:assert/strict";
import { shown } from "./support/rendered-src";
import { cardFixture } from "./support/catalogue-fixtures";
import test from "node:test";
import React, { act, Children, isValidElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import NimbusPage from "../app/nimbus-collection/page";
import StoryPage from "../app/our-story/page";
import { NimbusLanding } from "../components/category-nimbus";
import { StoryLanding } from "../components/category-story";
import { NimbusWithArtwork, StoryWithArtwork } from "../components/artwork-pages";
import { CategorySlideshow, CategoryVideo } from "../components/category-controls";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultNimbusPage } from "../lib/nimbus-content-defaults";
import { templateMediaResponsiveKeys } from "@shopmaple/contracts";

/** Each listed Keeri product's own photo, as the catalogue's cards carry it. */
const photo = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle}.webp`;
// Independent expectations catch altered originals and incorrect key-to-slot wiring. The originals first published on
// Shopify left the store (owner, 11 Nov 2026): such a slot shows its Keeri stand-in product's photo (desktop and mobile
// alike), or, with none, nothing (`null`) until staff upload artwork. The films are stills now.
const slots = [
  ["home-workshop-poster", "home", ".hero-film [data-hero-slide] img", photo("arbor-sofa"), "Maple furniture"],
  ["home-hero-sofas", "home", '.category-tile[href="/sofas"] img', "/media/home/hero-sofas.webp", ""],
  ["home-hero-chairs", "home", '.category-tile[href="/chairs"] img', "/media/home/hero-chairs.webp", ""],
  ["home-hero-tables", "home", '.category-tile[href="/tables"] img', "/media/home/hero-tables.webp", ""],
  ["home-hero-beds", "home", '.category-tile[href="/collections/beds"] img', "/media/home/hero-beds.webp", ""],
  ["home-nimbus", "home", ".nimbus-stage-media img", "/media/home/nimbus-clouds.webp", "The Nimbus Collection — cloud-like upholstered furniture", "/media/home/nimbus-clouds.webp"],
  ["home-newsletter", "home", ".home-newsletter img", null, "Maple Furnishers"],
  ["home-testimonial-poster", "home", ".home-testimonial img", null, "Maple customer testimonial"],
  ["nimbus-room-bedroom", "nimbus", '.landing-nimbus-tiles a[href="/collections/bedroom-nimbus"] img', photo("elara-bed"), "Bedroom", photo("elara-bed")],
  ["nimbus-room-living", "nimbus", '.landing-nimbus-tiles a[href="/collections/living-room-nimbus"] img', photo("alpine"), "Living Room", photo("alpine")],
  ["nimbus-room-dining", "nimbus", '.landing-nimbus-tiles a[href="/collections/dining-room-nimbus"] img', photo("radiance-table"), "Dining Room", photo("radiance-table")],
  ["nimbus-room-collection", "nimbus", '.landing-nimbus-tiles a[href="/collections/nimbus"] img', photo("virelle-chair"), "Nimbus collection", photo("virelle-chair")],
  ["nimbus-origin", "nimbus", ".landing-nimbus-origin img", photo("virelle"), "Nimbus sculptural lounge furniture"],
  ["nimbus-slide-living", "nimbus", ".landing-slideshow img", photo("aurevo"), "Living room", photo("aurevo")],
  ["nimbus-slide-bedroom", "nimbus", ".landing-slideshow img", photo("altura-table"), "Bedroom", photo("altura-table")],
  ["nimbus-slide-dining", "nimbus", ".landing-slideshow img", photo("meridian-table"), "Dining room", photo("meridian-table")],
  ["nimbus-project", "nimbus", ".landing-project > img", photo("mela"), "Maple furniture design details"],
  ["nimbus-hero-poster", "nimbus", ".landing-nimbus-hero img", photo("geometric-grotto"), "The Nimbus collection", "mobile-if-uploaded"],
  ["nimbus-craft-poster", "nimbus", ".landing-nimbus-bento > [data-nimbus-still] img", photo("aether-table"), "Nimbus furniture craftsmanship"],
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
function island(node: ReactNode, component: unknown, className?: string): React.ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) continue;
    if (child.type === component && (className === undefined || (child.props.className ?? "") === className)) return child;
    const nested = island(child.props.children, component, className);
    if (nested) return nested;
  }
}
async function withIsland(element: React.ReactElement, small: boolean, run: (doc: Document) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const values = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, values);
  Object.defineProperty(dom.window, "matchMedia", { value: (query: string) => ({ matches: query.includes("reduced-motion") || small, addEventListener() {}, removeEventListener() {} }) });
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLMediaElement) { paused.set(this, false); this.dispatchEvent(new dom.window.Event("play")); return Promise.resolve(); } },
    pause: { value(this: HTMLMediaElement) { paused.set(this, true); this.dispatchEvent(new dom.window.Event("pause")); } },
  });
  const root = createRoot(document.getElementById("root")!);
  try { await act(async () => root.render(element)); await run(document); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
}
/** Sections a fresh homepage keeps hidden (it closes on the values); their artwork is checked wherever a document shows them. */
const hiddenByDefault = new Set(["home-newsletter", "home-testimonial-poster"]);
async function nimbusTree() {
  const landing = await (NimbusWithArtwork as (props: unknown) => Promise<React.ReactElement>)((await NimbusPage()).props);
  return (NimbusLanding as (props: unknown) => React.ReactElement)(landing.props);
}
async function checkArtwork(edited: boolean, fallback = false) {
  for (const page of ["home", "nimbus", "story"] as const) {
    const doc = await documentFor(page);
    for (const [key, scope, selector, image, alt, mobile] of slots) {
      if (scope !== page || key.startsWith("nimbus-slide-")) continue;
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
      else if (mobile) assert.equal(source, mobile === "mobile-if-uploaded" ? null : mobile, `${key} mobile`);
    }
    // No film anywhere: they were Shopify files, and films cannot be uploaded yet.
    assert.equal(doc.querySelector("video"), null, `${page} draws no film`);
    if (page === "home") {
      assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Explore Collection");
      assert.equal(doc.querySelector(".hero-cta")?.getAttribute("href"), "/nimbus-collection");
      assert.equal(doc.querySelector(".hero-film button:not([data-slider-dot])"), null, "no video control (the dots are slide buttons)");
      if (!fallback || doc.querySelector(".home-newsletter")) assert.equal(doc.querySelector(".home-newsletter h2")?.textContent, "Soft presence. Strong craftsmanship.");
    }
    if (page === "nimbus") assert.equal(doc.querySelector(".landing-nimbus-intro h2")?.textContent, "Introducing nimbus");
  }
  const tree = await nimbusTree();
  await withIsland(island(tree, CategorySlideshow)!, false, async doc => {
    for (const [key, , , image, alt, mobile] of slots.filter(s => s[0].startsWith("nimbus-slide-"))) {
      assert.equal(shown(doc.querySelector("img")?.getAttribute("src")), edited ? `/media/${key}.webp` : image);
      assert.equal(doc.querySelector("source")?.getAttribute("srcset"), edited ? `/media/${key}-small.webp` : mobile);
      assert.equal(doc.querySelector("img")?.getAttribute("alt"), edited ? `Edited ${key}` : alt);
      await act(async () => doc.querySelector<HTMLButtonElement>('button[aria-label="Next room"]')!.click());
    }
  });
  assert.equal(island(tree, CategoryVideo), undefined, "the Nimbus page draws no film control");
  const story = await (StoryWithArtwork as (props: unknown) => Promise<React.ReactElement>)((await StoryPage()).props);
  assert.equal(island((StoryLanding as (props: unknown) => React.ReactElement)(story.props), CategoryVideo), undefined, "Our Story draws no film control");
}

test("legacy published pages show every bundled original, Keeri stand-ins for the former Shopify artwork, and nothing else", async () => {
  await withPublished(published(), () => checkArtwork(false));
});

test("published artwork overrides reach all 28 slots, six responsive pairs and accessible descriptions", async () => {
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

test("renamed and reordered Nimbus rooms keep dynamic default descriptions and keyed overrides", async () => {
  for (const edited of [false, true]) {
    const body = published(edited ? overrides() : undefined);
    body.content.nimbusPage = structuredClone(defaultNimbusPage);
    body.content.nimbusPage.roomTiles = [
      { key: "dining", title: "Gather here" }, { key: "bedroom", title: "Rest here" }, { key: "living", title: "Unwind here" },
    ];
    body.content.nimbusPage.roomSlides = [
      { key: "dining", label: "Shared meals" }, { key: "living", label: "Slow evenings" }, { key: "bedroom", label: "Restful nights" },
    ];
    await withPublished(body, async () => {
      const doc = await documentFor("nimbus");
      const tiles = [...doc.querySelectorAll(".landing-nimbus-tiles img")];
      assert.deepEqual(tiles.map(n => n.getAttribute("alt")), edited
        ? ["Edited nimbus-room-dining", "Edited nimbus-room-bedroom", "Edited nimbus-room-living", "Edited nimbus-room-collection"]
        : ["Gather here", "Rest here", "Unwind here", "Nimbus collection"]);
      assert.equal(shown(tiles[0]?.getAttribute("src")), edited ? "/media/nimbus-room-dining.webp" : photo("radiance-table"));
      assert.deepEqual([...doc.querySelectorAll(".landing-nimbus-tiles h3")].map(n => n.textContent), ["Gather here", "Rest here", "Unwind here"]);
      await withIsland(island(await nimbusTree(), CategorySlideshow)!, false, async doc => {
        for (const [key, label, product] of [["dining", "Shared meals", "meridian-table"], ["living", "Slow evenings", "aurevo"], ["bedroom", "Restful nights", "altura-table"]]) {
          assert.equal(doc.querySelector("img")?.getAttribute("alt"), edited ? `Edited nimbus-slide-${key}` : label);
          assert.equal(shown(doc.querySelector("img")?.getAttribute("src")), edited ? `/media/nimbus-slide-${key}.webp` : photo(product!));
          await act(async () => doc.querySelector<HTMLButtonElement>('button[aria-label="Next room"]')!.click());
        }
      });
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
