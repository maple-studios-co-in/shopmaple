import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

async function renderHome() {
  const content = structuredClone(defaultStorefrontContent);
  content.homeSections = ["hero", "difference", "categories", "ticker", "offers", "nimbus", "bestsellers", "testimonial", "newsletter", "values", "project"]
    .map((key) => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, autoplayTicker: false, revealSections: false };
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/content/storefront")) return Response.json({ version: 7, content });
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ published: true, products: [{
      id: "aera", handle: "aera-swivel-lounge-chair", title: "Aera lounge chair", image: null,
      pricePaise: 2360000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1,
    }] });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally { globalThis.fetch = previous; }
}

test("every homepage section is rebuilt markup in a display:contents wrapper the section builder can measure", async () => {
  const doc = await renderHome();
  const wrappers = [...doc.querySelectorAll("[data-home-section]")];
  assert.equal(wrappers.length, 11);
  for (const wrapper of wrappers) {
    assert.ok(wrapper.classList.contains("contents"), `${wrapper.getAttribute("data-home-section")} wrapper is display: contents`);
    assert.ok(wrapper.firstElementChild?.hasAttribute("data-store"), `${wrapper.getAttribute("data-home-section")} draws rebuilt markup`);
  }
});

test("hero, difference and categories follow the design", async () => {
  const doc = await renderHome();
  assert.equal(doc.querySelector("[data-hero-cta]")?.textContent?.trim(), "Explore Collection");
  assert.deepEqual([...doc.querySelectorAll("[data-hero-tile] [data-tile-link]")].map((n) => n.textContent?.trim()), ["View collection", "View collection", "View collection", "View collection"]);
  const difference = doc.querySelector("[data-home-difference]")!;
  assert.equal(difference.querySelector("a")?.getAttribute("href"), "/pages/contact");
  assert.ok(!difference.querySelector("a")?.className.includes("bg-brand"), "The call to action is a text link, as in the design");
  const categories = doc.querySelector("[data-home-category-section]")!;
  assert.ok(categories.querySelector("[data-ornament]"), "The heading has the design's ornament");
  const tile = categories.querySelector("[data-home-categories] > a")!;
  assert.equal(tile.lastElementChild?.tagName, "H3", "Labels sit under the circles");
});

test("ticker is a burgundy band, nimbus shows its copy and call to action without a toggle, rails carry the design's headings", async () => {
  const doc = await renderHome();
  assert.ok(doc.querySelector("[data-home-ticker]")?.className.includes("bg-brand"));
  const nimbus = doc.querySelector("[data-home-nimbus]")!;
  assert.equal(nimbus.querySelector("button[aria-expanded]"), null, "No hidden details panel");
  assert.equal(nimbus.querySelector("a")?.getAttribute("href"), "/pages/nimbus-collection");
  const rail = doc.querySelector('[data-home-section="bestsellers"] header')!;
  assert.equal(rail.querySelector("p")?.textContent, "Handpicked favourites");
  assert.equal(rail.querySelector("a")?.textContent?.trim(), "View all bestsellers →");
});

test("testimonial, enquiry and values follow the design", async () => {
  const doc = await renderHome();
  const quote = doc.querySelector("[data-home-testimonial] blockquote h3")!;
  assert.match(quote.textContent ?? "", /hassle-free/);
  const project = doc.querySelector("[data-home-project]")!;
  assert.equal(project.querySelector("[data-eyebrow]")?.textContent, "Let’s connect");
  assert.ok(project.querySelector("[data-project-form]")?.closest("[data-form-card]"), "The form sits in a white card");
  assert.equal(project.querySelector('[data-project-form] button[type="submit"]')?.textContent?.trim(), "Send enquiry →");
  const values = doc.querySelector("[data-home-values]")!;
  assert.equal(values.querySelector("[data-watermark]")?.textContent, "Maple Furnishers");
  assert.equal(values.querySelector("a")?.getAttribute("href"), "/pages/our-story");
});
