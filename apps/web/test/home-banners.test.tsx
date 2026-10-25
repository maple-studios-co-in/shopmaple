import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";

test("homepage renders all three current banners with usable collection links", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    const document = new JSDOM(await new Response(stream).text()).window.document;
    const banners = [...document.querySelectorAll<HTMLAnchorElement>(".home-promo a")];
    assert.equal(banners.length, 3, "The current chair, dining and sofa banners must be visible on the homepage");
    assert.deepEqual(banners.map(link => link.getAttribute("href")), ["/collections/chairs", "/collections/dinings", "/collections/sofas"]);
    for (const banner of banners) {
      assert.ok(banner.querySelector("picture source[media]"), "Each banner must supply its mobile artwork");
      assert.ok(banner.querySelector("img[alt]")?.getAttribute("alt"), "Each banner link needs an accessible description");
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
