import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import { CategoryLanding } from "../components/category-landing";
import Collection from "../app/collections/[handle]/page";
import { ShopProvider } from "../components/shop-provider";
async function documentFor(element: React.ReactNode) {
  return new JSDOM(
    await new Response(
      await renderToReadableStream(<ShopProvider>{element}</ShopProvider>),
    ).text(),
  ).window.document;
}
test("category landings replace their two seasonal slots with current hero and sale campaigns", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      products: [],
      total: 0,
      page: 1,
      limit: 50,
      mode: "preview",
      checkoutEnabled: false,
    });
  try {
    for (const slug of ["sofas", "tables", "chairs"] as const) {
      const doc = await documentFor(<CategoryLanding slug={slug} />);
      assert.deepEqual(
        [...doc.querySelectorAll("[data-campaign]")].map((node) =>
          node.getAttribute("data-campaign"),
        ),
        [`${slug}-hero`, `${slug}-sale`],
      );
      assert.ok(
        doc.querySelector(
          `[data-campaign="${slug}-hero"] a[href="/collections/${slug}"]`,
        ),
      );
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
test("collection campaigns keep their CTA on the visible product grid", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      products: [],
      total: 0,
      page: 1,
      limit: 50,
      mode: "preview",
      checkoutEnabled: false,
    });
  try {
    for (const [handle, campaign] of [
      ["beds", "beds-hero"],
      ["outdoor-furnitures", "outdoors-hero"],
      ["tv-media-units", "tv-units-hero"],
    ]) {
      const doc = await documentFor(
        await Collection({
          params: Promise.resolve({ handle: handle! }),
          searchParams: Promise.resolve({}),
        }),
      );
      assert.ok(
        doc.querySelector(
          `[data-campaign="${campaign}"] a[href="#collection-products"]`,
        ),
        handle,
      );
      assert.ok(doc.querySelector("#collection-products"));
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
