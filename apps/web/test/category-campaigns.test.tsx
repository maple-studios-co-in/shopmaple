import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import { CategoryLanding } from "../components/category-landing";
import Collection from "../app/collections/[handle]/page";
import { defaultStorefrontContent } from "../lib/content-defaults";
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
      const href = doc
        .querySelector(`[data-campaign="${campaign}"] a`)
        ?.getAttribute("href");
      assert.ok(href, handle);
      assert.equal(
        new URL(href, `https://store.maplefurnishers.com/collections/${handle}`)
          .href,
        `https://store.maplefurnishers.com/collections/${handle}#collection-products`,
      );
      assert.ok(doc.querySelector("#collection-products"));
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
test("published destinations control every collection campaign placement", async () => {
  const previousFetch = globalThis.fetch;
  const content = structuredClone(defaultStorefrontContent);
  for (const campaign of content.campaigns)
    if (
      ["beds-hero", "beds-sale", "outdoors-hero", "tv-units-hero"].includes(
        campaign.key,
      )
    )
      campaign.href = "/pages/craft-stories";
  globalThis.fetch = async (url) =>
    String(url).includes("/api/content/storefront")
      ? Response.json({ version: 12, content })
      : Response.json({
          products: [],
          total: 0,
          page: 1,
          limit: 50,
          mode: "preview",
          checkoutEnabled: false,
        });
  try {
    for (const handle of ["beds", "outdoor-furnitures", "tv-media-units"]) {
      const doc = await documentFor(
        await Collection({
          params: Promise.resolve({ handle }),
          searchParams: Promise.resolve({}),
        }),
      );
      const links = [...doc.querySelectorAll("[data-campaign] .campaign-cta")];
      assert.ok(links.length > 0);
      for (const link of links)
        assert.equal(
          link.getAttribute("href"),
          "/pages/craft-stories",
          `${handle} must honor its published destination`,
        );
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
test("editor defaults explicitly include the collection grid destinations", () => {
  const destinations = Object.fromEntries(
    defaultStorefrontContent.campaigns.map((c) => [c.key, c.href]),
  );
  assert.equal(
    destinations["beds-hero"],
    "/collections/beds#collection-products",
  );
  assert.equal(
    destinations["beds-sale"],
    "/collections/beds#collection-products",
  );
  assert.equal(
    destinations["outdoors-hero"],
    "/collections/outdoor-furnitures#collection-products",
  );
  assert.equal(
    destinations["tv-units-hero"],
    "/collections/tv-media-units#collection-products",
  );
  assert.equal(destinations["sofas-hero"], "/collections/sofas");
});
