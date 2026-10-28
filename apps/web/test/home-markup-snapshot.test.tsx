import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The public homepage must keep rendering exactly the markup it rendered before the
// shared draft/published renderer existed. The fixture was captured from the route
// as it stood on main before the refactor; regenerate it only for an intended change
// with UPDATE_HOME_SNAPSHOT=1.
const fixture = new URL("./fixtures/home-default.html", import.meta.url);

async function renderPublicHome() {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/api/content/storefront")
      ? Response.json({ version: 2, content: structuredClone(defaultStorefrontContent) })
      : new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return await new Response(stream).text();
  } finally {
    globalThis.fetch = previous;
  }
}

test("public homepage markup for the default content is unchanged", async () => {
  const html = await renderPublicHome();
  assert.ok(html.includes('data-home-section="hero"'), "Renders the managed homepage sections");
  assert.equal(html, await renderPublicHome(), "Rendering is deterministic");
  if (process.env.UPDATE_HOME_SNAPSHOT === "1" || !existsSync(fixture)) writeFileSync(fixture, html);
  assert.equal(html, readFileSync(fixture, "utf8"));
});
