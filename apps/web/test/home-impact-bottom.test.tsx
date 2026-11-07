import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The bottom of the homepage as the "Maple / Impact Layout" frame (Figma 1049:27656) lays it out:
// the numbers band, the quote, the enquiry card and the values row. Copy still comes from the admin's content document.
const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.jpg", pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

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
const section = (doc: Document, key: string) => doc.querySelector(`[data-home-section="${key}"]`)!;
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
/** The testimonial and the enquiry band start hidden (the page closes on the values); staff can show them again. */
const showing = (...keys: string[]) => (content: typeof defaultStorefrontContent) => {
  for (const item of content.homeSections) if (keys.includes(item.key)) item.enabled = true;
};

import { sectionSignature } from "../lib/section-thumbnails";
import { homeStats } from "../lib/home-stats";

test("the numbers band shows the figures the admin's own words already state, each with the frame's line beneath", async () => {
  const band = section(await renderHome(), "cities").querySelector("[data-stat-band]")!;
  assert.deepEqual([...band.querySelectorAll("[data-stat]")].map((stat) => [text(stat.querySelector("[data-stat-figure]")), text(stat.querySelector("[data-stat-label]")), text(stat.querySelector("[data-stat-description]"))]),
    [["36", "Month warranty", "Built with lasting structure and care."], ["20+", "Cities served", "Delivery across India."]]);
});

test("the numbers follow edits and disappear when no figure is stated", async () => {
  const edited = await renderHome((content) => { content.homeDetails!.difference.promises[3] = "24-Month Warranty"; content.homeDetails!.cities.heading = "Across India"; });
  assert.deepEqual([...section(edited, "cities").querySelectorAll("[data-stat-figure]")].map(text), ["24"]);
  const none = await renderHome((content) => { content.homeDetails!.difference.promises[3] = "Lifetime care"; content.homeDetails!.cities.heading = "Across India"; });
  assert.equal(section(none, "cities").querySelector("[data-stat-band]"), null);
  assert.deepEqual(homeStats(["Fully Customizable"], "7 Studios"), [{ value: "7", label: "Studios served", description: "Delivery across India." }]);
});

test("a figure from the promises or the cities heading reloads the cities thumbnail", () => {
  const before = structuredClone(defaultStorefrontContent);
  const after = structuredClone(defaultStorefrontContent);
  after.homeDetails!.difference.promises[3] = "24-Month Warranty";
  assert.notEqual(sectionSignature(before, "cities"), sectionSignature(after, "cities"));
  after.homeDetails!.difference.promises[3] = before.homeDetails!.difference.promises[3]!;
  after.homeDetails!.difference.eyebrow = "Why Maple";
  assert.equal(sectionSignature(before, "cities"), sectionSignature(after, "cities"), "other difference copy does not");
});

test("the testimonial leads with one large quote and its author; the film and full review follow", async () => {
  const testimonial = section(await renderHome(showing("testimonial")), "testimonial");
  assert.equal(text(testimonial.querySelector("[data-quote-text]")), "Getting our sofa made by Maple was a completely hassle-free experience.");
  assert.equal(text(testimonial.querySelector("[data-quote-author]")), "Anjali Gupta — Verified Customer");
  assert.ok(testimonial.querySelector("video"), "the customer film stays, below the quote");
  assert.equal(testimonial.querySelectorAll("blockquote p").length, 4, "and so does the full review");
  assert.equal(testimonial.querySelector(".home-review-stars"), null, "no star rating: the admin has no rating to show");
  assert.equal(text(testimonial.querySelector("h2")), "Why They Love Us", "the admin's heading stays for screen readers");
});

test("the enquiry is a connect band with a card form that sends an enquiry", async () => {
  const project = section(await renderHome(showing("project")), "project");
  assert.equal(text(project.querySelector("[data-project-eyebrow]")), "Let’s connect");
  assert.equal(text(project.querySelector("h2")), "Have a Space in Mind?");
  assert.equal(text(project.querySelector("[data-project-promise]")), "Quick response We respond within 24 hours.");
  const card = project.querySelector("[data-project-card]")!;
  assert.equal(card.querySelectorAll("input").length, 3);
  assert.match(text(card.querySelector("button")), /^Send enquiry/);
});

test("values end the page with the brand name as a watermark and an Experience Maple button", async () => {
  const values = section(await renderHome(), "values");
  assert.equal(text(values.querySelector("[data-values-watermark]")), "Maple Furnishers");
  assert.equal(values.querySelector("[data-values-watermark]")!.getAttribute("aria-hidden"), "true");
  assert.equal(values.querySelectorAll("h3").length, 4);
  const cta = values.querySelector<HTMLAnchorElement>("[data-values-cta]")!;
  assert.equal(cta.getAttribute("href"), "/pages/our-story");
  assert.equal(text(cta), "Experience Maple");
});

test("a fresh draft follows the frame's order, with the newsletter band last", () => {
  assert.deepEqual(defaultStorefrontContent.homeSections.map((section) => section.key), [
    "hero", "announcement", "difference", "categories", "ticker", "offers", "nimbus", "dining-banner", "instagram", "bestsellers",
    "seating-banner", "chairs", "promos", "editorial", "cities", "compare", "testimonial", "project", "values", "newsletter",
  ]);
});

test("the enquiry form keeps its tall message box and Submit button wherever the card look is not asked for", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HomeProjectForm } = await import("../components/home-forms");
  const plain = new JSDOM(renderToStaticMarkup(<HomeProjectForm />)).window.document;
  assert.equal(text(plain.querySelector("button")), "Submit");
  assert.equal(plain.querySelector("textarea")!.getAttribute("rows"), "6");
  assert.equal(plain.querySelector("[data-project-card]"), null);
  const card = new JSDOM(renderToStaticMarkup(<HomeProjectForm card />)).window.document;
  assert.match(text(card.querySelector("button")), /^Send enquiry/);
  assert.ok(card.querySelector("[data-project-card]"));
});

test("the testimonial's film follows the figure, so the caption stays the figure's last child", async () => {
  const testimonial = section(await renderHome(showing("testimonial")), "testimonial");
  assert.equal(testimonial.querySelector("figure")!.lastElementChild!.tagName, "FIGCAPTION");
  assert.ok(testimonial.querySelector("figure + video, figure ~ video"));
});

test("the cities panel keeps its eyebrow and heading in the page, with no credits line or pause switch (owner), for the frame's heading-free look", async () => {
  const cities = section(await renderHome(), "cities").querySelector(".home-cities")!;
  assert.equal(text(cities.querySelector("h2")), "20+ Cities");
  assert.equal(text(cities.querySelector(".home-eyebrow")), "We Are Serving");
  assert.equal(cities.querySelector('a[href="/media/cities/credits.html"]'), null, "the credits sit in the footer");
  assert.equal(cities.querySelector("[data-marquee-toggle]"), null, "hover and focus hold the row");
  assert.equal(cities.querySelectorAll("[data-marquee-group]:not([data-marquee-copy]) figure").length, 10, "ten cities, drawn once more as the drifting row's hidden second pass");
  assert.equal(cities.querySelectorAll("[data-marquee-copy] figure").length, 10);
});
