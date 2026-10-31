import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, Children, isValidElement, type ReactNode } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as nimbusRoute from "../app/pages/nimbus-collection/page";
import { NimbusLanding, MaplePromises, NimbusValues } from "../components/category-nimbus";
import { NimbusSlideshow } from "../components/store/nimbus-client";
import { defaultStorefrontContent } from "../lib/content-defaults";

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
async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const requests: { url: string; cache?: RequestCache }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, cache: init?.cache });
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ products: [], published: true });
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
  return new JSDOM(await new Response(await renderToReadableStream(await nimbusRoute.default())).text()).window.document;
}
async function metadata() {
  return "generateMetadata" in nimbusRoute
    ? await (nimbusRoute.generateMetadata as () => Promise<{ title: string }>)()
    : (nimbusRoute as unknown as { metadata: { title: string } }).metadata;
}
function regions(doc: Document) {
  // Each region carries data-nimbus-region; the hero film is the shared CategoryVideo, found by its video.
  return [...doc.querySelector("[data-nimbus-page]")!.children].map(n => n.getAttribute("data-nimbus-region") ?? (n.querySelector(":scope > video") ? "film" : n.outerHTML.slice(0, 40)));
}

test("Nimbus defaults preserve Shopify copy, element order, media and enquiry-only products", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    assert.equal(doc.querySelector("h1")?.textContent, "The Nimbus Collection");
    assert.equal(doc.querySelector('[data-nimbus-region="intro"] h2')?.textContent, "Introducing nimbus");
    assert.equal(doc.querySelector('[data-nimbus-region="intro"] p')?.textContent, "We created an atmosphere where your home breathe in shades of clouds");
    assert.match(doc.querySelector('[data-nimbus-region="origin"]')?.textContent ?? "", /cloud\.\n\nNimbus was shaped/);
    assert.equal(doc.querySelector('[data-nimbus-region="principles"] h2')?.textContent, "THE NIMBUS PRINCIPLES");
    assert.deepEqual([...doc.querySelectorAll("[data-nimbus-value] h3")].map(n => n.textContent), ["Cloud Like Comfort", "Soft Silhouettes", "Airy Luxury", "Modern Spaces"]);
    assert.deepEqual(regions(doc), ["title", "film", "intro", "rooms-grid", "divider-short", "origin", "divider", "principles", "divider", "rooms-slideshow", "series", "series-products", "project", "divider", "promises"]);
    assert.equal(doc.querySelectorAll("[data-source-product]").length, 12);
    assert.equal(doc.querySelector('[data-source-product] a[href^="/products/"]'), null);
    assert.ok(doc.querySelector('[data-source-product] a[href^="/pages/contact?product="]'));
    assert.equal((await metadata()).title, "The Nimbus Collection");
  });
});

test("published Nimbus copy renders safely with selected order and stable artwork destinations", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, nimbusPage: nimbusEdit() } }, async () => {
    const doc = await renderPage();
    assert.equal(doc.querySelector("h1")?.textContent, "Nimbus for your home");
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(doc.querySelector('[data-nimbus-region="intro"] h2')?.textContent, "Clouds at home");
    assert.equal(doc.querySelector('[data-nimbus-region="intro"] p')?.textContent, "A softer everyday.");
    assert.equal(doc.querySelector('[data-nimbus-region="origin"] [data-nimbus-eyebrow]')?.textContent, "Our beginnings");
    assert.equal(doc.querySelector('[data-nimbus-region="origin"] h2')?.textContent, "Comfort first");
    assert.match(doc.querySelector('[data-nimbus-region="origin"]')?.textContent ?? "", /<script>alert\('copy'\)<\/script>/);
    assert.equal(doc.querySelector("script"), null);
    assert.equal(doc.querySelector('[data-nimbus-region="principles"] h2')?.textContent, "What matters");
    assert.equal(doc.querySelector("[data-nimbus-value] h3")?.textContent, "Room to live");
    assert.equal(doc.querySelector("[data-nimbus-value] p")?.textContent, "Space for you.");
    assert.match(doc.querySelector("[data-nimbus-value] img")?.getAttribute("src") ?? "", /Maple_Banner_12\.svg/);
    assert.equal(doc.querySelector('[data-nimbus-region="series"] p')?.textContent, "Our collection");
    assert.equal(doc.querySelector('[data-nimbus-region="series"] h2')?.textContent, "Explore the series");
    assert.equal(doc.querySelector('[data-nimbus-region="project"] h2')?.textContent, "Tell us your plans");
    assert.equal(doc.querySelector('[data-nimbus-region="project"] p')?.textContent, "We are here to help.");
    assert.equal(doc.querySelector('[data-nimbus-region="promises"] span')?.textContent, "Our assurance");
    assert.match(doc.querySelector('[data-nimbus-region="promises"] img')?.getAttribute("src") ?? "", /Maple_Banner_5\.svg/);
    const tiles = [...doc.querySelectorAll("[data-nimbus-tiles] a")];
    assert.deepEqual(tiles.map(n => n.getAttribute("href")), ["/collections/dining-room-nimbus", "/collections/bedroom-nimbus", "/collections/living-room-nimbus", "/collections/nimbus"]);
    assert.deepEqual(tiles.map(n => n.querySelector("h3")?.textContent), ["Gather here", "Rest here", "Unwind here", undefined]);
    assert.deepEqual(tiles.map(n => n.querySelector("img")?.getAttribute("src")?.split("/").at(-1)), ["Chairs.svg", "ChatGPT_Image_Apr_24_2026_03_29_31_AM.png", "Untitled_design_6.svg", "Chairs_1.png"]);
    assert.match(tiles[3]!.querySelector("source")?.getAttribute("srcset") ?? "", /Chairs_3\.png/);
    assert.deepEqual(regions(doc), ["title", "project", "intro", "divider-short", "origin", "divider", "principles", "rooms-grid", "divider", "rooms-slideshow", "divider", "promises", "series", "series-products"]);
    assert.equal((await metadata()).title, "Nimbus for your home");
  });
});

