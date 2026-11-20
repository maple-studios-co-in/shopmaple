import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { collectionHeroKeys, collectionHeroPages, storefrontContentSchema, templateMediaItemSchema, type TemplateMedia } from "@shopmaple/contracts";
import { collectionTitles } from "@shopmaple/contracts/catalogue-registry";
import { CollectionBanner, type CollectionCover } from "../components/store/collection-banner";
import { ShopProvider } from "../components/shop-provider";
import { collectionIntro, heroTitle } from "../lib/collection-intro";
import { resolveTemplateMedia, templateMediaSlots } from "../lib/template-media-defaults";
import { defaultStorefrontContent } from "../lib/content-defaults";
import landingCategories from "../data/landing-categories.json";

// Owner, 20 Nov 2026: on the collection pages (the sub-categories under Sofas, Chairs, Tables, TV & Media, Beds and so on,
// the pages with the filters) "the hero banner needs to have size and padding exactly like the banner" of the category
// pages: hide the full-width dark hero and show that banner instead. These tests hold the banner to that frame and shape
// and to what it draws, with or without a picture staff chose on the Artwork screen.

const cover: CollectionCover = { image: "https://store.maplefurnishers.com/media/keeri/aster-bed.webp", title: "Aster Bed", handle: "aster-bed", pricePaise: 18500000 };
const upload = `/api/admin/media/${"a".repeat(64)}/preview`;
const phone = `/api/admin/media/${"b".repeat(64)}/preview`;
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
const draw = (props: Partial<React.ComponentProps<typeof CollectionBanner>>) => new JSDOM(renderToStaticMarkup(
  <CollectionBanner title={heroTitle("chairs", "Chairs")} crumb="Chairs" intro={collectionIntro("chairs")} cover={cover} slot="collection-hero-chairs" {...props} />,
)).window.document;
const css = readFileSync(new URL("../styles/collection-parity.css", import.meta.url), "utf8").replace(/\r/g, "");

test("every collection page has a banner placement, named as the catalogue names the collection", () => {
  assert.deepEqual(collectionHeroPages.map(([handle]) => handle).sort(), Object.keys(collectionTitles).sort(), "a collection added to the catalogue needs its banner placement too");
  for (const [handle, title] of collectionHeroPages) assert.equal(title, collectionTitles[handle], handle);
  assert.equal(collectionHeroKeys.length, collectionHeroPages.length);
  assert.ok(collectionHeroKeys.includes("collection-hero-recliners") && collectionHeroKeys.includes("collection-hero-beds") && collectionHeroKeys.includes("collection-hero-all"));
});

