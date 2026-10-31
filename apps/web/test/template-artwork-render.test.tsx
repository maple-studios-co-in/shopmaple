import assert from "node:assert/strict";
import test from "node:test";
import React, { act, Children, isValidElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import NimbusPage from "../app/pages/nimbus-collection/page";
import StoryPage from "../app/pages/our-story/page";
import { NimbusLanding } from "../components/category-nimbus";
import { StoryLanding } from "../components/category-story";
import { CategoryVideo } from "../components/category-controls";
import { NimbusSlideshow } from "../components/store/nimbus-client";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultNimbusPage } from "../lib/nimbus-content-defaults";

const files = "https://shop.maplefurnishers.com/cdn/shop/files/";
// Independent source expectations catch altered originals and incorrect key-to-slot wiring.
const slots = [
  ["home-workshop-poster", "home", "[data-hero-film] img", "/media/workshop-poster.webp", "Furniture craftsmanship at Maple"],
  ["home-hero-sofas", "home", '[data-hero-tile][href="/pages/sofas"] img', files + "engaged_5.jpg?v=1767435623", ""],
  ["home-hero-chairs", "home", '[data-hero-tile][href="/pages/chairs"] img', files + "engaged_6_1.jpg?v=1767444019", ""],
  ["home-hero-tables", "home", '[data-hero-tile][href="/pages/tables"] img', files + "engaged_8_1.jpg?v=1767444598", ""],
  ["home-hero-beds", "home", '[data-hero-tile][href="/collections/beds"] img', files + "engaged_9_1.jpg?v=1767448207", ""],
  ["home-nimbus", "home", "[data-nimbus-media] img", files + "Chairs_9.svg", "The Nimbus Collection — cloud-like upholstered furniture", files + "Chairs_300_x_600_px.webp?width=900"],
  ["home-newsletter", "home", "[data-home-newsletter] img", files + "Cover_Image_Maple_1.png", "Maple Furnishers"],
  ["home-testimonial-poster", "home", "[data-home-testimonial] video", files + "preview_images/aee33cd277cb42e7804bfce64be22297.thumbnail.0000000000.jpg?v=1778852379&width=960", "Maple customer testimonial"],
  ["nimbus-room-bedroom", "nimbus", '[data-nimbus-tiles] a[href="/collections/bedroom-nimbus"] img', files + "ChatGPT_Image_Apr_24_2026_03_29_31_AM.png", "Bedroom"],
  ["nimbus-room-living", "nimbus", '[data-nimbus-tiles] a[href="/collections/living-room-nimbus"] img', files + "Untitled_design_6.svg", "Living Room"],
  ["nimbus-room-dining", "nimbus", '[data-nimbus-tiles] a[href="/collections/dining-room-nimbus"] img', files + "Chairs.svg", "Dining Room"],
  ["nimbus-room-collection", "nimbus", '[data-nimbus-tiles] a[href="/collections/nimbus"] img', files + "Chairs_1.png", "Nimbus collection", files + "Chairs_3.png"],
  ["nimbus-origin", "nimbus", '[data-nimbus-region="origin"] img', files + "Untitled_design_35.png?height=1024&v=1779725875", "Nimbus sculptural lounge furniture"],
  ["nimbus-slide-living", "nimbus", '[data-nimbus-region="rooms-slideshow"] img', files + "livingroom.png?v=1779440214", "Living room", files + "WhatsApp_Image_2026-06-02_at_12.15.11_AM_2.jpg?v=1780342962"],
  ["nimbus-slide-bedroom", "nimbus", '[data-nimbus-region="rooms-slideshow"] img', files + "NIMBUS_bedroom.png?v=1779439068", "Bedroom", files + "bedroom.png?v=1780257906"],
  ["nimbus-slide-dining", "nimbus", '[data-nimbus-region="rooms-slideshow"] img', files + "nimbus_dinning.png?v=1779439066", "Dining room", files + "WhatsApp_Image_2026-06-02_at_12.15.11_AM.jpg?v=1780342962"],
  ["nimbus-project", "nimbus", '[data-nimbus-region="project"] > img', files + "image_7.png?v=1778317065", "Maple furniture design details"],
  ["nimbus-hero-poster", "nimbus", "[data-nimbus-page] > div > video", files + "preview_images/453715fe42df4f5fa8dc558f518b08ad.thumbnail.0000000000_small.jpg?v=1783143693", "Nimbus collection film", files + "preview_images/3b1b192f7b064d9c92271dcea887b26e.thumbnail.0000000000_small.jpg?v=1782971263"],
  ["nimbus-craft-poster", "nimbus", '[data-nimbus-region="rooms-grid"] video', files + "preview_images/a1971b26aefb4007b0261fc8f95a7b55.thumbnail.0000000000_small.jpg?v=1778316401", "Nimbus furniture craftsmanship"],
  ["story-hero", "story", "img[data-story-hero-image]", files + "Frame129.png?height=4291&v=1777318243", "Maple furniture craftsmanship"],
  ["story-film-poster", "story", "[data-story-film] video", files + "preview_images/84351f35cf124a0ab27f853cb96b817f.thumbnail.0000000000_2500x.jpg?v=1776870599", "The Maple workshop"],
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
    assert.ok(requests.every(r => r.method === "GET" && (new URL(r.url).pathname === "/api/catalogue/cards" || r.url.endsWith("/api/content/storefront"))), "Pages must only read public content and catalogue, never drafts or writes");
    assert.ok(requests.filter(r => r.url.endsWith("/api/content/storefront")).every(r => r.cache === "no-store"));
  } finally { globalThis.fetch = previous; }
}
async function documentFor(page: "home" | "nimbus" | "story") {
  const element = page === "home" ? <ShopProvider><Home /></ShopProvider> : page === "nimbus" ? await NimbusPage() : await StoryPage();
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
// The element of one Nimbus region (data-nimbus-region), to look for an island inside it.
function region(node: ReactNode, name: string): React.ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; "data-nimbus-region"?: string }>(child)) continue;
    if (child.props["data-nimbus-region"] === name) return child;
    const nested = region(child.props.children, name);
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
async function checkArtwork(edited: boolean) {
  for (const page of ["home", "nimbus", "story"] as const) {
    const doc = await documentFor(page);
    for (const [key, scope, selector, image, alt, mobile] of slots) {
      if (scope !== page || key.startsWith("nimbus-slide-")) continue;
      const node = doc.querySelector(selector)!;
      assert.ok(node, key);
      const video = node.tagName === "VIDEO";
      assert.equal(node.getAttribute(video ? "poster" : "src"), edited ? `/media/${key}.webp` : image, key);
      assert.equal(node.getAttribute(video ? "aria-label" : "alt"), edited ? `Edited ${key}` : alt, `${key} accessible description`);
      if (mobile && !video) assert.equal(node.parentElement?.querySelector("source")?.getAttribute("srcset"), edited ? `/media/${key}-small.webp` : mobile, `${key} mobile`);
    }
    if (page === "home") {
      assert.equal(doc.querySelector("[data-hero-cta]")?.textContent?.trim(), "Explore Collection");
      assert.equal(doc.querySelector("[data-hero-cta]")?.getAttribute("href"), "/pages/nimbus-collection");
      assert.equal(doc.querySelector("[data-hero-film] video")?.getAttribute("aria-label"), "Maple furniture craftsmanship");
      assert.ok(doc.querySelector('button[aria-label="Play workshop video"]'));
      assert.ok(doc.querySelector('[data-home-testimonial] video[controls] source[src$="84199271.mp4?v=0"]'));
      assert.equal(doc.querySelector("[data-home-newsletter] h2")?.textContent, "Soft presence. Strong craftsmanship.");
    }
    if (page === "nimbus") {
      assert.equal(doc.querySelector('[data-nimbus-region="intro"] h2')?.textContent, "Introducing nimbus");
      assert.equal(doc.querySelector('[data-nimbus-region="rooms-grid"] video')?.getAttribute("src"), null, "Server markup must defer the below-fold film source");
      assert.ok(doc.querySelector(`[data-nimbus-region="rooms-grid"] button[aria-label="Play ${edited ? "Edited nimbus-craft-poster" : "Nimbus furniture craftsmanship"}"]`));
    }
    if (page === "story") assert.equal(doc.querySelector('[data-story-film] video')?.getAttribute("src"), null, "Manual Story film must wait for Play");
  }
  const page = await NimbusPage();
  const tree = NimbusLanding(page.props);
  await withIsland(island(tree, NimbusSlideshow)!, false, async doc => {
    for (const [key, , , image, alt, mobile] of slots.filter(s => s[0].startsWith("nimbus-slide-"))) {
      assert.equal(doc.querySelector("img")?.getAttribute("src"), edited ? `/media/${key}.webp` : image);
      assert.equal(doc.querySelector("source")?.getAttribute("srcset"), edited ? `/media/${key}-small.webp` : mobile);
      assert.equal(doc.querySelector("img")?.getAttribute("alt"), edited ? `Edited ${key}` : alt);
      await act(async () => doc.querySelector<HTMLButtonElement>('button[aria-label="Next room"]')!.click());
    }
  });
  for (const small of [false, true]) await withIsland(island(tree, CategoryVideo)!, small, async doc => {
    const hero = slots.find(s => s[0] === "nimbus-hero-poster")!;
    assert.equal(doc.querySelector("video")?.getAttribute("poster"), edited ? `/media/nimbus-hero-poster${small ? "-small" : ""}.webp` : hero[small ? 5 : 3]);
    assert.equal(doc.querySelector("video")?.getAttribute("src"), null, "Reduced motion keeps the film unloaded before deliberate playback");
    assert.equal(doc.querySelector("button")?.getAttribute("aria-label"), `Play ${edited ? "Edited nimbus-hero-poster" : "Nimbus collection film"}`, "Reduced motion retains a user-operated play control");
    await act(async () => doc.querySelector<HTMLButtonElement>("button")!.click());
    assert.ok(doc.querySelector(`video[src$="${small ? "87921481" : "88094202"}.mp4?v=0"]`), "Deliberate playback preserves the matching source MP4");
  });
  const story = await StoryPage();
  for (const [element, suffix] of [
    [island(region(tree, "rooms-grid"), CategoryVideo), "83728678"],
    [island(StoryLanding(story.props), CategoryVideo), "82384288"],
  ] as const) {
    assert.ok(element, "Original film control exists");
    await withIsland(element, false, async doc => {
      assert.equal(doc.querySelector("video")?.getAttribute("src"), null);
      await act(async () => doc.querySelector<HTMLButtonElement>("button")!.click());
      assert.ok(doc.querySelector(`video[src$="${suffix}.mp4?v=0"]`), "Deferred film retains its original MP4");
    });
  }
}

