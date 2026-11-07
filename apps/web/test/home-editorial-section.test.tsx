import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// "Pull up a chair" (Figma 1049:27656): a square photo with a caption, beside one large photo.
const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: `https://cdn.shopify.com/s/files/1/0691/8651/9229/files/${handle}.jpg`, pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

async function renderHome(edit?: (content: typeof defaultStorefrontContent) => void) {
  const content = structuredClone(defaultStorefrontContent);
  edit?.(content);
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content });
    if (url.pathname.endsWith("/api/catalogue/cards")) return Response.json({ products: (url.searchParams.get("handles") ?? "").split(",").map(card), published: true });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
const editorial = (doc: Document) => {
  const found = doc.querySelector('[data-home-section="editorial"]');
  assert.ok(found, "the homepage has a Pull up a chair section");
  return found;
};
const source = (img: Element | null) => decodeURIComponent(img?.getAttribute("src") ?? "");

test("a square photo with its caption sits beside one large photo", async () => {
  const section = editorial(await renderHome());
  const left = section.querySelector("[data-editorial-left]")!;
  const right = section.querySelector("[data-editorial-right]")!;
  assert.ok(left && right, "two columns");
  assert.match(source(left.querySelector("img")), /\/media\/home\/editorial-left\.webp/);
  assert.equal(left.querySelector("img")!.getAttribute("alt"), "A marble dining table on a fluted pedestal beside a tall window");
  assert.match(source(right.querySelector("img")), /\/media\/home\/editorial-right\.webp/);
  assert.equal(right.querySelector("img")!.getAttribute("alt"), "A woman pouring coffee at a dining table with sunflowers, cream upholstered chairs and a pug");
  assert.equal(text(left.querySelector("[data-editorial-title]")), "Pull up a chair");
  assert.equal(left.querySelector("[data-editorial-title]")!.tagName, "H2");
  assert.equal(text(left.querySelector("[data-editorial-text]")), "There's always something worth staying for.");
  const cta = left.querySelector<HTMLAnchorElement>("[data-editorial-cta]")!;
  assert.equal(text(cta), "Shop Dining");
  assert.equal(cta.getAttribute("href"), "/collections/dinings");
  assert.equal(right.querySelector("[data-editorial-title]"), null, "the caption belongs to the square photo only");
});

test("the admin's words, links and photos are what the section shows", async () => {
  const section = editorial(await renderHome((content) => {
    content.homeDetails!.editorial = {
      title: "Stay a while", text: "Good company, good chairs.", cta: "See all dining", href: "/collections/chairs",
      leftImage: "/media/home/category-dinings.webp", leftAlt: "A dining set",
      rightImage: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/room.jpg", rightAlt: "A set table",
    };
  }));
  assert.equal(text(section.querySelector("[data-editorial-title]")), "Stay a while");
  assert.equal(text(section.querySelector("[data-editorial-text]")), "Good company, good chairs.");
  assert.equal(text(section.querySelector("[data-editorial-cta]")), "See all dining");
  assert.equal(section.querySelector("[data-editorial-cta]")!.getAttribute("href"), "/collections/chairs");
  assert.match(source(section.querySelector("[data-editorial-left] img")), /category-dinings\.webp/);
  assert.equal(section.querySelector("[data-editorial-left] img")!.getAttribute("alt"), "A dining set");
  assert.match(source(section.querySelector("[data-editorial-right] img")), /files\/room\.jpg/);
});

test("a document published before the section existed shows no new section and nothing else changes", async () => {
  const before = await renderHome();
  const older = await renderHome((content) => {
    content.homeSections = content.homeSections.filter((item) => item.key !== "editorial" && item.key !== "compare");
    delete content.homeDetails!.editorial;
    delete content.homeDetails!.compare;
  });
  assert.equal(older.querySelector('[data-home-section="editorial"]'), null);
  assert.equal(older.querySelector('[data-home-section="compare"]'), null);
  assert.deepEqual([...older.querySelectorAll("[data-home-section]")].map((node) => node.getAttribute("data-home-section")),
    [...before.querySelectorAll("[data-home-section]")].map((node) => node.getAttribute("data-home-section")).filter((key) => key !== "editorial" && key !== "compare"));
});

test("a draft that adds the section to details published earlier starts from the defaults", async () => {
  const section = editorial(await renderHome((content) => { delete content.homeDetails!.editorial; }));
  assert.equal(text(section.querySelector("[data-editorial-title]")), "Pull up a chair");
  assert.match(source(section.querySelector("[data-editorial-right] img")), /editorial-right\.webp/);
});

test("a hidden section is left out", async () => {
  const doc = await renderHome((content) => { content.homeSections = content.homeSections.map((item) => item.key === "editorial" ? { ...item, enabled: false } : item); });
  assert.equal(doc.querySelector('[data-home-section="editorial"]'), null);
});