test("the banner takes the category pages' inset banner frame and shape: their margins, corners and spacing, 2784 x 400, square on phones", () => {
  const doc = draw({});
  const frame = doc.querySelector<HTMLElement>("[data-landing-banner]")!;
  assert.equal(frame.getAttribute("data-landing-banner"), "inset", "the frame of the category pages' banners between their rails");
  assert.deepEqual([...frame.classList], ["landing-banner-frame", "home-container"], "their side margins, 30px above and below and 12px corners");
  assert.equal(frame.firstElementChild?.matches("section.collection-banner[data-collection-banner]"), true, "the banner is the frame's only piece, so the corners round it");
  // The category pages' inset banners are all 2784 x 400 pictures (data/landing-categories.json), drawn at their own shape.
  const shapes = new Set(Object.values(landingCategories).flatMap((page) => (page as { sections: { type: string; width?: number; height?: number }[] }).sections
    .filter((section) => section.type === "banner" && section.width === 2784).map((section) => `${section.width}x${section.height}`)));
  assert.deepEqual([...shapes], ["2784x400"]);
  assert.match(css, /\.collection-banner \{[^}]*aspect-ratio: 2784 \/ 400;/, "the same shape: 1360 x 195 at 1440px");
  assert.match(css, /@media \(max-width: 768px\) \{\s*\.collection-banner \{ aspect-ratio: 1; \}/, "square on phones, as theirs are");
  assert.equal(doc.querySelector("[data-collection-hero]"), null, "the full-width dark hero is gone");
});

test("until staff choose a picture, the banner writes the trail, the collection's name and its line over its first product photo", () => {
  const doc = draw({});
  const banner = doc.querySelector<HTMLElement>("[data-collection-banner]")!;
  assert.equal(banner.getAttribute("data-collection-banner"), "words");
  assert.equal(banner.getAttribute("data-banner-photo"), "piece");
  assert.deepEqual([...banner.querySelectorAll("nav[aria-label=Breadcrumb] li")].map(text), ["Home", "/", "Collections", "/", "Chairs"]);
  assert.deepEqual([...banner.querySelectorAll("nav[aria-label=Breadcrumb] a")].map((link) => link.getAttribute("href")), ["/", "/collections/all"]);
  assert.equal(text(banner.querySelector("h1")), "Dining & Accent Chairs", "the page's heading, the frame's own title for chairs");
  assert.equal(banner.getAttribute("aria-labelledby"), banner.querySelector("h1")?.id);
  assert.equal(text(banner.querySelector("[data-banner-line]")), "Made for long conversations.");
  const photo = banner.querySelector(".collection-banner-photo")!;
  assert.equal(photo.getAttribute("data-media-slot"), "collection-hero-chairs", "the live preview swaps a chosen picture in here");
  assert.match(decodeURIComponent(photo.querySelector("img")?.getAttribute("src") ?? ""), /aster-bed/);
  assert.equal(banner.querySelector("[data-featured-product]"), null, "no featured card: the banner is 195px tall");
});

test("an empty collection's banner is Maple's burgundy with the strip's rosette, and still opens its placement", () => {
  const doc = draw({ cover: null, title: "Recliners", crumb: "Recliners", intro: collectionIntro(null), slot: "collection-hero-recliners" });
  const banner = doc.querySelector<HTMLElement>("[data-collection-banner]")!;
  assert.equal(banner.getAttribute("data-banner-photo"), "none");
  assert.ok(banner.querySelector("svg.collection-banner-rosette[aria-hidden=true]"));
  assert.equal(banner.querySelector("img"), null);
  assert.equal(banner.getAttribute("data-media-slot-area"), "collection-hero-recliners", "a click anywhere on it opens its picture's chooser");
  assert.equal(text(banner.querySelector("h1")), "Recliners");
  assert.equal(text(banner.querySelector("[data-banner-line]")), "Made to be lived with.");
});

test("a chosen picture is the whole banner with its own words, its phone picture on phones; the page title stays the heading", () => {
  const doc = draw({ picture: { image: upload, mobileImage: phone, alt: "Recliners: up to 30% off", display: "banner" } });
  const banner = doc.querySelector<HTMLElement>("[data-collection-banner]")!;
  assert.equal(banner.getAttribute("data-collection-banner"), "banner");
  assert.equal(banner.querySelector(".collection-banner-copy"), null, "no words written over a finished banner");
  const picture = banner.querySelector("picture.collection-banner-picture")!;
  assert.equal(picture.getAttribute("data-media-slot"), "collection-hero-chairs");
  assert.equal(picture.querySelector("source")?.getAttribute("media"), "(max-width: 768px)");
  assert.equal(picture.querySelector("source")?.getAttribute("srcset"), phone, "phones load the square phone picture");
  assert.equal(picture.querySelector("img")?.getAttribute("src"), upload);
  assert.equal(picture.querySelector("img")?.getAttribute("alt"), "Recliners: up to 30% off", "the banner's words, for screen readers");
  const heading = banner.querySelector("h1")!;
  assert.equal(text(heading), "Dining & Accent Chairs");
  assert.match(heading.getAttribute("class") ?? "", /\bsr-only\b/, "still the page's heading, for search engines and screen readers");
  const wide = draw({ picture: { image: upload, alt: "", display: "banner" } });
  assert.equal(wide.querySelector("picture source"), null, "without a phone picture, phones show the wide one cropped square");
});

test("a chosen photo can show behind the collection's name and line instead", () => {
  const doc = draw({ picture: { image: upload, alt: "", display: "photo" } });
  const banner = doc.querySelector<HTMLElement>("[data-collection-banner]")!;
  assert.equal(banner.getAttribute("data-collection-banner"), "words");
  assert.equal(banner.getAttribute("data-banner-photo"), "chosen");
  const photo = banner.querySelector(".collection-banner-photo")!;
  assert.equal(photo.getAttribute("data-media-slot"), "collection-hero-chairs");
  assert.equal(photo.querySelector("img")?.getAttribute("src"), upload);
  assert.doesNotMatch(banner.querySelector("h1")?.getAttribute("class") ?? "", /sr-only/);
  assert.equal(text(banner.querySelector("h1")), "Dining & Accent Chairs");
});

test("the Artwork screen lists every collection banner and says what shows meanwhile; only a banner takes a phone picture and a display", () => {
  const banners = templateMediaSlots.filter((slot) => slot.group === "Collection pages");
  assert.equal(banners.length, collectionHeroPages.length);
  const recliners = banners.find((slot) => slot.key === "collection-hero-recliners")!;
  assert.equal(recliners.label, "Recliners (/collections/recliners)");
  assert.equal(recliners.standIn, "the collection's name and line on Maple's burgundy, over its first product photo");
  assert.match(recliners.help ?? "", /2784 × 400/);
  assert.deepEqual(Object.keys(resolveTemplateMedia("collection-hero-recliners")).sort(), ["alt", "image", "key"], "staff-facing notes never reach the draft");
  const item = { key: "collection-hero-recliners" as const, image: `/media/uploads/${"a".repeat(64)}.webp`, alt: "" };
  for (const value of [item, { ...item, mobileImage: `/media/uploads/${"b".repeat(64)}.webp` }, { ...item, display: "photo" as const }, { ...item, display: "banner" as const }])
    assert.equal(templateMediaItemSchema.safeParse(value).success, true, JSON.stringify(value));
  assert.equal(templateMediaItemSchema.safeParse({ ...item, display: "strip" }).success, false);
  assert.equal(templateMediaItemSchema.safeParse({ key: "home-newsletter", image: item.image, alt: "x", display: "banner" }).success, false, "other placements say nothing of how they show");
  assert.equal(templateMediaItemSchema.safeParse({ key: "home-newsletter", image: item.image, alt: "x", mobileImage: item.image }).success, false, "and keep their one picture");
  assert.equal(templateMediaItemSchema.safeParse({ key: "sofas-outdoor-banner", image: item.image, alt: "x" }).success, false, "the category pages' banners still need both");
  const content = { ...structuredClone(defaultStorefrontContent), templateMedia: [{ ...item, display: "photo" as const }] };
  assert.ok(storefrontContentSchema.safeParse(content).success, "a banner photo may go without a description: the page writes the collection's name over it");
});

test("the collection page opens with the banner, drawn from the draft's picture, in place of the dark hero", async () => {
  const previousFetch = globalThis.fetch;
  const templateMedia: TemplateMedia = [{ key: "collection-hero-recliners", image: `/media/uploads/${"a".repeat(64)}.webp`, alt: "Recliners", display: "banner" }];
  const content = { ...structuredClone(defaultStorefrontContent), templateMedia };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/api/content/storefront")) return Response.json({ version: 12, content });
    assert.match(url.pathname, /^\/api\/catalogue\/collections\/[a-z0-9-]+$/);
    return Response.json({
      handle: url.pathname.split("/").at(-1), query: { q: "", sort: "title", availability: "", min: "", max: "", category: "", page: 1 },
      products: [], total: 0, collectionTotal: 0, inStock: 0, outOfStock: 0, highestPrice: null, limit: 24, published: true, mode: "preview", checkoutEnabled: false,
    });
  };
  try {
    const { default: Collection } = await import("../app/collections/[handle]/page");
    const page = async (handle: string) => new JSDOM(await new Response(await renderToReadableStream(
      <ShopProvider>{await Collection({ params: Promise.resolve({ handle }), searchParams: Promise.resolve({}) })}</ShopProvider>,
    )).text()).window.document;
    const recliners = await page("recliners");
    const banner = recliners.querySelector("[data-collection-banner]")!;
    assert.ok(banner, "the banner opens the page");
    assert.equal(recliners.querySelectorAll("[data-collection-banner]").length, 1);
    assert.equal(banner.getAttribute("data-collection-banner"), "banner", "the published picture, as the whole banner");
    assert.match(decodeURIComponent(banner.querySelector("img")?.getAttribute("src") ?? ""), new RegExp("a".repeat(64)));
    assert.equal(text(recliners.querySelector("h1")), "Recliners", "one heading for the page");
    assert.equal(recliners.querySelectorAll("h1").length, 1);
    const fabric = await page("fabric-sofas");
    assert.equal(fabric.querySelector("[data-collection-banner]")?.getAttribute("data-collection-banner"), "words", "a page without a picture writes its name");
    assert.equal(text(fabric.querySelector("[data-collection-banner] h1")), "Fabric Sofas");
  } finally { globalThis.fetch = previousFetch; }
});

