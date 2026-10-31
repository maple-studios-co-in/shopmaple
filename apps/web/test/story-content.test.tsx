import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import * as storyRoute from "../app/pages/our-story/page";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { storefrontContentSchema } from "@shopmaple/contracts";

const storyEdit = () => ({
  title: "Our craft and community",
  heroHeading: ["Made for your home", "By Maple"],
  tagline: "An independently edited introduction.",
  beliefEyebrow: "Our approach",
  beliefHeading: ["Built with care", "For everyday life"],
  beliefBody: "<script>alert('plain text')</script> Furniture with purpose.",
  filmHeading: ["A workshop", "with purpose"],
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
    { key: "belief-film", enabled: true },
    { key: "cities", enabled: false },
  ],
});
async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
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
function titleText(doc: Document) {
  return doc.querySelector("h1")?.textContent;
}

test("Our Story source defaults carry the PDF Review copy, the real chronology and the source media", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    assert.equal(titleText(doc), "Made different,by design.");
    assert.equal(doc.querySelector("[data-story-tagline]")?.textContent,
      "Furniture tailored to your narrative. Built with care, for the life you bring to it.");
    assert.equal(doc.querySelector("[data-story-belief]")?.getAttribute("aria-label"), "Our Belief");
    assert.deepEqual([...doc.querySelectorAll("[data-story-milestone-date]")].map(n => n.textContent),
      ["2015", "2015–2022", "2023", "2024", "2026", "Today", "Tomorrow"]);
    assert.equal(doc.querySelector("[data-story-journey] h3")?.textContent, "The Craft Begins");
    assert.equal(doc.querySelectorAll("[data-story-milestone]").length, 7);
    assert.match(doc.querySelector("img[data-story-hero-image]")?.getAttribute("src") ?? "", /Frame129\.png/);
    assert.ok(doc.querySelector('[data-story-film] video[aria-label="The Maple workshop"]'));
    assert.equal(doc.querySelectorAll("h1").length, 1);
  });
});

test("Our Story follows the PDF Review frame: hero card, shared promise, philosophy, journey cards and closing band", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    const root = doc.querySelector("[data-story]");
    assert.ok(root);
    for (const key of ["hero", "belief-film", "journey"])
      assert.ok(doc.querySelector(`[data-story-section="${key}"]`)?.hasAttribute("data-store"), `${key} is scoped`);
    // Hero card: the page title as eyebrow, the headline, tagline, a shop link and the source photograph.
    const hero = doc.querySelector('[data-story-section="hero"]')!;
    assert.equal(hero.querySelector("[data-story-eyebrow]")?.textContent, "Our Story");
    assert.ok(hero.querySelector("h1"));
    const cta = hero.querySelector<HTMLAnchorElement>("a[data-story-cta]");
    assert.equal(cta?.getAttribute("href"), "/collections/all");
    assert.equal(cta?.textContent?.replace(/\s+/g, " ").trim(), "Find your Maple →");
    assert.equal(hero.querySelector("img[data-story-hero-image]")?.getAttribute("alt"), "Maple furniture craftsmanship");
    // The shared "MF / The Maple promise" strip sits under the hero card.
    assert.deepEqual([...hero.querySelectorAll("[data-promise-strip] li strong")].map(n => n.textContent),
      ["Fully customisable", "Crafted in Delhi", "36-month warranty", "Delivery across India"]);
    // Philosophy: the burgundy statement beside the workshop film (poster first, Play on demand).
    const band = doc.querySelector('[data-story-section="belief-film"]')!;
    assert.equal(band.querySelector("[data-story-belief] h2")?.textContent, "Maple doesn’t believein loud luxury.It believes in presence.");
    assert.equal(band.querySelector("[data-story-belief-body]")?.textContent,
      "A considered silhouette. The right fabric. A finish that feels like yours. Furniture that becomes part of the way you live.");
    assert.equal(band.querySelector("[data-story-film] video")?.getAttribute("poster")?.includes("84351f35cf124a0ab27f853cb96b817f"), true);
    assert.equal(band.querySelector("[data-story-film] h2"), null, "The frame has no heading over the picture");
    // Journey: eyebrow and title, then one card per editable chapter with its full text.
    const journey = doc.querySelector('[data-story-section="journey"]')!;
    assert.equal(journey.querySelector("[data-section-eyebrow]")?.textContent, "The Maple Journey");
    assert.equal(journey.querySelector("h2")?.textContent, "Crafted with purpose. Evolving with you.");
    assert.equal(journey.querySelector("ol")?.querySelectorAll(":scope > li[data-story-milestone]").length, 7);
    const first = journey.querySelector("[data-story-milestone]")!;
    assert.equal(first.querySelector("[data-story-milestone-date]")?.textContent, "2015");
    assert.equal(first.querySelector("[data-story-milestone-body]")?.textContent, defaultStorefrontContent.storyPage!.timeline[0]!.body);
    // Closing band: the brand line only. Newsletter signup has no backend, so no form and no promises about it.
    const closing = doc.querySelector("[data-story-closing]")!;
    assert.ok(closing.hasAttribute("data-store"));
    assert.equal(closing.querySelector("h2")?.textContent, "Soft presence.Strong craftsmanship.");
    assert.equal(closing.querySelector("p")?.textContent, "Furniture made for rooms that feel as good as they look.");
    assert.equal(root!.querySelector("form, input"), null);
    assert.doesNotMatch(root!.textContent ?? "", /Unsubscribe|Early access|No spam/i);
    // The frame has no cities band (and its "20+ Cities" count is not part of the design).
    assert.equal(doc.querySelector("[data-home-cities]"), null);
    // Headings never skip a level.
    const levels = [...doc.querySelectorAll("h1, h2, h3, h4")].map(n => Number(n.tagName[1]));
    levels.reduce((previous, level) => { assert.ok(level <= previous + 1, `h${level} follows h${previous}`); return level; }, 0);
  });
});