test("legacy published pages preserve all 21 original artwork slots and six responsive pairs", async () => {
  await withPublished(published(), () => checkArtwork(false));
});

test("published artwork overrides reach all 21 slots, six responsive pairs and accessible descriptions", async () => {
  await withPublished(published(overrides()), () => checkArtwork(true));
});

test("draft-only, malformed artwork, malformed responsive pairs and unavailable content fall back to original artwork", async () => {
  for (const body of [
    { version: 10, draft: published(overrides()).content },
    published([{ key: "story-hero", image: "javascript:alert(1)", alt: "Unsafe" }]),
    published([{ key: "home-nimbus", image: "/media/incomplete.webp", alt: "Incomplete" }]),
    "offline",
  ]) await withPublished(body, () => checkArtwork(false));
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
      const tiles = [...doc.querySelectorAll("[data-nimbus-tiles] img")];
      assert.deepEqual(tiles.map(n => n.getAttribute("alt")), edited
        ? ["Edited nimbus-room-dining", "Edited nimbus-room-bedroom", "Edited nimbus-room-living", "Edited nimbus-room-collection"]
        : ["Gather here", "Rest here", "Unwind here", "Nimbus collection"]);
      assert.equal(tiles[0]?.getAttribute("src"), edited ? "/media/nimbus-room-dining.webp" : files + "Chairs.svg");
      assert.deepEqual([...doc.querySelectorAll("[data-nimbus-tiles] h3")].map(n => n.textContent), ["Gather here", "Rest here", "Unwind here"]);
      const page = await NimbusPage();
      await withIsland(island(NimbusLanding(page.props), NimbusSlideshow)!, false, async doc => {
        for (const [key, label, image] of [["dining", "Shared meals", "nimbus_dinning.png?v=1779439066"], ["living", "Slow evenings", "livingroom.png?v=1779440214"], ["bedroom", "Restful nights", "NIMBUS_bedroom.png?v=1779439068"]]) {
          assert.equal(doc.querySelector("img")?.getAttribute("alt"), edited ? `Edited nimbus-slide-${key}` : label);
          assert.equal(doc.querySelector("img")?.getAttribute("src"), edited ? `/media/nimbus-slide-${key}.webp` : files + image);
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
  media.find(item => item.key === "story-film-poster")!.alt = markup;
  await withPublished(published(media), async () => {
    const doc = await documentFor("story");
    assert.equal(doc.querySelector("img[data-story-hero-image]")?.getAttribute("alt"), markup);
    assert.equal(doc.querySelector("[data-story-film] video")?.getAttribute("aria-label"), markup);
    assert.equal(doc.querySelector("[data-story-film] button")?.getAttribute("aria-label"), `Play ${markup}`);
    assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
  });
});
