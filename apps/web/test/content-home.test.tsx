import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import ContactPage from "../app/pages/[slug]/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
async function withContent(
  content: typeof defaultStorefrontContent,
  run: () => Promise<void>,
) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/api/content/storefront")
      ? Response.json({ version: 2, content })
      : new Response(null, { status: 404 });
  try {
    await run();
  } finally {
    globalThis.fetch = previous;
  }
}
test("published homepage follows saved order and visibility and renders edited source copy", async () => {
  const content = structuredClone(defaultStorefrontContent);
  content.homeSections = [
    { key: "instagram", enabled: true },
    { key: "hero", enabled: false },
    { key: "categories", enabled: true },
    { key: "announcement", enabled: true },
  ];
  content.homeCopy.socialHeading = "Approved social heading";
  content.campaigns[0]!.headline = ["Approved campaign"];
  await withContent(content, async () => {
    const stream = await renderToReadableStream(
      <ShopProvider>
        <Home />
      </ShopProvider>,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    assert.equal(doc.querySelector(".hero-grid"), null);
    assert.deepEqual(
      [...doc.querySelectorAll("h2")].map((n) => n.textContent),
      ["Approved social heading", "Shop By Category", "Approved campaign"],
    );
    assert.equal(doc.querySelectorAll(".home-instagram-posts a").length, 24);
  });
});
test("published custom pages resolve without replacing functional contact routes", async () => {
  const content = structuredClone(defaultStorefrontContent);
  content.pages = [
    {
      slug: "room-guide",
      title: "Room guide",
      description: "A useful guide",
      body: "Choose your space.",
      banner: null,
    },
  ];
  await withContent(content, async () => {
    let html = "";
    try {
      const page = await ContactPage({
        params: Promise.resolve({ slug: "room-guide" }),
        searchParams: Promise.resolve({}),
      });
      const stream = await renderToReadableStream(
        <ShopProvider>{page}</ShopProvider>,
      );
      html = await new Response(stream).text();
    } catch {}
    assert.ok(
      html.includes("Choose your space."),
      "Published informational pages must resolve",
    );
  });
});