test("staff choose each banner's phone picture and how it shows on the Artwork screen", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const { ArtworkSlots } = await import("../components/admin/template-artwork-fields");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  let latest: TemplateMedia | undefined;
  function Host() {
    const [value, setValue] = React.useState<TemplateMedia | undefined>(undefined);
    latest = value;
    return <ArtworkSlots keys={["collection-hero-recliners"]} value={value} onChange={(next) => { latest = next; setValue(next); }}
      session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} onExpired={() => assert.fail("Unexpected expiry")} />;
  }
  const field = <T extends HTMLElement>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`);
  const type = (label: string, value: string) => act(async () => {
    const input = field<HTMLInputElement>(label)!;
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  try {
    await act(async () => root.render(<Host />));
    assert.match(container.textContent ?? "", /2784 × 400 px/);
    assert.match(container.textContent ?? "", /Phone \(optional\)/);
    const display = field<HTMLSelectElement>("How the banner shows the picture")!;
    assert.equal(display.disabled, true, "nothing to show yet");
    await type("Desktop image URL", `/media/uploads/${"a".repeat(64)}.webp`);
    await type("Mobile image URL", `/media/uploads/${"b".repeat(64)}.webp`);
    assert.equal(field<HTMLSelectElement>("How the banner shows the picture")!.disabled, false);
    assert.equal(field<HTMLSelectElement>("How the banner shows the picture")!.value, "banner", "a picture shows whole until staff say otherwise");
    await act(async () => {
      const select = field<HTMLSelectElement>("How the banner shows the picture")!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(select, "photo");
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.deepEqual(latest, [{ key: "collection-hero-recliners", image: `/media/uploads/${"a".repeat(64)}.webp`, mobileImage: `/media/uploads/${"b".repeat(64)}.webp`, alt: "", display: "photo" }]);
    await type("Mobile image URL", "");
    assert.equal("mobileImage" in latest![0]!, false, "a cleared phone picture is no phone picture");
    assert.equal(storefrontContentSchema.safeParse({ ...structuredClone(defaultStorefrontContent), templateMedia: latest }).success, true);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
