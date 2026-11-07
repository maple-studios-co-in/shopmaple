import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CampaignBanner } from "../components/campaign-banner";
import { defaultStorefrontContent } from "../lib/content-defaults";

async function renderCampaign(content?: typeof defaultStorefrontContent) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => content
    ? Response.json({ version: 2, content })
    : Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    const stream = await renderToReadableStream(<CampaignBanner campaign="landing-announcement" />);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}

test("empty campaign copy fields leave no blank rows and the heading names the region", async () => {
  const content = structuredClone(defaultStorefrontContent);
  Object.assign(content.campaigns[0]!, {
    label: "", supporting: "", eligibility: "", offer: [], headline: ["Furniture for your home"],
  });
  const doc = await renderCampaign(content);
  assert.equal(doc.querySelectorAll(".campaign-label, .campaign-supporting, .campaign-eligibility, .campaign-offer").length, 0);
  assert.equal(doc.querySelector("section")?.getAttribute("aria-label"), "Furniture for your home");
  assert.equal(doc.querySelector("a")?.getAttribute("href"), "/collections/all");
});

test("updated bundled campaign renders the visible Figma offer without superseded copy", async () => {
  const doc = await renderCampaign();
  // The bundled announcement is the Impact Layout frame's "Always Together" strip: one photo, no layered Diwali art.
  assert.equal(doc.querySelector(".campaign-supporting")?.textContent, "For every laugh, fight, and memory.");
  assert.equal(doc.querySelectorAll(".campaign-label, .campaign-eligibility, .campaign-offer").length, 0);
  assert.equal(doc.querySelector("section")?.getAttribute("aria-label"), "Always Together");
  assert.equal(doc.querySelectorAll("[data-artwork] img").length, 2);
});

test("published copy overrides stay visible and escaped after the banner refresh", async () => {
  const content = structuredClone(defaultStorefrontContent);
  Object.assign(content.campaigns[0]!, {
    label: "Approved campaign", supporting: "Made for gatherings", eligibility: "Selected items only",
    headline: ["<img src=x onerror=alert(1)>"], offer: ["Approved offer"],
  });
  const doc = await renderCampaign(content);
  assert.equal(doc.querySelector("section")?.getAttribute("aria-label"), "Approved campaign");
  assert.equal(doc.querySelector(".campaign-supporting")?.textContent, "Made for gatherings");
  assert.equal(doc.querySelector(".campaign-eligibility")?.textContent, "Selected items only");
  assert.equal(doc.querySelector("h2")?.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(doc.querySelectorAll("h2 img, script").length, 0);
});
