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

test("Our Story source defaults preserve original copy, chronology and source media", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    assert.equal(titleText(doc), "MADE DIFFERENT,BY DESIGN");
    assert.equal(doc.querySelector(".landing-story-tagline")?.textContent,
      "Furniture tailored to your narrative.");
    assert.equal(doc.querySelector(".landing-story-belief .home-eyebrow")?.textContent, "Our Belief");
    assert.deepEqual([...doc.querySelectorAll(".landing-journey time")].map(n => n.textContent),
      ["2015", "2015–2022", "2023", "2024", "2026", "Today", "Tomorrow"]);
    assert.equal(doc.querySelector(".landing-journey h3")?.textContent, "The Craft Begins");
    assert.equal(doc.querySelectorAll(".landing-journey li").length, 7);
    assert.match(doc.querySelector(".suggested-story-hero img")?.getAttribute("src") ?? "", /Custom_F\.svg/);
    assert.ok([...doc.querySelectorAll(".suggested-story-hero img")].some(n =>
      n.getAttribute("src")?.includes("Frame129.png")));
    assert.ok(doc.querySelector('.landing-story-film video[aria-label="The Maple workshop"]'));
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(doc.querySelectorAll(".landing-promises li").length, 4);
  });
});

test("published story edits render the selected order and safe text while preserving media", async () => {
  await withResponse({ version: 2, content: { ...defaultStorefrontContent, storyPage: storyEdit() } }, async () => {
    const doc = await renderPage();
    assert.equal(titleText(doc), "Made for your homeBy Maple");
    assert.equal(doc.querySelector(".landing-story-tagline")?.textContent, "An independently edited introduction.");
    assert.deepEqual([...doc.querySelectorAll("[data-story-section]")].map(n => n.getAttribute("data-story-section")),
      ["journey", "hero", "belief-film"]);
    assert.equal(doc.querySelector(".home-cities"), null);
    assert.equal(doc.querySelector(".landing-journey h2")?.textContent, "Our milestones");
    assert.equal(doc.querySelector(".landing-journey h3")?.textContent, "Milestone 1");
    assert.equal(doc.querySelector(".landing-journey time")?.textContent, "2010");
    assert.equal(doc.querySelector(".landing-journey li p")?.textContent, "Our chapter 1 story.");
    assert.equal(doc.querySelector(".landing-story-belief h2")?.textContent, "Built with careFor everyday life");
    assert.match(doc.querySelector(".landing-story-belief")?.textContent ?? "", /<script>alert\('plain text'\)<\/script>/);
    assert.equal(doc.querySelector("script"), null);
    assert.equal(doc.querySelector(".landing-story-film h2")?.textContent, "A workshopwith purpose");
    assert.ok([...doc.querySelectorAll(".suggested-story-hero img")].some(n => n.getAttribute("src")?.includes("Frame129.png")));
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
    assert.equal(titleText(doc), "MADE DIFFERENT,BY DESIGN");
    assert.equal(doc.querySelectorAll(".landing-journey li").length, 7);
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
