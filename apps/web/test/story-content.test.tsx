import assert from "node:assert/strict";
import { shown } from "./support/rendered-src";
import { cardFixture } from "./support/catalogue-fixtures";
import { test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import * as storyRoute from "../app/our-story/page";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { legacyStoryPage } from "../lib/story-content-defaults";
import { storefrontContentSchema } from "@shopmaple/contracts";

const storyEdit = () => ({
  title: "Our craft and community",
  heroEyebrow: "Our story / Since 2015",
  heroHeading: ["Made for your home", "By Maple"],
  tagline: "An independently edited introduction.",
  heroBody: "A workshop that listens.",
  heroCta: "See how we got here",
  principles: [
    { key: "handmade", title: "Made by hand", body: "Every joint, by people." },
    { key: "unique-designs", title: "Drawn for you", body: "No two alike." },
    { key: "bespoke-pieces", title: "Finished your way", body: "Fabric, size, finish." },
  ],
  beliefEyebrow: "Our approach",
  beliefHeading: ["Built with care", "For everyday life"],
  beliefBody: "<script>alert('plain text')</script> Furniture with purpose.\n\nA second, quieter paragraph.",
  filmHeading: ["A workshop", "with purpose"],
  journeyEyebrow: "Our timeline",
  journeyHeading: "Our milestones",
  timeline: Array.from({ length: 7 }, (_, i) => ({
    key: `chapter-${i + 1}`,
    date: `${2010 + i}`,
    title: `Milestone ${i + 1}`,
    body: `Our chapter ${i + 1} story.`,
  })),
  sections: [
    { key: "journey", enabled: true },
    { key: "hero", enabled: true },
    { key: "invitation", enabled: true },
    { key: "belief-film", enabled: true },
    { key: "principles", enabled: false },
    { key: "cities", enabled: false },
  ],
  invitationHeading: "Talk to the workshop.",
  invitationBody: "Tell us about your room.",
  invitationCta: "Write to us",
});
/** Each listed Keeri product's own photo, as the catalogue's cards carry it. */
const photo = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle}.webp`;
async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    // The opening and belief photos stand in from Keeri products' cards until staff upload their own.
    const url = new URL(String(input));
    if (url.pathname === "/api/catalogue/cards")
      return Response.json({ published: true, products: (url.searchParams.get("handles") ?? "").split(",").map(handle => ({ ...cardFixture(handle), image: photo(handle) })) });
    assert.ok(String(input).endsWith("/api/content/storefront"));
    assert.equal(init?.cache, "no-store");
    if (body === "offline") throw new Error("offline");
    return body === null
      ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 })
      : Response.json(body);
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
async function renderPage() {
  return new JSDOM(await new Response(await renderToReadableStream(
    await storyRoute.default(),
  )).text()).window.document;
}
const text = (doc: Document, selector: string) => doc.querySelector(selector)?.textContent;
const texts = (doc: Document, selector: string) => [...doc.querySelectorAll(selector)].map(node => node.textContent);
const order = (doc: Document) => [...doc.querySelectorAll("[data-story-section]")].map(node => node.getAttribute("data-story-section"));

test("Our Story draws the owner's redesign (Figma 293:1093) from the bundled copy", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    assert.deepEqual(order(doc), ["hero", "principles", "belief-film", "journey", "cities", "invitation"]);
    // Opening: eyebrow, two-line title, tagline, introduction and a button down to the journey, beside a photo (its Shopify
    // original left the store on 11 Nov 2026; a Keeri product's photo stands in until staff upload one).
    assert.match(text(doc, ".story-hero .story-eyebrow") ?? "", /^Our Story\s*\/\s*Made in Delhi$/);
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(text(doc, "h1.story-hero-title"), "Made different,by design.");
    assert.equal(doc.querySelectorAll("h1 br").length, 1);
    assert.equal(text(doc, ".story-hero-tagline"), "Furniture tailored to your narrative.");
    assert.equal(text(doc, ".story-hero-body"), "A family pursuit. A Delhi workshop. A belief that good furniture should feel as strong as it looks.");
    const explore = doc.querySelector<HTMLAnchorElement>("a.story-hero-cta");
    assert.equal(explore?.textContent, "Explore the Maple journey");
    assert.equal(explore?.getAttribute("href"), "#maple-journey");
    assert.equal(doc.querySelector("#maple-journey")?.getAttribute("data-story-section"), "journey");
    assert.equal(shown(doc.querySelector(".story-hero-media img")?.getAttribute("src")), photo("luca"));
    // Three principles, each with its drawn icon.
    assert.deepEqual(texts(doc, ".story-principle h3"), ["Handmade", "Unique designs", "Bespoke pieces"]);
    assert.deepEqual(texts(doc, ".story-principle p"), ["Crafted in-house, with care.", "Considered for everyday living.", "Your space. Your finish. Your way."]);
    assert.deepEqual([...doc.querySelectorAll(".story-principle img")].map(img => [img.getAttribute("src"), img.getAttribute("alt")]),
      [["/media/our-story/handmade.svg", ""], ["/media/our-story/unique-designs.svg", ""], ["/media/our-story/bespoke-pieces.svg", ""]]);
    // The belief: the woven seat beside two paragraphs, the first darker.
    assert.equal(text(doc, ".story-belief .story-eyebrow"), "Our Belief");
    assert.equal(text(doc, "h2.story-belief-title"), "Luxury is not loud.It is what stays.");
    assert.deepEqual(texts(doc, ".story-belief-body p"), [
      "The weight of a table that does not wobble after five years. The way a well-upholstered chair holds its shape through an Indian summer. The quiet satisfaction of sitting in something built for your specific room.",
      "Maple began as a family pursuit to build something that lasts. The workshop in Delhi is still where everything happens, and every piece we ship carries the same brief it started with: build it right.",
    ]);
    assert.equal(shown(doc.querySelector(".story-belief-media img")?.getAttribute("src")), photo("varin"));
    // The journey: seven chapters in a slider, the first in view, chosen by the years under it.
    assert.equal(text(doc, ".story-journey > .story-eyebrow"), "The Maple Journey");
    assert.equal(text(doc, "h2.story-journey-title"), "Built over time. Made for yours.");
    assert.equal(doc.querySelector(".story-timeline")?.getAttribute("aria-roledescription"), "carousel");
    assert.deepEqual(texts(doc, '.story-timeline [role="tab"]'), ["2015", "2015–2022", "2023", "2024", "2026", "Today", "Tomorrow"]);
    assert.deepEqual([...doc.querySelectorAll('.story-timeline [role="tab"]')].map(tab => tab.getAttribute("aria-selected")), ["true", "false", "false", "false", "false", "false", "false"]);
    const panels = [...doc.querySelectorAll('.story-timeline [role="tabpanel"]')];
    assert.equal(panels.length, 7);
    assert.deepEqual(panels.map(panel => panel.hasAttribute("inert")), [false, true, true, true, true, true, true]);
    assert.deepEqual(texts(doc, ".story-chapter h3"), ["The craft begins.", "Learning fromIndian homes.", "Maple Furnishersis formed.", "Customization becomesour identity.", "The online shift.", "Quiet luxury,built in-house.", "Built for homesacross India."]);
    assert.match(text(doc, '[data-story-chapter="chapter-1"] .story-eyebrow') ?? "", /^Story\s*\/\s*2015$/);
    assert.deepEqual(texts(doc, '[data-story-chapter="chapter-1"] .story-chapter-body p'), [
      "Our journey began in 2015, working under another brand name with a small workshop, a hands-on team, and a simple belief: good furniture should feel as strong as it looks.",
      "Started by Pradeep Agrawal, the foundation came from a family business built around furniture, materials, and everyday customer needs.",
    ]);
    assert.deepEqual([...doc.querySelectorAll(".story-chapter-media img")].map(img => img.getAttribute("src")),
      Array.from({ length: 7 }, (_, i) => `/media/our-story/chapter-${i + 1}.webp`));
    assert.equal(doc.querySelector('.story-timeline button[aria-label="Previous chapter"]')?.getAttribute("aria-disabled"), "true");
    assert.equal(doc.querySelector('.story-timeline button[aria-label="Next chapter"]')?.getAttribute("aria-disabled"), "false");
    // The cities band, then the invitation to start a custom piece.
    assert.ok(doc.querySelector('[data-story-section="cities"] .home-cities'));
    assert.equal(text(doc, ".story-invitation h2"), "Your story deserves its own furniture.");
    assert.equal(text(doc, ".story-invitation p"), "Bring us your space, your materials and the way you want to live.");
    const talk = doc.querySelector(".story-invitation a");
    assert.equal(talk?.textContent, "Start a conversation");
    assert.equal(talk?.getAttribute("href"), "/contact?product=Custom+furniture");
    // The old film and promise row are gone.
    assert.equal(doc.querySelector("video"), null);
    assert.equal(doc.querySelector(".landing-promises"), null);
  });
});

test("published story edits render the selected order and safe text while preserving media", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, storyPage: storyEdit() } }, async () => {
    const doc = await renderPage();
    assert.equal(text(doc, "h1"), "Made for your homeBy Maple");
    assert.deepEqual(order(doc), ["journey", "hero", "invitation", "belief-film"]);
    assert.equal(doc.querySelector(".home-cities"), null);
    assert.equal(doc.querySelector(".story-principle"), null);
    assert.match(text(doc, ".story-hero .story-eyebrow") ?? "", /^Our story\s*\/\s*Since 2015$/);
    assert.equal(text(doc, ".story-hero-tagline"), "An independently edited introduction.");
    assert.equal(text(doc, ".story-hero-body"), "A workshop that listens.");
    assert.equal(text(doc, "a.story-hero-cta"), "See how we got here");
    assert.equal(text(doc, ".story-journey > .story-eyebrow"), "Our timeline");
    assert.equal(text(doc, ".story-journey h2"), "Our milestones");
    assert.equal(text(doc, ".story-chapter h3"), "Milestone 1");
    assert.equal(text(doc, '.story-timeline [role="tab"]'), "2010");
    assert.equal(text(doc, ".story-chapter-body p"), "Our chapter 1 story.");
    assert.equal(text(doc, ".story-belief h2"), "Built with careFor everyday life");
    assert.deepEqual(texts(doc, ".story-belief-body p"), ["<script>alert('plain text')</script> Furniture with purpose.", "A second, quieter paragraph."]);
    assert.equal(doc.querySelector("script"), null);
    assert.equal(text(doc, ".story-invitation h2"), "Talk to the workshop.");
    assert.equal(text(doc, ".story-invitation p"), "Tell us about your room.");
    assert.equal(text(doc, ".story-invitation a"), "Write to us");
    assert.equal(shown(doc.querySelector(".story-hero-media img")?.getAttribute("src")), photo("luca"));
    const metadata = "generateMetadata" in storyRoute
      ? await (storyRoute.generateMetadata as () => Promise<{ title: string }>)()
      : (storyRoute as unknown as { metadata: { title: string } }).metadata;
    assert.equal(metadata.title, "Our craft and community");
  });
});

test("the opening's button only offers the journey while the journey shows", async () => {
  const storyPage = storyEdit();
  storyPage.sections = storyPage.sections.map(section => section.key === "journey" ? { ...section, enabled: false } : section);
  await withResponse({ version: 4, content: { ...defaultStorefrontContent, storyPage } }, async () => {
    const doc = await renderPage();
    assert.equal(doc.querySelector("#maple-journey"), null);
    assert.equal(doc.querySelector("a.story-hero-cta"), null);
  });
});

test("hiding every visual story region retains one accessible page heading", async () => {
  const storyPage = storyEdit();
  storyPage.sections = storyPage.sections.map(s => ({ ...s, enabled: false }));
  await withResponse({ version: 3, content: { ...defaultStorefrontContent, storyPage } }, async () => {
    const doc = await renderPage();
    assert.equal(text(doc, "h1"), "Made for your homeBy Maple");
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.ok(doc.querySelector("h1.sr-only"));
    assert.equal(doc.querySelectorAll("[data-story-section]").length, 0);
  });
});

test("the original template's untouched copy follows the redesign, while staff edits and choices stay", async () => {
  // What the live store had published: the original copy, word for word, with one chapter and the order edited.
  const storyPage = structuredClone(legacyStoryPage);
  storyPage.timeline[2] = { ...storyPage.timeline[2]!, body: "Our own words about 2023." };
  storyPage.sections = [{ key: "hero", enabled: true }, { key: "journey", enabled: true }, { key: "belief-film", enabled: true }, { key: "cities", enabled: false }];
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, storyPage }).success, true, "older revisions stay valid");
  await withResponse({ version: 5, content: { ...defaultStorefrontContent, storyPage } }, async () => {
    const doc = await renderPage();
    assert.equal(text(doc, "h1"), "Made different,by design.");
    assert.equal(text(doc, ".story-belief h2"), "Luxury is not loud.It is what stays.");
    assert.equal(text(doc, ".story-journey h2"), "Built over time. Made for yours.");
    assert.equal(text(doc, ".story-chapter h3"), "The craft begins.");
    assert.equal(texts(doc, '[data-story-chapter="chapter-3"] .story-chapter-body p').join("|"), "Our own words about 2023.");
    assert.deepEqual(order(doc), ["hero", "principles", "journey", "belief-film", "invitation"]);
  });
});

test("legacy, failed and draft responses preserve the bundled story instead of leaking draft edits", async () => {
  const legacy = { ...defaultStorefrontContent } as Record<string, unknown>;
  delete legacy.storyPage;
  for (const body of [
    { version: 3, content: legacy },
    { version: 3, draft: { ...legacy, storyPage: storyEdit() } },
    { version: 3, content: { ...legacy, storyPage: { title: "Invalid draft" } } },
    "offline",
  ]) await withResponse(body, async () => {
    const doc = await renderPage();
    assert.equal(text(doc, "h1"), "Made different,by design.");
    assert.equal(doc.querySelectorAll(".story-chapter").length, 7);
  });
});

test("story contract accepts bounded content and rejects unknown, duplicate and executable fields", () => {
  const valid = { ...defaultStorefrontContent, storyPage: storyEdit() };
  assert.equal(storefrontContentSchema.safeParse(valid).success, true);
  assert.equal(storefrontContentSchema.safeParse(defaultStorefrontContent).success, true, "the bundled redesign is valid content");
  const { heroEyebrow: _a, heroBody: _b, heroCta: _c, principles: _d, journeyEyebrow: _e, invitationHeading: _f, invitationBody: _g, invitationCta: _h, ...older } = storyEdit();
  assert.equal(storefrontContentSchema.safeParse({ ...valid, storyPage: { ...older, sections: older.sections.filter(s => s.key !== "principles" && s.key !== "invitation") } }).success, true,
    "a revision from before the redesign, with four sections and none of the new copy, stays valid");
  const invalid = [
    { ...storyEdit(), sections: [{ key: "hero", enabled: true }] },
    { ...storyEdit(), sections: [...storyEdit().sections.slice(0, 5), { key: "hero", enabled: false }] },
    { ...storyEdit(), sections: [...storyEdit().sections.slice(0, 5), { key: "checkout", enabled: true }] },
    { ...storyEdit(), sections: storyEdit().sections.filter(s => s.key !== "cities") },
    { ...storyEdit(), sections: [...storyEdit().sections, { key: "cities", enabled: true }] },
    { ...storyEdit(), timeline: storyEdit().timeline.slice(0, 6) },
    { ...storyEdit(), timeline: [...storyEdit().timeline.slice(0, 6), storyEdit().timeline[0]] },
    { ...storyEdit(), timeline: [...storyEdit().timeline.slice(0, 6), { ...storyEdit().timeline[6], key: "unknown" }] },
    { ...storyEdit(), principles: storyEdit().principles.slice(0, 2) },
    { ...storyEdit(), principles: [...storyEdit().principles.slice(0, 2), storyEdit().principles[0]] },
    { ...storyEdit(), principles: [...storyEdit().principles.slice(0, 2), { key: "warranty", title: "Ten years", body: "Of cover." }] },
    { ...storyEdit(), principles: storyEdit().principles.map(p => ({ ...p, icon: "/media/x.svg" })) },
    { ...storyEdit(), title: "\u0000" },
    { ...storyEdit(), heroHeading: [" "] },
    { ...storyEdit(), heroHeading: ["a", "b", "c", "d"] },
    { ...storyEdit(), heroCta: "x".repeat(61) },
    { ...storyEdit(), heroEyebrow: " " },
    { ...storyEdit(), invitationBody: "tab\u000bstop" },
    { ...storyEdit(), beliefBody: "x".repeat(8001) },
    { ...storyEdit(), image: "/media/uploads/missing.webp" },
    { ...storyEdit(), invitationHref: "https://evil.invalid" },
    { ...storyEdit(), html: "<script>run()</script>" },
    { ...storyEdit(), inventory: { quantity: 30 } },
  ];
  for (const storyPage of invalid)
    assert.equal(storefrontContentSchema.safeParse({ ...valid, storyPage }).success, false, JSON.stringify(storyPage));
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, pages: [{
    slug: "our-story", title: "Override", description: "", body: "", banner: null,
  }] }).success, false);
});

test("without an upload or a listed Keeri photo the opening and belief keep their words and draw no picture", async () => {
  const { StoryLanding } = await import("../components/category-story");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const doc = new JSDOM(renderToStaticMarkup(<StoryLanding />)).window.document;
  assert.equal(doc.querySelector(".story-hero-media"), null);
  assert.equal(doc.querySelector(".story-belief-media"), null);
  assert.equal(text(doc, "h1.story-hero-title"), "Made different,by design.");
  assert.equal(text(doc, ".story-belief .story-eyebrow"), "Our Belief");
  const uploaded = new JSDOM(renderToStaticMarkup(<StoryLanding media={[{ key: "story-hero", image: "/media/uploads/" + "e".repeat(64) + ".webp", alt: "Our workshop" }]} photos={new Map([["luca", photo("luca")]])} />)).window.document;
  assert.ok(shown(uploaded.querySelector(".story-hero-media img")?.getAttribute("src")).includes("e".repeat(64)), "an upload wins over the Keeri photo");
});
