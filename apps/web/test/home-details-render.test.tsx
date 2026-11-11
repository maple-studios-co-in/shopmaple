import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

function editedDetails() {
  return {
    hero: { cta: "Discover our collection", tiles: [
      { key: "beds", label: "Restful beds", priceLabel: "Made for your budget" },
      { key: "sofas", label: "Welcoming sofas", priceLabel: "Starting from ₹99" },
      { key: "chairs", label: "Everyday chairs", priceLabel: "Ask for a quote" },
      { key: "tables", label: "Gathering tables", priceLabel: "From ₹18,000" },
    ] },
    difference: { eyebrow: "Why Maple", heading: "Crafted around you", cta: "Plan your space", promises: ["Your fabric", "Your city", "Our workshop", "Our promise"] },
    nimbus: { heading: "Meet Nimbus", tagline: "A softer landing", features: ["Soft seats", "Gentle curves", "Light lines", "Room to relax"], cta: "View Nimbus" },
    testimonial: { title: "Our room feels complete", paragraphs: ["Helpful from day one.", "Beautiful when delivered."], name: "A Maple customer", attribution: " — Homeowner" },
    newsletter: { heading: "Keep in touch", body: "News from our workshop.", signupHeading: "Get collection news" },
    values: [
      { key: "strength", title: "Lasting frames", body: "Built with care." },
      { key: "ages-beautifully", title: "Better with time", body: "Materials that mature." },
      { key: "real-living", title: "Everyday comfort", body: "For every day." },
      { key: "quiet-luxury", title: "Quiet details", body: "A calm room." },
    ],
    cities: { eyebrow: "Find us near you", heading: "Across India" },
    project: { heading: "Tell us your idea", introBefore: "Our team replies in", responseTime: "two working days", introAfter: "with tailored ideas.", body: "Start with your room." },
  };
}

async function renderHome(details?: ReturnType<typeof editedDetails>) {
  const content = structuredClone(defaultStorefrontContent);
  delete (content as Record<string, unknown>).homeDetails;
  if (details) Object.assign(content, { homeDetails: details });
  content.homeSections = ["hero", "difference", "nimbus", "testimonial", "newsletter", "values", "cities", "project", "bestsellers"].map((key) => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, revealSections: false };
  const requests: { url: string; method: string }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/api/content/storefront")) return Response.json({ version: 7, content });
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ published: true,
      products: new URL(url).searchParams.get("handles")!.split(",").includes("avelon-chair") ? [{
        id: "avelon", handle: "avelon-chair", title: "Avelon lounge chair", image: null,
        pricePaise: 2360000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1,
      }] : [],
    });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return { doc: new JSDOM(await new Response(stream).text()).window.document, requests };
  } finally { globalThis.fetch = previous; }
}
const texts = (doc: Document, selector: string) => [...doc.querySelectorAll(selector)].map((node) => node.textContent?.trim());

