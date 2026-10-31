import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { sectionSignature } from "../lib/section-thumbnails";

// "Maple / PDF Review / Home" (Figma nTEPXzov9IuWraGF0Ace6V, node 1042:2), rendered from server HTML alone.
async function renderHome(edit?: (content: typeof defaultStorefrontContent) => void) {
  const content = structuredClone(defaultStorefrontContent);
  content.homeSections = ["hero", "categories", "offers", "nimbus", "bestsellers", "chairs", "testimonial", "newsletter", "difference", "cities", "project"]
    .map((key) => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, autoplayTicker: false, revealSections: false };
  edit?.(content);
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/content/storefront")) return Response.json({ version: 7, content });
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ published: true,
      products: new URL(url).searchParams.get("handles")!.split(",").map((handle) => ({
        id: handle, handle, title: `Card ${handle}`, image: null,
        pricePaise: 2360000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1,
      })),
    });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally { globalThis.fetch = previous; }
}
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, " ").trim();
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(text);

test("hero is the design's bento: a message over the shop film's poster, four labelled category tiles and the promise strip", async () => {
  const doc = await renderHome();
  const hero = doc.querySelector("[data-hero]")!;
  const message = hero.querySelector("[data-hero-message]");
  assert.ok(message, "The hero carries the design's message");
  assert.equal(text(message.querySelector("[data-hero-eyebrow]")), "Made for real living");
  assert.equal(text(message.querySelector("h2")), "Timeless craftsmanship. A home that feels yours.");
  assert.equal(text(message.querySelector("[data-hero-lede]")), "Thoughtfully made furniture, shaped around you.");
  assert.equal(text(message.querySelector("[data-hero-cta]")), "Explore Collection", "The arrow is drawn, so the link reads as the published label");
  assert.equal(hero.querySelector("[data-hero-film] img")?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/files/preview_images/f9239e922cef45df9972f1dac1b89e0a.thumbnail.0000000000.jpg?v=1792990295&width=1600", "The default still is the shop film's own poster, so playback starts without a jump");
  assert.ok(hero.querySelector("[data-hero-film] [data-video-control]"), "The workshop film still plays on request");
  const labels = [...hero.querySelectorAll("[data-hero-tile] [data-tile-card]")];
  assert.deepEqual(labels.map((card) => text(card.querySelector("h3"))), ["Sofas", "Chairs", "Tables", "Beds"]);
  assert.deepEqual(labels.map((card) => text(card.querySelector("[data-tile-link]"))), Array(4).fill("View collection →"));
  assert.ok(hero.querySelector("[data-promise-strip]"), "The Maple promise sits under the bento, inside the hero section");
});

test("categories and offers are the design's 'Designed around you' block: round photographs with arrowed labels, then text shortcut cards", async () => {
  const doc = await renderHome();
  const categories = doc.querySelector("[data-home-category-section]")!;
  assert.equal(text(categories.querySelector("[data-section-eyebrow]")), "Designed around you");
  assert.equal(text(categories.querySelector("h2")), "Shop By Category");
  assert.equal(categories.querySelector("[data-ornament]"), null, "The older ornament is gone");
  assert.deepEqual(texts(categories, "[data-category-label]"), ["Sofas", "Dining Chair", "Coffee Tables", "Accent Chair", "Beds", "Dinings"], "The arrow is drawn, so labels read as the collection titles");
  const offers = [...doc.querySelectorAll("[data-home-offers] a[data-offer-card]")];
  assert.deepEqual(offers.map((card) => text(card.querySelector("h3"))), ["Clearance Sale", "Minimum 30% Off", "Best Buy Under Rs.50,000", "Furniture Store under Rs. 25,000"]);
  assert.deepEqual(offers.map((card) => text(card.querySelector("[data-offer-link]"))), Array(4).fill("Explore →"));
  assert.equal(offers[0]!.getAttribute("href"), "/collections/clearance-sale");
  assert.equal(doc.querySelectorAll("[data-home-offers] img").length, 0, "Shortcut cards are text, as in the design");
});

test("Nimbus is a feature card: photograph beside a cream panel with an eyebrow, title, copy and a burgundy button", async () => {
  const doc = await renderHome();
  const card = doc.querySelector("[data-home-nimbus] [data-feature-card]");
  assert.ok(card, "Nimbus renders as a feature card");
  assert.ok(card.querySelector("img"));
  assert.equal(text(card.querySelector("[data-section-eyebrow]")), "Introducing");
  assert.equal(text(card.querySelector("h2")), "The Nimbus Collection");
  assert.equal(text(card.querySelector("[data-feature-body]")), "Comfort Shaped Like Clouds");
  const cta = card.querySelector("a[data-feature-cta]")!;
  assert.equal(text(cta), "Shop Now");
  assert.equal(cta.getAttribute("href"), "/pages/nimbus-collection");
});

test("product rails use the shared section heading and outlined cards, with a browse button under the chairs rail", async () => {
  const doc = await renderHome();
  const bestsellers = doc.querySelector('[data-home-section="bestsellers"] [data-home-products]')!;
  assert.equal(text(bestsellers.querySelector("[data-section-eyebrow]")), "Handpicked favourites");
  assert.equal(text(bestsellers.querySelector("h2")), "Bestsellers");
  assert.equal(bestsellers.querySelector("[data-product-card]")?.getAttribute("data-card-surface"), "outlined");
  const chairs = doc.querySelector('[data-home-section="chairs"] [data-home-products]')!;
  assert.equal(text(chairs.querySelector("[data-section-eyebrow]")), "Comfort, your way");
  assert.equal(text(chairs.querySelector("h2")), "Chairs");
  const browse = chairs.querySelector("a[data-rail-cta]")!;
  assert.equal(text(browse), "View all chairs →");
  assert.equal(browse.getAttribute("href"), "/collections/chairs");
  assert.ok(browse.compareDocumentPosition(chairs.querySelector("[data-carousel]")!) & 2, "The button follows the rail");
});

test("testimonial is the design's customer story: heading block, film beside a white quote card, and no stars without review data", async () => {
  const doc = await renderHome();
  const section = doc.querySelector("[data-home-testimonial]")!;
  assert.equal(text(section.querySelector("[data-section-eyebrow]")), "Why They Love Us");
  assert.equal(text(section.querySelector("h2")), "Loved for more than just our sofas.");
  assert.equal(text(section.querySelector("[data-section-lede]")), "Thoughtful designs. Exceptional service.");
  assert.ok(section.querySelector("video[controls][poster]"), "The customer film keeps its poster in the photograph's place");
  const card = section.querySelector("[data-testimonial-card]")!;
  assert.equal(text(card.querySelector("blockquote h3")), "Getting our sofa made by Maple was a completely hassle-free experience.");
  assert.equal(card.querySelectorAll("blockquote p").length, 4);
  assert.equal(text(card.querySelector("figcaption")), "Anjali Gupta — Verified Customer");
  assert.equal(section.querySelector("[data-review-stars]"), null, "A star rating appears only with real review data");
});

test("newsletter is a full-width burgundy band with the signup line, an outlined white button and the honest preview notice", async () => {
  const doc = await renderHome();
  const band = doc.querySelector("[data-home-newsletter]")!;
  assert.equal(text(band.querySelector("h2")), "Soft presence. Strong craftsmanship.");
  assert.equal(text(band.querySelector("[data-newsletter-eyebrow]")), "New Collections. Early Access. No Noise.");
  assert.equal(band.querySelector("img"), null, "The design has no logo artwork in the band");
  assert.equal(band.querySelector('input[type="email"]')?.getAttribute("placeholder"), "Your email address");
  assert.equal(text(band.querySelector('button[type="submit"]')), "Subscribe →");
  assert.equal(text(band.querySelector("[data-preview-detail]")), "Newsletter signup is not available yet.");
});

test("difference is the 'Our promise' block: its own eyebrow, title and four promises on a cream strip, with its link", async () => {
  const doc = await renderHome();
  const section = doc.querySelector("[data-home-difference]")!;
  assert.equal(text(section.querySelector("[data-section-eyebrow]")), "The Maple Difference");
  assert.equal(text(section.querySelector("h2")), "Every element is yours to reshape");
  assert.deepEqual(texts(section, "[data-difference-promises] li"), ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"]);
  assert.equal(section.querySelector("a")?.getAttribute("href"), "/pages/contact");
});

test("cities are cream cards with a round photograph and the city's name, under the shared section heading", async () => {
  const doc = await renderHome();
  const section = doc.querySelector("[data-home-cities]")!;
  assert.equal(text(section.querySelector("[data-section-eyebrow]")), "We Are Serving");
  assert.equal(text(section.querySelector("h2")), "20+ Cities");
  assert.deepEqual(texts(section, "[data-city-card] [data-city-name]"), ["Delhi", "Kolkata", "Hyderabad", "Varanasi", "Mumbai", "Jaipur", "Bengaluru", "Chennai", "Gujarat", "Agra"]);
  assert.ok(section.querySelector('a[href="/media/cities/credits.html"]'), "Photo credits stay linked");
});

test("enquiry keeps its copy and form in the design's two columns, with design-sized fields", async () => {
  const doc = await renderHome();
  const project = doc.querySelector("[data-home-project]")!;
  assert.equal(text(project.querySelector("[data-section-eyebrow]")), "Let’s connect");
  assert.equal(text(project.querySelector("h2")), "Have a Space in Mind?");
  const form = project.querySelector("[data-form-card] [data-project-form]")!;
  assert.deepEqual([...form.querySelectorAll("input, textarea")].map((field) => field.getAttribute("placeholder")), ["Your name", "Email address *", "Phone number", "Tell us about your project"]);
  assert.equal(text(form.querySelector('button[type="submit"]')), "Send enquiry →");
});

test("the newsletter thumbnail no longer reloads for artwork the band does not draw", () => {
  const content = structuredClone(defaultStorefrontContent);
  const before = sectionSignature(content, "newsletter");
  content.templateMedia = [{ key: "home-newsletter", image: "/media/other-logo.webp", alt: "Another logo" }];
  assert.equal(sectionSignature(content, "newsletter"), before);
  content.homeDetails = { ...content.homeDetails!, newsletter: { ...content.homeDetails!.newsletter, heading: "Keep in touch" } };
  assert.notEqual(sectionSignature(content, "newsletter"), before);
});
