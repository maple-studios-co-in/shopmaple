import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React, { act, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { storefrontContentSchema, type CollectionLandingContent } from "@shopmaple/contracts";
import NimbusPage from "../app/nimbus-collection/page";
import { CollectionLandingView } from "../components/collection-landing";
import type { CollectionLanding } from "../lib/collection-landing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { renderStorefrontRoute } from "../lib/storefront-routes";
import { installUiDom } from "./support/ui-dom";

// The Nimbus Collection page from Figma 311:548 "Maple / Nimbus Collection / Desktop" (owner, 10 Nov 2026), drawn by the
// collection template it shares with Terra (311:921), between the store's own header and footer.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(node => node.textContent?.trim());
const hrefs = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(node => node.getAttribute("href"));
const regions = (doc: Document) => [...doc.querySelectorAll("[data-collection-section]")].map(node => node.getAttribute("data-collection-section"));
const region = (doc: Document, key: string) => doc.querySelector<HTMLElement>(`[data-collection-section="${key}"]`)!;

// The edit's eight real pieces, in the design's order: the Keeri products that replaced its Shopify listings.
const pieces = [
  "cloudblock", "virelle-chair", "avelon-table", "aileron",
  "nova-chair", "meridian-console", "aileron-bench", "elara-bed",
];
const liveName = (handle: string) => `Live ${handle}`;
const liveImage = (handle: string) => `https://store.maplefurnishers.com/media/keeri/live-${handle}.webp`;
const card = (handle: string) => ({
  id: handle, handle, title: liveName(handle), image: liveImage(handle), pricePaise: 1234500, compareAtPaise: null,
  priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[], optionThumbs: [] as never[],
});

let fixtureId = 0;
async function fixture(run: (requests: URL[]) => Promise<void>, options: { content?: unknown; missing?: string[]; unavailable?: boolean } = {}) {
  const previousFetch = globalThis.fetch;
  const previousApi = process.env.API_URL;
  process.env.API_URL = `http://nimbus-page-${++fixtureId}.test`;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/api/content/storefront")
      return options.content === undefined ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json({ version: 3, content: options.content });
    if (url.pathname === "/api/catalogue/cards") {
      if (options.unavailable) return new Response(null, { status: 503 });
      const handles = url.searchParams.get("handles")!.split(",");
      return Response.json({ products: handles.filter(handle => !options.missing?.includes(handle)).map(card), published: true });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  try { await run(requests); } finally {
    globalThis.fetch = previousFetch;
    if (previousApi === undefined) delete process.env.API_URL; else process.env.API_URL = previousApi;
  }
}
async function documentFor(node: ReactNode) {
  const stream = await renderToReadableStream(<>{node}</>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  await stream.allReady;
  return new JSDOM(await new Response(stream).text()).window.document;
}
const renderPage = async () => documentFor(await NimbusPage());
const published = (nimbusPage: unknown, extra: Record<string, unknown> = {}) => ({ ...structuredClone(defaultStorefrontContent), nimbusPage, ...extra });

/** The design's words and links, as the page reads when nothing was changed. */
function assertDesign(doc: Document) {
  assert.deepEqual(regions(doc), ["hero", "room-nav", "philosophy", "origin", "feeling", "material", "browse", "pieces", "consultation", "promise"]);
  assert.equal(doc.querySelectorAll("h1").length, 1);
  const hero = region(doc, "hero");
  assert.equal(hero.querySelector("h1")?.textContent, "A softer way\nto come home.");
  assert.equal(hero.querySelector("[data-collection-eyebrow]")?.textContent, "Maple collections / Nimbus");
  assert.equal(hero.querySelector("[data-collection-body]")?.textContent, "Cloud-like comfort, softly sculpted\nfor the spaces you call your own.");
  const discover = hero.querySelector<HTMLAnchorElement>("a[data-collection-cta]")!;
  assert.equal(discover.textContent?.replace("→", "").trim(), "Discover Nimbus");
  assert.equal(discover.getAttribute("href"), "#nimbus-pieces", "the button glides to the edit");
  assert.ok(doc.getElementById("nimbus-pieces"), "the edit carries the anchor");
  // No film link: Nimbus's films were Shopify files, and films cannot be uploaded yet (owner, 11 Nov 2026).
  assert.equal(hero.querySelector("[data-collection-film]"), null);

  const rooms = region(doc, "room-nav");
  assert.equal(rooms.tagName, "NAV");
  assert.deepEqual(texts(rooms, "a").map(text => text?.replace(/\s+/g, " ")), ["01 Living", "02 Dining", "03 Bedroom"]);
  assert.deepEqual(hrefs(rooms, "a"), ["/collections/living-room-nimbus", "/collections/dining-room-nimbus", "/collections/bedroom-nimbus"]);

  const philosophy = region(doc, "philosophy");
  assert.equal(philosophy.querySelector("[data-collection-eyebrow]")?.textContent, "The Nimbus point of view");
  assert.equal(philosophy.querySelector("h2")?.textContent, "Comfort is\nthe starting point.");
  assert.equal(philosophy.querySelector("[data-collection-body]")?.textContent, "Soft forms. Pale textures. Comfort that feels like coming home.");

  const origin = region(doc, "origin");
  assert.equal(origin.querySelector("[data-collection-eyebrow]")?.textContent, "Origin / Nimbus");
  assert.equal(origin.querySelector("h2")?.textContent, "It began with\nthe feeling of a cloud.");
  assert.equal(origin.querySelector("[data-collection-body]")?.textContent, "Inspired by clouds. Shaped for comfort. Made to let your home breathe.");

  const feeling = region(doc, "feeling");
  assert.equal(feeling.querySelector("[data-collection-eyebrow]")?.textContent, "How it feels");
  assert.equal(feeling.querySelector("h2")?.textContent, "Soft. Airy. Weightless.");
  assert.deepEqual(texts(feeling, "h3"), ["Cloud-like comfort", "Room to breathe", "Quiet luxury"]);
  assert.deepEqual(texts(feeling, "li p"), ["Sink in. Stay awhile.", "Light, open, effortless.", "Refined in every detail."]);
  assert.equal(feeling.querySelectorAll("li svg").length, 3, "an icon on each card");

  const material = region(doc, "material");
  assert.equal(material.querySelector("[data-collection-eyebrow]")?.textContent, "The details you live with");
  assert.equal(material.querySelector("h2")?.textContent, "Softness,\nin every detail.");
  assert.equal(material.querySelector("[data-collection-body]")?.textContent, "Choose your fabric, finish and fit.");
  assert.deepEqual(texts(material, "li"), ["Inviting upholstery", "Soft silhouettes", "Airy neutrals"]);
  const customise = material.querySelector<HTMLAnchorElement>("a[data-collection-cta]")!;
  assert.equal(customise.textContent?.replace("→", "").trim(), "Explore customization");
  assert.equal(customise.getAttribute("href"), "/contact?product=Nimbus+customization#contact-enquiry");

  const browse = region(doc, "browse");
  assert.equal(browse.querySelector("[data-collection-eyebrow]")?.textContent, "Find your piece");
  assert.equal(browse.querySelector("h2")?.textContent, "Explore by collection.");
  assert.deepEqual(texts(browse, "h3"), ["Sofas & sectionals", "Accent chairs", "Tables & consoles", "Beds & benches"]);
  assert.deepEqual(hrefs(browse, "h3 a"), ["/collections/sofas", "/collections/accent-chair", "/collections/tables", "/collections/beds"]);
  assert.deepEqual(texts(browse, "[data-collection-link]"), Array(4).fill("Discover the collection"));

  const edit = region(doc, "pieces");
  assert.equal(edit.getAttribute("data-mode"), "products");
  assert.equal(edit.querySelector("[data-collection-eyebrow]")?.textContent, "The Nimbus edit");
  assert.equal(edit.querySelector("h2")?.textContent, "Pieces to build your world around.");
  // The cards are the catalogue's (the page draws none it cannot read); each keeps the line saved for its place.
  const shown = edit.querySelectorAll("[data-collection-piece]").length;
  assert.deepEqual(texts(edit, "[data-collection-piece] [data-collection-line]"), [
    "Living / Sectional seating", "Living / Accent seating", "Living / Centre tables", "Bedroom / Beds",
    "Living / Lounge chairs", "Storage / Consoles", "Bedroom / Benches", "Bedroom / Upholstered beds",
  ].slice(0, shown));
  assert.deepEqual(texts(edit, "[data-collection-piece] [data-collection-link]"), Array(shown).fill("View piece →"));
  const all = edit.querySelector<HTMLAnchorElement>("a[data-collection-cta]")!;
  assert.equal(all.textContent?.replace("→", "").trim(), "View the Nimbus collection");
  assert.equal(all.getAttribute("href"), "/collections/nimbus");

  const consultation = region(doc, "consultation");
  assert.equal(consultation.querySelector("[data-collection-eyebrow]")?.textContent, "Make it unmistakably yours");
  assert.equal(consultation.querySelector("h2")?.textContent, "Your home.\nYour kind of Nimbus.");
  assert.equal(consultation.querySelector("[data-collection-body]")?.textContent, "Tell us about your room, your preferred materials and the way you want it to feel.");
  const talk = consultation.querySelector<HTMLAnchorElement>("a[data-collection-cta]")!;
  assert.equal(talk.textContent?.replace("→", "").trim(), "Start a conversation");
  assert.equal(talk.getAttribute("href"), "/contact?product=The+Nimbus+Collection#contact-enquiry");
  assert.equal(consultation.querySelector("[data-collection-note]")?.textContent, "Custom sizes · Fabrics · Finishes");

  assert.deepEqual(texts(region(doc, "promise"), "li"), ["Made around you", "Crafted in Delhi", "Delivery across India"]);
}

test("the Nimbus page draws Figma 311:548's ten regions with the design's words and the store's own links", async () => {
  await fixture(async requests => {
    const doc = await renderPage();
    assertDesign(doc);
    // The edit reads the live catalogue once, for exactly its eight pieces, in order.
    assert.deepEqual(requests.filter(url => url.pathname === "/api/catalogue/cards").map(url => url.searchParams.get("handles")), [pieces.join(",")]);
    const edit = region(doc, "pieces");
    assert.deepEqual(texts(edit, "[data-collection-piece] h3"), pieces.map(liveName), "each card is the real product's name");
    assert.deepEqual(hrefs(edit, "[data-collection-piece] h3 a"), pieces.map(handle => `/products/${handle}`));
    const photos = [...edit.querySelectorAll<HTMLImageElement>("[data-collection-piece] img")];
    assert.equal(photos.length, 8);
    photos.forEach((photo, index) => {
      assert.match(photo.getAttribute("src") ?? "", new RegExp(`live-${pieces[index]}\\.webp`), "the product's own photo");
      assert.equal(photo.getAttribute("alt"), liveName(pieces[index]!));
    });
    // The store's email from the footer's customer care settings, not the frame's.
    const email = region(doc, "consultation").querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!;
    assert.equal(email.getAttribute("href"), "mailto:contact@maplefurnishers.com");
    assert.equal(email.textContent, "contact@maplefurnishers.com");
    // Photos are the page's template artwork, described for screen readers.
    for (const [key, file] of [["hero", "hero"], ["origin", "origin"], ["material", "detail"]] as const) {
      const photo = region(doc, key).querySelector<HTMLImageElement>("img")!;
      assert.match(photo.getAttribute("src") ?? "", new RegExp(`nimbus-collection%2F${file}\\.webp|nimbus-collection/${file}\\.webp`), key);
      assert.ok((photo.getAttribute("alt") ?? "").length > 20, `${key} photo is described`);
    }
    const cards = [...region(doc, "browse").querySelectorAll<HTMLImageElement>("img")];
    assert.deepEqual(cards.map(photo => (photo.getAttribute("src") ?? "").match(/nimbus-collection(?:%2F|\/)([a-z-]+)\.webp/)?.[1]), ["sofas", "accent-chairs", "tables", "beds"]);
    assert.ok(cards.every(photo => (photo.getAttribute("alt") ?? "").length > 20));
    assert.equal(doc.querySelector('a[href^="/pages/"]'), null);
  });
});

test("the store's published original Nimbus copy reads as the redesign, while words staff wrote stay", async () => {
  // The live store published the original template's copy unchanged.
  const original = structuredClone(defaultStorefrontContent).nimbusPage;
  const legacy = {
    title: "The Nimbus Collection",
    sections: ["hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises"].map(key => ({ key, enabled: true })),
    intro: { heading: "Introducing nimbus", body: "We created an atmosphere where your home breathe in shades of clouds" },
    roomTiles: [{ key: "bedroom", title: "Bedroom" }, { key: "living", title: "Living Room" }, { key: "dining", title: "Dining Room" }],
    origin: {
      eyebrow: "Origin & Philosophy", heading: "Nimbus",
      body: "Every collection at Maple begins with a question. For Nimbus, that question was a simple one: what would furniture feel like if comfort were the starting point rather than something added on at the end? The answer arrived the way the best ideas tend to, quietly and completely, and it looked like the inside of a cloud.\n\nNimbus was shaped by watching how people actually inhabit their spaces. The searching for a room that breathes. The relief of a chair that does not demand a particular posture. The slow pleasure of a sofa that improves with use rather than declining from the day it arrives. These are not decorating ambitions. They are the way a well-considered home actually feels, and that feeling is what every piece in the Nimbus range was designed to create.",
    },
    principles: {
      heading: "THE NIMBUS PRINCIPLES",
      items: [
        { key: "comfort", title: "Cloud Like Comfort", body: "Where nature begins the story — raw, real, and rooted in beauty." },
        { key: "silhouettes", title: "Soft Silhouettes", body: "Precision that defines perfection. Every line, intentional." },
        { key: "luxury", title: "Airy Luxury", body: "Softness you can feel before you even touch it." },
        { key: "spaces", title: "Modern Spaces", body: "The quiet glow of craftsmanship perfected." },
      ],
    },
    roomSlides: [{ key: "living", label: "Living room" }, { key: "bedroom", label: "Bedroom" }, { key: "dining", label: "Dining room" }],
    series: { eyebrow: "Inspired by floating forms and quiet modern living.", heading: "Nimbus Series" },
    project: { heading: "If the project sounds good", body: "Whether you have a question about our products, custom orders, or collaborations — our team is here to help." },
    promises: [
      { key: "custom", title: "Fully Customizable" }, { key: "delivery", title: "Delivery Across India" },
      { key: "craft", title: "In-House Crafted in Delhi" }, { key: "warranty", title: "36-Month Warranty" },
    ],
  };
  assert.notDeepEqual(original, legacy, "the starting draft is the redesign's copy, no longer the original template's");
  assert.equal(storefrontContentSchema.safeParse(published(legacy)).success, true, "older revisions still validate");
  await fixture(async () => assertDesign(await renderPage()), { content: published(legacy) });

  // Words staff wrote in the original template carry over to the region that took its place; its hidden regions stay hidden.
  const edited = structuredClone(legacy);
  edited.intro.heading = "Cloud comfort";
  edited.roomTiles[1]!.title = "Lounge";
  edited.origin.body = "Shaped by how people live.";
  edited.principles.items[0]!.title = "Sink-in comfort";
  edited.series.heading = "Explore Nimbus";
  edited.project.body = "Tell us about your project.";
  edited.promises[0]!.title = "Made to measure";
  edited.sections.find(section => section.key === "principles")!.enabled = false;
  await fixture(async () => {
    const doc = await renderPage();
    assert.deepEqual(regions(doc), ["hero", "room-nav", "philosophy", "origin", "material", "browse", "pieces", "consultation", "promise"]);
    assert.equal(region(doc, "philosophy").querySelector("h2")?.textContent, "Cloud comfort");
    assert.equal(region(doc, "philosophy").querySelector("[data-collection-body]")?.textContent, "Soft forms. Pale textures. Comfort that feels like coming home.");
    assert.deepEqual(texts(region(doc, "room-nav"), "a").map(text => text?.replace(/\s+/g, " ")), ["01 Lounge", "02 Dining", "03 Bedroom"]);
    assert.equal(region(doc, "origin").querySelector("[data-collection-body]")?.textContent, "Shaped by how people live.");
    assert.equal(region(doc, "origin").querySelector("h2")?.textContent, "It began with\nthe feeling of a cloud.");
    assert.equal(region(doc, "pieces").querySelector("h2")?.textContent, "Explore Nimbus");
    assert.equal(region(doc, "consultation").querySelector("[data-collection-body]")?.textContent, "Tell us about your project.");
    assert.deepEqual(texts(region(doc, "promise"), "li"), ["Made to measure", "Crafted in Delhi", "Delivery across India"]);
  }, { content: published(edited) });
});

test("staff choose the redesign's words, order and visibility; a hidden edit reads no catalogue", async () => {
  const page = structuredClone(defaultStorefrontContent.nimbusPage) as CollectionLandingContent;
  assert.ok("hero" in page, "the starting draft is the redesign's copy");
  page.hero.heading = "Softly,\nhome.";
  page.feeling.items[1]!.title = "Space to breathe";
  page.pieces.items[0]!.line = "Living / Modular seating";
  page.sections = [
    { key: "promise", enabled: true }, { key: "hero", enabled: false }, ...page.sections.filter(item => !["promise", "hero"].includes(item.key)),
  ];
  page.sections.find(item => item.key === "pieces")!.enabled = false;
  assert.equal(storefrontContentSchema.safeParse(published(page)).success, true);
  await fixture(async requests => {
    const doc = await renderPage();
    assert.deepEqual(regions(doc), ["promise", "room-nav", "philosophy", "origin", "feeling", "material", "browse", "consultation"]);
    assert.equal(requests.filter(url => url.pathname === "/api/catalogue/cards").length, 0);
    // With the hero hidden the page keeps one heading for screen readers.
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(doc.querySelector("h1")?.textContent, "The Nimbus Collection");
    assert.equal(doc.querySelector("h1")?.className, "sr-only");
    assert.equal(texts(region(doc, "feeling"), "h3")[1], "Space to breathe");
  }, { content: published(page) });
  page.sections.find(item => item.key === "pieces")!.enabled = true;
  page.sections.find(item => item.key === "hero")!.enabled = true;
  await fixture(async () => {
    const doc = await renderPage();
    assert.equal(doc.querySelector("h1")?.textContent, "Softly,\nhome.");
    assert.equal(texts(region(doc, "pieces"), "[data-collection-line]")[0], "Living / Modular seating");
  }, { content: published(page) });
});

test("a piece the live catalogue no longer lists is left out, the others keep their lines; an outage shows no cards", async () => {
  await fixture(async () => {
    const edit = region(await renderPage(), "pieces");
    const kept = pieces.filter(handle => handle !== "avelon-table");
    assert.deepEqual(hrefs(edit, "[data-collection-piece] h3 a"), kept.map(handle => `/products/${handle}`));
    assert.equal(texts(edit, "[data-collection-piece] [data-collection-line]")[2], "Bedroom / Beds", "each card keeps its own line");
  }, { missing: ["avelon-table"] });
  await fixture(async () => {
    const edit = region(await renderPage(), "pieces");
    assert.equal(edit.querySelectorAll("[data-collection-piece]").length, 0, "no saved names or photos stand in for the catalogue");
    assert.equal(edit.querySelector("a[data-collection-cta]")?.getAttribute("href"), "/collections/nimbus");
  }, { unavailable: true });
});

test("the staff preview renders the draft's Nimbus page through the same template", async () => {
  const page = structuredClone(defaultStorefrontContent.nimbusPage) as CollectionLandingContent;
  page.title = "Nimbus, previewed";
  page.origin.heading = "A draft origin";
  const route = renderStorefrontRoute(["pages", "nimbus-collection"], published(page) as typeof defaultStorefrontContent)!;
  assert.equal(route.title, "Nimbus, previewed");
  assert.equal(route.path, "/nimbus-collection");
  await fixture(async () => {
    const doc = await documentFor(route.node);
    assert.equal(region(doc, "origin").querySelector("h2")?.textContent, "A draft origin");
  });
});

/** A page in the template's other modes, as Terra uses it: three settings and four concepts to discuss. */
const media = (name: string) => ({ src: `/media/test/${name}.webp`, alt: `${name} photo` });
const terraLike: CollectionLanding = {
  key: "terra", title: "The Terra Collection",
  sections: ["hero", "room-nav", "rooms", "pieces"],
  hero: { eyebrow: "Maple collections / Terra", heading: "Grounded in earth.\nMade for belonging.", body: "Warm materials.", cta: { label: "Explore Terra", href: "#terra-rooms" }, media: media("hero") },
  roomNav: [{ label: "The lobby", href: "#terra-lobby" }, { label: "The bedroom", href: "#terra-bedroom" }, { label: "The terrace", href: "#terra-terrace" }],
  philosophy: { eyebrow: "e", heading: "h", body: "b" },
  origin: { eyebrow: "e", heading: "h", body: "b", media: media("origin") },
  rooms: {
    eyebrow: "Explore the collection", heading: "Three spaces. One grounded spirit.",
    items: ["lobby", "bedroom", "terrace"].map(name => ({
      id: `terra-${name}`, label: `The ${name}`, heading: `Room ${name}`, body: "A line.", tags: ["Walnut", "Travertine"],
      cta: { label: "Enquire about this setting", href: `/contact?product=Terra+${name}` }, media: media(name),
    })),
  },
  feeling: { eyebrow: "e", heading: "h", items: [] },
  material: { eyebrow: "e", heading: "h", body: "b", media: media("detail"), notes: [], cta: { label: "c", href: "/contact" } },
  browse: { eyebrow: "e", heading: "h", linkLabel: "Discover the collection", items: [] },
  pieces: {
    mode: "concepts", eyebrow: "The Terra edit", heading: "Bring the room together.", lead: "Terra-inspired furniture concepts. Made to your brief.",
    linkLabel: "Discuss this piece",
    items: ["Curved lounge sofa", "Timber-ring lounge chair", "Low leather bed", "Woven terrace chair"].map(title => ({
      title, line: "Lobby / Seating", href: `/contact?product=${encodeURIComponent(title)}`, media: media(title.split(" ")[0]!.toLowerCase()),
    })),
  },
  consultation: { eyebrow: "e", heading: "h", body: "b", cta: { label: "c", href: "/contact" }, note: "n", email: "hello@example.test" },
  promise: [],
};

test("the shared template draws Terra's settings and concept cards from the same type", async () => {
  const doc = await documentFor(<CollectionLandingView page={terraLike} />);
  assert.equal(doc.querySelector("[data-collection]")?.getAttribute("data-collection"), "terra");
  assert.deepEqual(regions(doc), ["hero", "room-nav", "rooms", "pieces"]);
  assert.equal(doc.querySelector("[data-collection-film]"), null, "no film, no film link");
  assert.deepEqual(hrefs(region(doc, "room-nav"), "a"), ["#terra-lobby", "#terra-bedroom", "#terra-terrace"]);
  const rooms = region(doc, "rooms");
  assert.deepEqual([...rooms.querySelectorAll("[data-collection-room]")].map(room => room.id), ["terra-lobby", "terra-bedroom", "terra-terrace"]);
  assert.deepEqual(texts(rooms, "[data-collection-room] [data-collection-eyebrow]").map(text => text?.replace(/\s+/g, " ")), ["01 / The lobby", "02 / The bedroom", "03 / The terrace"]);
  assert.deepEqual(texts(rooms, "h3"), ["Room lobby", "Room bedroom", "Room terrace"]);
  assert.deepEqual(texts(rooms, "[data-collection-tags]").map(text => text?.replace(/\s+/g, " ")), Array(3).fill("Walnut / Travertine"));
  assert.deepEqual(hrefs(rooms, "a[data-collection-cta]"), ["/contact?product=Terra+lobby", "/contact?product=Terra+bedroom", "/contact?product=Terra+terrace"]);
  const edit = region(doc, "pieces");
  assert.equal(edit.getAttribute("data-mode"), "concepts");
  assert.equal(edit.querySelector("[data-collection-lead]")?.textContent, "Terra-inspired furniture concepts. Made to your brief.");
  assert.deepEqual(texts(edit, "[data-collection-piece] [data-collection-link]"), Array(4).fill("Discuss this piece →"));
  assert.deepEqual(hrefs(edit, "[data-collection-piece] h3 a")[0], "/contact?product=Curved%20lounge%20sofa");
  assert.equal(edit.querySelector("a[data-collection-cta]"), null, "no collection button for concepts");
});

test("the film opens over the page with the browser's controls and gives focus back when it closes", async () => {
  const dom = installUiDom("http://localhost:3000/nimbus-collection");
  const proto = dom.window.HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>;
  proto.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  proto.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new dom.window.Event("close")); };
  const played: string[] = [];
  dom.window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) { played.push(this.getAttribute("src") ?? ""); return Promise.resolve(); };
  dom.window.HTMLMediaElement.prototype.pause = function pause() {};
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const { CollectionFilm } = await import("../components/collection-landing-client");
  try {
    await act(async () => root.render(<CollectionFilm film={{ label: "Watch collection film", duration: "00:25", title: "The Nimbus collection film", src: "/film.mp4", poster: "/poster.jpg" }} />));
    const open = container.querySelector<HTMLButtonElement>("button[data-collection-film]")!;
    const dialog = container.querySelector("dialog")!;
    assert.equal(dialog.hasAttribute("open"), false);
    open.focus();
    await act(async () => open.click());
    assert.equal(dialog.hasAttribute("open"), true);
    assert.equal(dialog.getAttribute("aria-label"), "The Nimbus collection film");
    const video = dialog.querySelector("video")!;
    assert.equal(video.hasAttribute("controls"), true);
    assert.deepEqual(played, ["/film.mp4"], "it starts when opened");
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="Close the film"]')!.click());
    assert.equal(dialog.hasAttribute("open"), false);
    assert.equal(dom.window.document.activeElement, open);
  } finally { await act(async () => root.unmount()); }
});