test("published story edits render the selected order and safe text while preserving media", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, storyPage: storyEdit() } }, async () => {
    const doc = await renderPage();
    assert.equal(titleText(doc), "Made for your homeBy Maple");
    assert.equal(doc.querySelector("[data-story-tagline]")?.textContent, "An independently edited introduction.");
    assert.deepEqual([...doc.querySelectorAll("[data-story-section]")].map(n => n.getAttribute("data-story-section")),
      ["journey", "hero", "belief-film"]);
    assert.equal(doc.querySelector("[data-home-cities]"), null);
    assert.equal(doc.querySelector("[data-story-journey] h3")?.textContent, "Milestone 1");
    assert.equal(doc.querySelector("[data-story-milestone-date]")?.textContent, "2010");
    assert.equal(doc.querySelector("[data-story-milestone-body]")?.textContent, "Our chapter 1 story.");
    assert.equal(doc.querySelector("[data-story-belief] h2")?.textContent, "Built with careFor everyday life");
    assert.match(doc.querySelector("[data-story-belief]")?.textContent ?? "", /<script>alert\('plain text'\)<\/script>/);
    assert.equal(doc.querySelector("script"), null);
    assert.equal(doc.querySelector("[data-story-journey] [data-section-eyebrow]")?.textContent, "Our milestones");
    assert.equal(doc.querySelector('[data-story-section="hero"] [data-story-eyebrow]')?.textContent, "Our craft and community");
    assert.equal(doc.querySelector("[data-story-belief]")?.getAttribute("aria-label"), "Our approach");
    assert.ok(doc.querySelector("img[data-story-hero-image]")?.getAttribute("src")?.includes("Frame129.png"));
    const metadata = "generateMetadata" in storyRoute
      ? await (storyRoute.generateMetadata as () => Promise<{ title: string }>)()
      : (storyRoute as unknown as { metadata: { title: string } }).metadata;
    assert.equal(metadata.title, "Our craft and community");
  });
});

test("hiding every visual story region retains one accessible page heading", async () => {
  const storyPage = storyEdit();
  storyPage.sections = storyPage.sections.map(s => ({ ...s, enabled: false }));
  await withResponse({ version: 3, content: { ...defaultStorefrontContent, storyPage } }, async () => {
    const doc = await renderPage();
    assert.equal(titleText(doc), "Made for your homeBy Maple");
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.ok(doc.querySelector("h1.sr-only"));
    assert.equal(doc.querySelectorAll("[data-story-section]").length, 0);
  });
});

test("legacy, failed and draft responses preserve the source story instead of leaking draft edits", async () => {
  const legacy = { ...defaultStorefrontContent } as Record<string, unknown>;
  delete legacy.storyPage;
  for (const body of [
    { version: 3, content: legacy },
    { version: 3, draft: { ...legacy, storyPage: storyEdit() } },
    { version: 3, content: { ...legacy, storyPage: { title: "Invalid draft" } } },
    "offline",
  ]) await withResponse(body, async () => {
    const doc = await renderPage();
    assert.equal(titleText(doc), "Made different,by design.");
    assert.equal(doc.querySelectorAll("[data-story-milestone]").length, 7);
  });
});

test("story contract accepts bounded content and rejects unknown, duplicate and executable fields", () => {
  const valid = { ...defaultStorefrontContent, storyPage: storyEdit() };
  assert.equal(storefrontContentSchema.safeParse(valid).success, true);
  const invalid = [
    { ...storyEdit(), sections: [{ key: "hero", enabled: true }] },
    { ...storyEdit(), sections: [...storyEdit().sections.slice(0, 3), { key: "hero", enabled: false }] },
    { ...storyEdit(), sections: [...storyEdit().sections.slice(0, 3), { key: "checkout", enabled: true }] },
    { ...storyEdit(), timeline: storyEdit().timeline.slice(0, 6) },
    { ...storyEdit(), timeline: [...storyEdit().timeline.slice(0, 6), storyEdit().timeline[0]] },
    { ...storyEdit(), timeline: [...storyEdit().timeline.slice(0, 6), { ...storyEdit().timeline[6], key: "unknown" }] },
    { ...storyEdit(), title: "\u0000" },
    { ...storyEdit(), heroHeading: [" "] },
    { ...storyEdit(), heroHeading: ["a", "b", "c", "d"] },
    { ...storyEdit(), beliefBody: "x".repeat(8001) },
    { ...storyEdit(), image: "/media/uploads/missing.webp" },
    { ...storyEdit(), html: "<script>run()</script>" },
    { ...storyEdit(), inventory: { quantity: 30 } },
  ];
  for (const storyPage of invalid)
    assert.equal(storefrontContentSchema.safeParse({ ...valid, storyPage }).success, false, JSON.stringify(storyPage));
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, pages: [{
    slug: "our-story", title: "Override", description: "", body: "", banner: null,
  }] }).success, false);
});
