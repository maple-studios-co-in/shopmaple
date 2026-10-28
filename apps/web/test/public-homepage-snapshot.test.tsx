import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Characterization: the public homepage markup for the bundled default content.
// Regenerate deliberately with UPDATE_HOMEPAGE_SNAPSHOT=1 when the homepage is
// meant to change; the preview renderer refactor must leave this unchanged.
const snapshotPath = new URL("./fixtures/public-homepage.default.html", import.meta.url);
test("public homepage markup for the default published content is unchanged", async () => {
  const previous = globalThis.fetch;
  const previousApi = process.env.API_URL;
  process.env.API_URL = "http://homepage-snapshot.test";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 7, content: defaultStorefrontContent });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    const html = await new Response(stream).text();
    assert.ok(html.includes('data-home-section="hero"'), "Homepage renders managed sections");
    if (process.env.UPDATE_HOMEPAGE_SNAPSHOT) await writeFile(snapshotPath, html);
    assert.equal(html, await readFile(snapshotPath, "utf8"));
  } finally {
    globalThis.fetch = previous;
    process.env.API_URL = previousApi;
  }
});
