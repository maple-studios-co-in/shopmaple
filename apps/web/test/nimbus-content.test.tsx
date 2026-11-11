import assert from "node:assert/strict";
import { shown } from "./support/rendered-src";
import { cardFixture } from "./support/catalogue-fixtures";
import { test } from "node:test";
import React, { act, Children, isValidElement, type ReactNode } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as nimbusRoute from "../app/nimbus-collection/page";
import { NimbusLanding, MaplePromises } from "../components/category-nimbus";
import { NimbusWithArtwork } from "../components/artwork-pages";
import { CategorySlideshow } from "../components/category-controls";
import { CategoryValues } from "../components/category-landing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { ShopProvider } from "../components/shop-provider";

const nimbusEdit = () => ({
  title: "Nimbus for your home",
  sections: [
    { key: "project", enabled: true }, { key: "intro", enabled: true },
    { key: "origin", enabled: true }, { key: "principles", enabled: true },
    { key: "rooms-grid", enabled: true }, { key: "rooms-slideshow", enabled: true },
    { key: "promises", enabled: true }, { key: "series", enabled: true },
    { key: "hero", enabled: false },
  ],
  intro: { heading: "Clouds at home", body: "A softer everyday." },
  roomTiles: [
    { key: "dining", title: "Gather here" }, { key: "bedroom", title: "Rest here" },
    { key: "living", title: "Unwind here" },
  ],
  origin: { eyebrow: "Our beginnings", heading: "Comfort first", body: "<script>alert('copy')</script> Built for life." },
  principles: { heading: "What matters", items: [
    { key: "spaces", title: "Room to live", body: "Space for you." },
    { key: "luxury", title: "Quiet detail", body: "Considered details." },
    { key: "comfort", title: "Rest easy", body: "Made for comfort." },
    { key: "silhouettes", title: "Soft forms", body: "Gentle shapes." },
  ] },
  roomSlides: [
    { key: "dining", label: "Shared meals" }, { key: "living", label: "Slow evenings" },
    { key: "bedroom", label: "Restful nights" },
  ],
  series: { eyebrow: "Our collection", heading: "Explore the series" },
  project: { heading: "Tell us your plans", body: "We are here to help." },
  promises: [
    { key: "warranty", title: "Our assurance" }, { key: "craft", title: "Our workshop" },
    { key: "delivery", title: "At your door" }, { key: "custom", title: "Made for you" },
  ],
});
/** Each listed Keeri product's own photo, as the catalogue's cards carry it. */
const photo = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle}.webp`;
async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const requests: { url: string; cache?: RequestCache }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, cache: init?.cache });
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ published: true,
      products: (new URL(url).searchParams.get("handles") ?? "").split(",").map(handle => ({ ...cardFixture(handle), image: photo(handle) })) });
    if (!url.endsWith("/api/content/storefront")) throw new Error("Unexpected endpoint");
    if (body === "offline") throw new Error("offline");
    return body === null ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json(body);
  };
  try {
    await run();
    assert.ok(requests.every(r => new URL(r.url).pathname === "/api/catalogue/cards" || r.url.endsWith("/api/content/storefront")), "Public page must never read an admin or draft endpoint");
    assert.ok(requests.filter(r => r.url.endsWith("/api/content/storefront")).every(r => r.cache === "no-store"));
  } finally { globalThis.fetch = previous; }
}
async function renderPage() {
  // The series rail draws real product cards now (no fallback cards), which read the shop's cart context.
  return new JSDOM(await new Response(await renderToReadableStream(<ShopProvider>{await nimbusRoute.default()}</ShopProvider>)).text()).window.document;
}
async function metadata() {
  return "generateMetadata" in nimbusRoute
    ? await (nimbusRoute.generateMetadata as () => Promise<{ title: string }>)()
    : (nimbusRoute as unknown as { metadata: { title: string } }).metadata;
}
function regions(doc: Document) {
  return [...doc.querySelector(".landing-nimbus")!.children].map(n => n.className);
}

test("Nimbus defaults keep their copy and element order, with Keeri photos for the artwork and only listed products", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    assert.equal(doc.querySelector("h1")?.textContent, "The Nimbus Collection");
    assert.equal(doc.querySelector(".landing-nimbus-intro h2")?.textContent, "Introducing nimbus");
    assert.equal(doc.querySelector(".landing-nimbus-intro p")?.textContent, "We created an atmosphere where your home breathe in shades of clouds");
    assert.match(doc.querySelector(".landing-nimbus-origin")?.textContent ?? "", /cloud\.\n\nNimbus was shaped/);
    assert.equal(doc.querySelector(".landing-nimbus-principles h2")?.textContent, "THE NIMBUS PRINCIPLES");
    assert.deepEqual([...doc.querySelectorAll(".landing-values h3")].map(n => n.textContent), ["Cloud Like Comfort", "Soft Silhouettes", "Airy Luxury", "Modern Spaces"]);
    // The films were on Shopify: the hero and the rooms grid's large tile are stills of Keeri products.
    assert.deepEqual(regions(doc), ["sr-only", "landing-video landing-still landing-nimbus-hero", "landing-nimbus-intro home-container", "landing-nimbus-bento", "landing-media-content landing-nimbus-origin", "landing-nimbus-principles", "landing-slideshow", "landing-series home-container", "landing-products home-products home-container", "landing-project home-container", "landing-promises home-container"]);
    assert.equal(doc.querySelector("video"), null);
    assert.equal(shown(doc.querySelector(".landing-nimbus-hero img")?.getAttribute("src")), photo("geometric-grotto"));
    assert.equal(shown(doc.querySelector(".landing-nimbus-bento > [data-nimbus-still] img")?.getAttribute("src")), photo("aether-table"));
    assert.equal(shown(doc.querySelector(".landing-nimbus-origin img")?.getAttribute("src")), photo("virelle"));
    assert.equal(shown(doc.querySelector(".landing-project img")?.getAttribute("src")), photo("mela"));
    assert.equal(doc.querySelector(".landing-values img"), null, "the principles' icons were Shopify files");
    assert.equal(doc.querySelector(".landing-promises img"), null, "the promises' icons were Shopify files");
    assert.equal(doc.querySelectorAll(".landing-source-product").length, 0, "no fallback cards");
    assert.equal(doc.querySelectorAll(".landing-products [data-card-name]").length, 12, "the twelve series pieces, now Keeri products");
    assert.ok(doc.querySelector('.landing-products [data-card-name][href="/products/avelon"]'), "a retired series piece's Keeri replacement (aeris-living-room-set → avelon)");
    assert.equal((await metadata()).title, "The Nimbus Collection");
  });
});

test("published Nimbus copy renders safely with selected order and stable artwork destinations", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, nimbusPage: nimbusEdit() } }, async () => {
    const doc = await renderPage();
    assert.equal(doc.querySelector("h1")?.textContent, "Nimbus for your home");
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(doc.querySelector(".landing-nimbus-intro h2")?.textContent, "Clouds at home");
    assert.equal(doc.querySelector(".landing-nimbus-intro p")?.textContent, "A softer everyday.");
    assert.equal(doc.querySelector(".landing-nimbus-origin .home-eyebrow")?.textContent, "Our beginnings");
    assert.equal(doc.querySelector(".landing-nimbus-origin h2")?.textContent, "Comfort first");
    assert.match(doc.querySelector(".landing-nimbus-origin")?.textContent ?? "", /<script>alert\('copy'\)<\/script>/);
    assert.equal(doc.querySelector("script"), null);
    assert.equal(doc.querySelector(".landing-nimbus-principles h2")?.textContent, "What matters");
    assert.equal(doc.querySelector(".landing-values h3")?.textContent, "Room to live");
    assert.equal(doc.querySelector(".landing-values p")?.textContent, "Space for you.");
    assert.equal(doc.querySelector(".landing-values img"), null);
    assert.equal(doc.querySelector(".landing-series p")?.textContent, "Our collection");
    assert.equal(doc.querySelector(".landing-series h2")?.textContent, "Explore the series");
    assert.equal(doc.querySelector(".landing-project h2")?.textContent, "Tell us your plans");
    assert.equal(doc.querySelector(".landing-project p")?.textContent, "We are here to help.");
    assert.equal(doc.querySelector(".landing-promises span")?.textContent, "Our assurance");
    assert.equal(doc.querySelector(".landing-promises img"), null);
    const tiles = [...doc.querySelectorAll(".landing-nimbus-tiles a")];
    assert.deepEqual(tiles.map(n => n.getAttribute("href")), ["/collections/dining-room-nimbus", "/collections/bedroom-nimbus", "/collections/living-room-nimbus", "/collections/nimbus"]);
    assert.deepEqual(tiles.map(n => n.querySelector("h3")?.textContent), ["Gather here", "Rest here", "Unwind here", undefined]);
    // Each room tile shows a Keeri Nimbus product's photo until staff upload their own.
    assert.deepEqual(tiles.map(n => shown(n.querySelector("img")?.getAttribute("src"))), ["radiance-table", "elara-bed", "alpine", "virelle-chair"].map(photo));
    assert.deepEqual(regions(doc), ["sr-only", "landing-project home-container", "landing-nimbus-intro home-container", "landing-media-content landing-nimbus-origin", "landing-nimbus-principles", "landing-nimbus-bento", "landing-slideshow", "landing-promises home-container", "landing-series home-container", "landing-products home-products home-container"]);
    assert.equal((await metadata()).title, "Nimbus for your home");
  });
});

test("hiding all Nimbus regions retains its accessible heading without orphan dividers or products", async () => {
  const nimbusPage = nimbusEdit();
  nimbusPage.sections = nimbusPage.sections.map(s => ({ ...s, enabled: false }));
  await withResponse({ version: 3, content: { ...defaultStorefrontContent, nimbusPage } }, async () => {
    const doc = await renderPage();
    assert.deepEqual(regions(doc), ["sr-only"]);
    assert.equal(doc.querySelector("h1")?.textContent, "Nimbus for your home");
    assert.equal(doc.querySelectorAll("h1").length, 1);
  });
});

test("legacy, draft, malformed and unavailable public content retain Nimbus source defaults", async () => {
  const legacy = { ...defaultStorefrontContent } as Record<string, unknown>;
  delete legacy.nimbusPage;
  for (const body of [{ version: 3, content: legacy }, { version: 3, draft: { ...legacy, nimbusPage: nimbusEdit() } }, { version: 3, content: { ...legacy, nimbusPage: { title: "Malformed" } } }, "offline"])
    await withResponse(body, async () => {
      const doc = await renderPage();
      assert.equal(doc.querySelector("h1")?.textContent, "The Nimbus Collection");
      assert.equal(doc.querySelectorAll(".landing-nimbus-tiles a").length, 4);
      assert.equal((await metadata()).title, "The Nimbus Collection");
    });
  const shared = new JSDOM(renderToStaticMarkup(<MaplePromises />)).window.document;
  assert.deepEqual([...shared.querySelectorAll("li span")].map(n => n.textContent), ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"]);
});

function slideshow(node: ReactNode): React.ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === CategorySlideshow) return child;
    const nested = slideshow(child.props.children);
    if (nested) return nested;
  }
}

test("reordered renamed Nimbus rooms keep each desktop/mobile pair through carousel navigation", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, nimbusPage: nimbusEdit() } }, async () => {
    const page = await nimbusRoute.default();
    const landing = await (NimbusWithArtwork as (props: unknown) => Promise<React.ReactElement>)(page.props);
    const island = slideshow((NimbusLanding as (props: unknown) => React.ReactElement)(landing.props));
    assert.ok(island);
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.getElementById("root")!);
    try {
      await act(async () => root.render(island));
      // Each room's Keeri stand-in photo serves both crops until staff upload a desktop and a mobile picture.
      for (const [label, product] of [["Shared meals", "meridian-table"], ["Slow evenings", "aurevo"], ["Restful nights", "altura-table"]]) {
        assert.equal(document.querySelector("picture img")?.getAttribute("alt"), label);
        assert.equal(shown(document.querySelector("picture img")!.getAttribute("src")!), photo(product!));
        assert.equal(shown(document.querySelector("picture source")!.getAttribute("srcset")!), photo(product!));
        await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Next room"]')!.click());
      }
    } finally { await act(async () => root.unmount()); dom.window.close(); }
  });
});

test("stable slideshow and principle keys preserve element identity when labels change", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  const slides = [{ key: "living", desktop: "/living.png", mobile: "/living-small.png", alt: "Living room" }];
  const values = [{ key: "comfort", image: "/comfort.svg", title: "Comfort", body: "Rest easy" }];
  const render = () => <><CategorySlideshow slides={slides} /><CategoryValues items={values} /></>;
  try {
    await act(async () => root.render(render()));
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Show Living room"]')!;
    const value = document.querySelector(".landing-values > div");
    button.focus();
    slides[0]!.alt = "A quiet room";
    values[0]!.title = "Cloud comfort";
    await act(async () => root.render(render()));
    assert.equal(document.activeElement, button, "Editing a room label must retain focused carousel control");
    assert.equal(button.getAttribute("aria-label"), "Show A quiet room");
    assert.equal(document.querySelector(".landing-values > div"), value, "Editing a principle title must retain its element identity");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
