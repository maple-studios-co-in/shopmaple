import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

test("homepage keeps one existing brand heading across default, reordered and disabled sections", async () => {
  const previous = globalThis.fetch;
  try {
    for (const arrangement of ["default", "reordered", "disabled"]) {
      const content = structuredClone(defaultStorefrontContent);
      if (arrangement === "reordered") content.homeSections.reverse();
      if (arrangement === "disabled") content.homeSections.forEach(section => { section.enabled = false; });
      globalThis.fetch = async input => String(input).endsWith("/api/content/storefront")
        ? Response.json({ version: 1, content }) : new Response(null, { status: 404 });
      const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
      const dom = new JSDOM(await new Response(stream).text());
      try {
        const headings = dom.window.document.querySelectorAll("h1");
        assert.equal(headings.length, 1, `${arrangement} homepage needs a primary heading`);
        assert.equal(headings[0]!.textContent, "Maple Furnishers");
        assert.equal(headings[0]!.className, "sr-only", "preserve the original visible design");
      } finally { dom.window.close(); }
    }
  } finally { globalThis.fetch = previous; }
});