test("older published homepage retains original copy, assets, local links and forms", async () => {
  const { doc } = await renderHome();
  assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Explore Collection");
  assert.deepEqual(texts(doc, ".category-tile h2"), ["Sofas", "Chairs", "Tables", "Beds"]);
  assert.deepEqual(texts(doc, ".category-tile p"), Array(4).fill("View Collection"), "the frame shows a visit prompt, not the price line");
  assert.deepEqual([...doc.querySelectorAll(".category-tile")].map((node) => node.getAttribute("href")), ["/sofas", "/chairs", "/tables", "/collections/beds"]);
  assert.equal(doc.querySelector(".home-difference h2")?.textContent, "Every element is yours to reshape");
  assert.deepEqual(texts(doc, ".home-difference li span"), ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"]);
  assert.equal(doc.querySelector("[data-nimbus-heading]")?.textContent, "The Nimbus Collection");
  assert.equal(doc.querySelector(".home-testimonial h3")?.textContent, "Getting our sofa made by Maple was a completely hassle-free experience.");
  assert.equal(doc.querySelectorAll("blockquote p").length, 4);
  assert.equal(doc.querySelector("figcaption")?.textContent, "Anjali Gupta — Verified Customer");
  assert.equal(doc.querySelector(".home-newsletter h2")?.textContent, "Soft presence. Strong craftsmanship.");
  assert.deepEqual(texts(doc, ".home-values h3"), ["Quiet Luxury", "Built for Real Living", "Ages Beautifully", "Strength You Don’t See"]);
  assert.equal(doc.querySelector(".home-cities h2")?.textContent, "20+ Cities");
  assert.equal(doc.querySelector(".home-project p")?.textContent, "Describe your project to us and our team will come back within 24 hours with options, pricing, and a clear timeline.");
  assert.equal(doc.querySelector(".home-project strong")?.textContent, "24 hours");
  assert.ok(doc.querySelector('.home-project-form input[name="email"][required]'));
  assert.ok(doc.querySelector('.home-newsletter-form input[type="email"][required]'));
  // The shop film, its poster and the customer's film were Shopify files (left the store 11 Nov 2026). With no Keeri photo
  // listed for the stills, the hero keeps its words over the tile; the testimonial keeps its words.
  assert.equal(doc.querySelector(".hero-film video"), null);
  assert.equal(doc.querySelector(".hero-film img"), null);
  assert.equal(doc.querySelector("[data-hero-headline]")?.textContent, "Timeless Craftsmanship for Modern Living");
  assert.equal(doc.querySelector(".home-testimonial video"), null);
});

test("published detail copy reaches every homepage section and stable keys keep their assets and destinations", async () => {
  const { doc, requests } = await renderHome(editedDetails());
  assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Discover our collection");
  assert.equal(doc.querySelector(".hero-cta")?.getAttribute("href"), "/nimbus-collection");
  assert.deepEqual(texts(doc, ".category-tile h2"), ["Restful beds", "Welcoming sofas", "Everyday chairs", "Gathering tables"]);
  assert.deepEqual(texts(doc, ".category-tile p"), Array(4).fill("View Collection"));
  assert.ok(!doc.body.textContent!.includes("Made for your budget"), "the admin's price lines are not on the Impact Layout tiles");
  assert.deepEqual([...doc.querySelectorAll(".category-tile")].map((node) => node.getAttribute("href")), ["/collections/beds", "/sofas", "/chairs", "/tables"]);
  assert.ok(doc.querySelector(".category-tile img")?.getAttribute("src")?.includes("hero-beds.webp"));
  assert.deepEqual(texts(doc, ".home-difference .home-eyebrow, .home-difference h2, .home-difference a"), ["Why Maple", "Crafted around you", "Plan your space"]);
  assert.deepEqual(texts(doc, ".home-difference li span"), ["Your fabric", "Your city", "Our workshop", "Our promise"]);
  assert.equal(doc.querySelector(".home-difference a")?.getAttribute("href"), "/contact");
  assert.deepEqual(texts(doc, "[data-nimbus-lead], [data-nimbus-heading], [data-nimbus-explore]"), ["A softer landing", "Meet Nimbus", "View Nimbus"]);
  assert.equal(doc.querySelector(".home-nimbus-icons"), null, "the stage shows the tagline, name and button, as in the frame, with no feature row");
  assert.equal(doc.querySelector(".home-testimonial h3")?.textContent, "Our room feels complete");
  assert.deepEqual(texts(doc, "blockquote p"), ["Helpful from day one.", "Beautiful when delivered."]);
  assert.equal(doc.querySelector("figcaption")?.textContent, "A Maple customer — Homeowner");
  assert.deepEqual(texts(doc, ".home-newsletter h2, .home-newsletter-row > div > p, .home-newsletter h3"), ["Keep in touch", "News from our workshop.", "Get collection news"]);
  assert.deepEqual(texts(doc, ".home-values h3"), ["Lasting frames", "Better with time", "Everyday comfort", "Quiet details"]);
  assert.deepEqual(texts(doc, ".home-values p"), ["Built with care.", "Materials that mature.", "For every day.", "A calm room."]);
  assert.equal(doc.querySelector(".home-values img"), null, "the value icons were Shopify files: none until staff upload one");
  assert.deepEqual(texts(doc, ".home-cities header .home-eyebrow, .home-cities h2"), ["Find us near you", "Across India"]);
  assert.equal(doc.querySelector(".home-project h2")?.textContent, "Tell us your idea");
  assert.deepEqual(texts(doc, ".home-project > div > p"), ["Our team replies in two working days with tailored ideas.", "Start with your room."]);
  assert.equal(doc.querySelector(".home-project strong")?.textContent, "two working days");
  assert.equal(doc.querySelector("[data-card-price]")?.textContent, "Rs. 23,600.00");
  assert.ok(requests.every(({ method }) => method === "GET"), "Rendering marketing prices must never write catalogue, stock, order or checkout data");
  assert.ok(requests.every(({ url }) => /\/api\/(content\/storefront|instagram\/feed|products\/[^/]+)$/.test(url)));
});

test("published detail strings are escaped as text rather than interpreted as markup", async () => {
  const details = editedDetails();
  const markup = '<img src=x onerror="alert(1)">';
  details.hero.cta = markup;
  details.difference.heading = markup;
  details.nimbus.tagline = markup;
  details.testimonial.paragraphs = [markup];
  details.newsletter.body = markup;
  details.values[0]!.body = markup;
  details.cities.heading = markup;
  details.project.responseTime = markup;
  const { doc } = await renderHome(details);
  for (const selector of [".hero-cta", ".home-difference h2", "[data-nimbus-lead]", "blockquote p", ".home-newsletter-row > div > p", ".home-values p", ".home-cities h2", ".home-project strong"]) assert.equal(doc.querySelector(selector)?.textContent?.trim(), markup);
  assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
});