test("hiding all Nimbus regions retains its accessible heading without orphan dividers or products", async () => {
  const nimbusPage = nimbusEdit();
  nimbusPage.sections = nimbusPage.sections.map(s => ({ ...s, enabled: false }));
  await withResponse({ version: 3, content: { ...defaultStorefrontContent, nimbusPage } }, async () => {
    const doc = await renderPage();
    assert.deepEqual(regions(doc), ["title"]);
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
      assert.equal(doc.querySelectorAll("[data-nimbus-tiles] a").length, 4);
      assert.equal((await metadata()).title, "The Nimbus Collection");
    });
  const shared = new JSDOM(renderToStaticMarkup(<MaplePromises />)).window.document;
  assert.deepEqual([...shared.querySelectorAll("li span")].map(n => n.textContent), ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"]);
});

function slideshow(node: ReactNode): React.ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === NimbusSlideshow) return child;
    const nested = slideshow(child.props.children);
    if (nested) return nested;
  }
}

test("reordered renamed Nimbus rooms keep each desktop/mobile pair through carousel navigation", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, nimbusPage: nimbusEdit() } }, async () => {
    const page = await nimbusRoute.default();
    const island = slideshow((NimbusLanding as (props: unknown) => React.ReactElement)(page.props));
    assert.ok(island);
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.getElementById("root")!);
    try {
      await act(async () => root.render(island));
      for (const [label, desktop, mobile] of [
        ["Shared meals", "nimbus_dinning.png", "WhatsApp_Image_2026-06-02_at_12.15.11_AM.jpg"],
        ["Slow evenings", "livingroom.png", "WhatsApp_Image_2026-06-02_at_12.15.11_AM_2.jpg"],
        ["Restful nights", "NIMBUS_bedroom.png", "bedroom.png"],
      ]) {
        assert.equal(document.querySelector("picture img")?.getAttribute("alt"), label);
        assert.equal(new URL(document.querySelector("picture img")!.getAttribute("src")!).pathname.split("/").at(-1), desktop);
        assert.equal(new URL(document.querySelector("picture source")!.getAttribute("srcset")!).pathname.split("/").at(-1), mobile);
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
  const render = () => <><NimbusSlideshow slides={slides} /><NimbusValues items={values} /></>;
  try {
    await act(async () => root.render(render()));
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Show Living room"]')!;
    const value = document.querySelector("[data-nimbus-value]");
    button.focus();
    slides[0]!.alt = "A quiet room";
    values[0]!.title = "Cloud comfort";
    await act(async () => root.render(render()));
    assert.equal(document.activeElement, button, "Editing a room label must retain focused carousel control");
    assert.equal(button.getAttribute("aria-label"), "Show A quiet room");
    assert.equal(document.querySelector("[data-nimbus-value]"), value, "Editing a principle title must retain its element identity");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
