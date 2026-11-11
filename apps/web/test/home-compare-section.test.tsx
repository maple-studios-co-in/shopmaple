import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// "Find your feel" (Figma 1049:27656): two catalogue photos either side of a divider. It renders
// fully from the server's HTML; the divider is a CSS variable until the drag script arrives.
const card = (handle: string, image: string | null = `https://store.maplefurnishers.com/media/keeri/${handle}.webp`) => ({ id: handle, handle, title: `Chair ${handle}`, image, pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

type Options = { edit?: (content: typeof defaultStorefrontContent) => void; cards?: (handle: string) => ReturnType<typeof card> | null; failCards?: boolean };
async function renderHome({ edit, cards = (handle) => card(handle), failCards = false }: Options = {}) {
  const content = structuredClone(defaultStorefrontContent);
  edit?.(content);
  const requested: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content });
    if (url.pathname.endsWith("/api/catalogue/cards")) {
      const handles = (url.searchParams.get("handles") ?? "").split(",");
      requested.push(handles.join(","));
      if (failCards && handles.some((handle) => handle.startsWith("compare-"))) return new Response(null, { status: 500 });
      return Response.json({ products: handles.map(cards).filter(Boolean), published: true });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
    // The product rails stream in after the rest of the page (9 Nov 2026); read the finished page in one piece, as a crawler gets it.
    await stream.allReady;
    return { doc: new JSDOM(await new Response(stream).text()).window.document, requested };
  } finally {
    globalThis.fetch = previous;
  }
}
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
const source = (img: Element | null) => decodeURIComponent(img?.getAttribute("src") ?? "");
const compareSection = (doc: Document) => doc.querySelector('[data-home-section="compare"]');
/** Different handles per test: the catalogue read is cached by address. */
const handles = (tag: string) => (content: typeof defaultStorefrontContent) => {
  content.homeDetails!.compare = { ...content.homeDetails!.compare!, left: { handle: `compare-${tag}-a`, label: "Alpha" }, right: { handle: `compare-${tag}-b`, label: "Beta" } };
};

test("Find your feel shows the header and a card with the two products' catalogue photos either side of the divider", async () => {
  const { doc, requested } = await renderHome();
  const section = compareSection(doc);
  assert.ok(section, "the homepage has a Find your feel section");
  assert.equal(text(section.querySelector("[data-compare-eyebrow]")), "Find your feel");
  assert.equal(text(section.querySelector("h2")), "Two ways to unwind");
  assert.equal(text(section.querySelector("[data-compare-lede]")), "Explore distinct silhouettes and choose the one that feels at home in your space.");
  // The default's Aera lounge chair left the store with Shopify; its Keeri replacement, Avelon, is compared instead.
  assert.ok(requested.includes("avelon-chair,caro"), "both products are read in one catalogue call, as the rail does");
  const left = section.querySelector('[data-compare-pane="left"]')!;
  const right = section.querySelector('[data-compare-pane="right"]')!;
  assert.match(source(left.querySelector("img")), /keeri\/avelon-chair\.webp/);
  assert.match(source(right.querySelector("img")), /keeri\/caro\.webp/);
  assert.equal(text(left.querySelector("[data-compare-label]")), "Avelon");
  assert.equal(text(right.querySelector("[data-compare-label]")), "Caro");
});

test("the divider is a slider that starts a quarter in, the old piece on a quarter and the new on the rest, with no script needed", async () => {
  const section = compareSection((await renderHome()).doc)!;
  const card = section.querySelector<HTMLElement>("[data-compare-card]");
  assert.ok(card, "the card is drawn");
  assert.match(card.getAttribute("style") ?? "", /--compare-pos:\s*25%/);
  const grip = section.querySelector('[role="slider"]');
  assert.ok(grip, "with a slider grip");
  assert.ok(section.querySelector("[data-compare-divider]")!.contains(grip));
  assert.equal(grip.getAttribute("aria-label"), "Compare Avelon and Caro");
  assert.equal(grip.getAttribute("aria-valuemin"), "0");
  assert.equal(grip.getAttribute("aria-valuemax"), "100");
  assert.equal(grip.getAttribute("aria-valuenow"), "25");
  assert.equal(grip.querySelectorAll("[data-compare-bar]").length, 3, "three small bars");
  assert.equal(grip.hasAttribute("tabindex"), false, "nothing to tab to until the script that moves it arrives");
  assert.equal(section.querySelectorAll("script").length, 0);
});

