import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { resolveHomeMerchandising } from "../lib/home-merchandising-defaults";

// The owner asked for the categories' arrow on each offer card too: at its bottom right, pointing right, in Maple's
// dark red (10 Nov 2026). The live offers are staff uploads with no arrow of their own; the bundled artwork draws one,
// so it gets no second (home-impact-followup.test.tsx).
const uploaded = (n: number) => `/media/uploads/${String(n).repeat(64)}.webp`;
async function home(withUploads = true) {
  const content = structuredClone(defaultStorefrontContent);
  if (withUploads) {
    const merchandising = resolveHomeMerchandising(content.homeMerchandising);
    content.homeMerchandising = { ...merchandising, offers: merchandising.offers.map((offer, at) => ({ ...offer, image: uploaded(at + 1) })) };
  }
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/api/content/storefront")
      ? Response.json({ version: 2, content })
      : new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
    await stream.allReady;
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}

test("each uploaded offer card carries a right-pointing arrow, as the category circles do", async () => {
  const offers = [...(await home()).querySelectorAll('[data-home-section="offers"] a[data-offer-tile]')];
  assert.ok(offers.length >= 4, "the offer cards");
  for (const offer of offers) {
    const arrow = offer.querySelector("svg[data-offer-arrow]");
    assert.ok(arrow, `${offer.getAttribute("href")} has its arrow`);
    assert.equal(arrow!.getAttribute("aria-hidden"), "true", "the card's link already names where it goes");
    assert.match(arrow!.getAttribute("class") ?? "", /lucide-arrow-right/, "pointing right");
  }
});

// The owner's follow-up (10 Nov 2026): at the bottom left, a white circle with a dark maple arrow, the colours trading
// places when the card is pointed at, as the category circles' arrows do.
test("the offer arrow sits at the card's bottom left, white with a dark maple arrow, turning maple on hover", () => {
  const css = readFileSync(new URL("../styles/home-impact.css", import.meta.url), "utf8");
  const rule = css.match(/\[data-offer-arrow\] \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /position: absolute;/);
  assert.match(rule, /left: 14px;/);
  assert.match(rule, /bottom: 14px;/);
  assert.doesNotMatch(rule, /right:/);
  assert.match(rule, /background: #fff;/);
  assert.match(rule, /color: #80241c;/i, "the arrow in Maple's dark red");
  const hover = css.match(/\.home-offer-tiles a:hover \[data-offer-arrow\][^{]*\{[^}]*\}/)?.[0] ?? "";
  assert.match(hover, /background: #80241c;/i, "pointed at, the circle turns Maple's dark red");
  assert.match(hover, /color: #fff;/, "and the arrow white");
  assert.match(hover, /transform: translateX\(3px\);/);
});

test("the bundled offer artwork, which draws its own arrow, is not given a second", async () => {
  const offers = [...(await home(false)).querySelectorAll('[data-home-section="offers"] a[data-offer-tile]')];
  assert.ok(offers.length >= 4);
  assert.equal(offers.filter((offer) => offer.querySelector("[data-offer-arrow]")).length, 0);
});