test("the template's styles load wherever the page renders, scale from the 1440 design and respect reduced motion", () => {
  const css = read("../styles/collection-landing.css");
  assert.match(css, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /--collection-maple: #80241c;/);
  assert.match(css, /object-fit: cover;/);
  assert.match(css, /clamp\([^)]*5\.556vw[^)]*\)/, "the hero heading scales as 80px at 1440");
  assert.match(read("../app/nimbus-collection/layout.tsx"), /import "@\/styles\/collection-landing\.css";/);
  assert.match(read("../app/admin/preview-frame/[...page]/page.tsx"), /import "@\/styles\/collection-landing\.css";/);
});

/** A WebP file's own size, from its header. */
function webpSize(path: string) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 0, 4) + bytes.toString("ascii", 8, 12), "RIFFWEBP", path);
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  assert.equal(chunk, "VP8X", path);
  return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
}

test("the Nimbus photos are WebP files big enough to stay sharp at 1920, at 125% zoom and on a phone", () => {
  // At least 1.5 times the largest size each is drawn at: the hero 1920px wide, the cards about 1050px on a phone.
  const wants: Record<string, [number, number]> = {
    "hero.webp": [2880, 1500], "origin.webp": [1575, 1230], "detail.webp": [1575, 1400],
    "sofas.webp": [1575, 880], "beds.webp": [1575, 880], "accent-chairs.webp": [1575, 1475], "tables.webp": [1575, 1475],
  };
  for (const [file, [width, height]] of Object.entries(wants)) {
    const size = webpSize(fileURLToPath(new URL(`../public/media/nimbus-collection/${file}`, import.meta.url)));
    assert.ok(size.width >= width && size.height >= height, `${file} is ${size.width}x${size.height}, wants ${width}x${height}`);
  }
  // The phone's portrait crop: a device pixel per pixel on a 390 by 844 phone at three times.
  const phone = webpSize(fileURLToPath(new URL("../public/media/nimbus-collection/hero-mobile.webp", import.meta.url)));
  assert.ok(phone.width >= 1170 && phone.height > phone.width * 1.5, `hero-mobile.webp is ${phone.width}x${phone.height}`);
  assert.match(read("../public/media/PROVENANCE.md"), /## Nimbus Collection[\s\S]*nimbus-collection\/hero\.webp/);
});