test("the admin's header, products and labels are what the card shows", async () => {
  const { doc, requested } = await renderHome({ edit: (content) => {
    content.homeDetails!.compare = { eyebrow: "Pick one", heading: "Sit or sink", lede: "Two moods.", left: { handle: "compare-edit-a", label: "Soft" }, right: { handle: "compare-edit-b", label: "Firm" } };
  } });
  const section = compareSection(doc)!;
  assert.equal(text(section.querySelector("[data-compare-eyebrow]")), "Pick one");
  assert.equal(text(section.querySelector("h2")), "Sit or sink");
  assert.equal(text(section.querySelector("[data-compare-lede]")), "Two moods.");
  assert.ok(requested.includes("compare-edit-a,compare-edit-b"));
  assert.match(source(section.querySelector('[data-compare-pane="left"] img')), /compare-edit-a\.webp/);
  assert.equal(text(section.querySelector('[data-compare-pane="right"] [data-compare-label]')), "Firm");
  assert.equal(section.querySelector('[role="slider"]')!.getAttribute("aria-label"), "Compare Soft and Firm");
});

// Content published before 11 Nov 2026 may still name the retired Aera chair: it is compared through its Keeri
// replacement under that product's own name; a retired product without a replacement leaves no section.
test("a published side naming a retired product shows its Keeri replacement, labelled with the replacement's name", async () => {
  const { doc, requested } = await renderHome({ edit: (content) => {
    content.homeDetails!.compare = { ...content.homeDetails!.compare!, left: { handle: "aera-swivel-lounge-chair", label: "Aera" }, right: { handle: "compare-retired-r", label: "Caro" } };
  } });
  const section = compareSection(doc)!;
  assert.ok(requested.includes("avelon-chair,compare-retired-r"));
  assert.ok(!requested.some((handles) => handles.includes("aera-swivel-lounge-chair")), "the retired address is never asked for");
  assert.equal(text(section.querySelector('[data-compare-pane="left"] [data-compare-label]')), "Chair avelon-chair", "the replacement's own title, not the retired label");
  assert.equal(text(section.querySelector('[data-compare-pane="right"] [data-compare-label]')), "Caro");
  const none = await renderHome({ edit: (content) => {
    content.homeDetails!.compare = { ...content.homeDetails!.compare!, left: { handle: "loft-bench", label: "Loft" }, right: { handle: "compare-retired-b", label: "Beta" } };
  } });
  assert.equal(compareSection(none.doc)?.querySelector("[data-compare]") ?? null, null);
});

test("a product the catalogue does not have leaves no section, never a half", async () => {
  const gone = await renderHome({ edit: handles("gone"), cards: (handle) => handle.endsWith("-b") ? null : card(handle) });
  assert.equal(compareSection(gone.doc)?.querySelector("[data-compare]") ?? null, null, "no card");
  assert.equal(compareSection(gone.doc)?.textContent?.trim() ?? "", "", "and no header over nothing");
  assert.ok(gone.doc.querySelector('[data-home-section="values"]'), "the rest of the page is untouched");
});

test("a product without a photo leaves no section", async () => {
  const bare = await renderHome({ edit: handles("bare"), cards: (handle) => handle.endsWith("-a") ? card(handle, null) : card(handle) });
  assert.equal(compareSection(bare.doc)?.querySelector("[data-compare]") ?? null, null);
  assert.equal(compareSection(bare.doc)?.textContent?.trim() ?? "", "");
});

test("an unreachable catalogue leaves no section and the page still renders", async () => {
  const down = await renderHome({ edit: handles("down"), failCards: true });
  assert.equal(compareSection(down.doc)?.querySelector("[data-compare]") ?? null, null);
  assert.ok(down.doc.querySelector('[data-home-section="hero"]'));
});

test("a document published before the section existed shows no Find your feel", async () => {
  const { doc } = await renderHome({ edit: (content) => {
    content.homeSections = content.homeSections.filter((item) => item.key !== "compare");
    delete content.homeDetails!.compare;
  } });
  assert.equal(compareSection(doc), null);
});

test("a draft that adds the section to details published earlier starts from the defaults", async () => {
  const { doc } = await renderHome({ edit: (content) => { delete content.homeDetails!.compare; } });
  assert.equal(text(compareSection(doc)!.querySelector("h2")), "Two ways to unwind");
});
