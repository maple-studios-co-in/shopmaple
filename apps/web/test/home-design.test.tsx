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

// The "Maple / PDF Review / Home" layout itself is covered by home-pdf-review-design.test.tsx.
test("sections the design does not draw keep their current look, and the enquiry form sits in its white card", async () => {
  const doc = await renderHome();
  assert.ok(doc.querySelector("[data-home-ticker]")?.className.includes("bg-brand"));
  assert.equal(doc.querySelector("[data-home-nimbus] button[aria-expanded]"), null, "No hidden details panel");
  const values = doc.querySelector("[data-home-values]")!;
  assert.equal(values.querySelector("[data-watermark]")?.textContent, "Maple Furnishers");
  assert.equal(values.querySelector("a")?.getAttribute("href"), "/pages/our-story");
  assert.ok(doc.querySelector("[data-home-project] [data-project-form]")?.closest("[data-form-card]"), "The form sits in a white card");
});
