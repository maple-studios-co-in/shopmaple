import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import React, { type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import Home from "../app/page";
import SofasPage from "../app/sofas/page";
import ChairsPage from "../app/chairs/page";
import TablesPage from "../app/tables/page";
import NimbusPage from "../app/nimbus-collection/page";
import StoryPage from "../app/our-story/page";
import BlogPage from "../app/blogs/[blog]/page";
import ArticlePage from "../app/blogs/[blog]/[article]/page";
import Collection from "../app/collections/[handle]/page";
import ProductPage from "../app/products/[handle]/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeMerchandising } from "../lib/home-merchandising-defaults";
import { resolveEditorialContent } from "../lib/editorial-content-defaults";
import { cardFixture, queryFixture } from "./support/catalogue-fixtures";

// Nothing from Shopify stays on the store (owner, 11 Nov 2026): no product data, photos, artwork or films. A Shopify
// media address is its CDN, a *.myshopify.com store, Shopify's file path on the old shop's domain, or the
// /media/shopify/ copies an earlier release named. shop.maplefurnishers.com itself is the store's new address and may
// appear as a page link.
const shopify = /cdn\.shopify\.com|[a-z0-9-]+\.myshopify\.com|shop\.maplefurnishers\.com\/cdn\b|\/media\/shopify\//i;

const root = join(import.meta.dirname, "../../..");
// Only these name a Shopify host on purpose: the helper that recognises Shopify media to remove it, and the content
// renderer that sends old links to a Shopify checkout to the contact page instead.
const allowed = new Set(["packages/contracts/src/shopify-media-removal.ts", "apps/web/components/store-content.tsx"]);
const skipped = /(^|\/)(node_modules|\.next|test|dist|coverage)(\/|$)|\.test\.[cm]?[jt]sx?$|\.db\.test\./;
const scanned = /\.(?:[cm]?[jt]sx?|json|css|md|html|svg|txt)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const rel = relative(root, path);
    if (skipped.test(rel)) return [];
    return statSync(path).isDirectory() ? files(path) : scanned.test(name) ? [rel] : [];
  });
}

test("no data file or code constant in the store names a Shopify media host", () => {
  const offenders = ["apps", "packages", "scripts", "deploy"].flatMap((dir) => files(join(root, dir)))
    .filter((rel) => !allowed.has(rel))
    .flatMap((rel) => readFileSync(join(root, rel), "utf8").split("\n")
      .flatMap((line, index) => (shopify.test(line) ? [`${rel}:${index + 1}`] : [])));
  assert.deepEqual(offenders, []);
  // The scan reaches the places that held Shopify media before (so an empty result is not an empty scan).
  const reached = new Set(["apps", "packages"].flatMap((dir) => files(join(root, dir))));
  for (const rel of ["apps/web/data/landing-nimbus.json", "apps/web/data/landing-categories.json", "apps/api/data/preview-catalog.json",
    "apps/web/lib/template-media-defaults.ts", "apps/web/next.config.ts", "packages/contracts/src/content.ts"])
    assert.ok(reached.has(rel), `${rel} is scanned`);
});

/** Published content as the live store holds it today: the hero film and its poster still name Shopify. */
function liveContent() {
  const content = structuredClone(defaultStorefrontContent) as Record<string, any>;
  content.homeDetails = {
    ...(content.homeDetails ?? {}),
    hero: {
      ...(content.homeDetails?.hero ?? {}),
      cta: "Explore Collection",
      tiles: [{ key: "sofas", label: "Sofas", priceLabel: "From ₹25,000" }, { key: "chairs", label: "Chairs", priceLabel: "From ₹8,000" },
        { key: "tables", label: "Tables", priceLabel: "From ₹12,000" }, { key: "beds", label: "Beds", priceLabel: "From ₹55,000" }],
      slides: [{
        kind: "video",
        src: "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0",
        poster: "https://shop.maplefurnishers.com/cdn/shop/files/preview_images/f9239e922cef45df9972f1dac1b89e0a.thumbnail.0000000000.jpg?v=1792990295&width=1600",
        alt: "Arranging flowers", headline: "Timeless Craftsmanship for Modern Living", intro: "Handcrafted furniture.",
      }],
    },
  };
  // Bestsellers and compare as published: mostly products that left the store with Shopify.
  content.homeMerchandising = { ...structuredClone(defaultHomeMerchandising), bestsellers: ["aera-swivel-lounge-chair", "aero-dining-chair", "aileron-signature-bed", "aileron-upholstered-bench", "alcyone-7-seater-sofa", "alina-7-seater-sofa"] };
  // Proof the published document was read (with its Shopify files dropped) rather than discarded for the bundled copy.
  content.homeCopy = { ...content.homeCopy, bestsellersHeading: "Published favourites" };
  return content;
}

const keeriPhoto = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle.replace(/[^a-z0-9]/g, "")}.webp`;
const card = (handle: string) => ({ ...cardFixture(handle), image: keeriPhoto(handle) });
const product = (handle: string) => ({
  id: `keeri:maple:${handle}`, handle, title: "Caro", description: "A chair.", category: "chairs", images: [keeriPhoto(handle)],
  published: true, source: "keeri:maple", sourceUpdatedAt: "2026-11-11T00:00:00Z",
  variants: [{ id: `keeri:maple:${handle}-v`, title: "Oak", sku: "CARO-OAK", pricePaise: 2500000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: [keeriPhoto(handle)] }],
});

async function withStore(run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const content = liveContent();
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path === "/api/content/storefront") return Response.json({ version: 7, content });
    if (path === "/api/instagram/feed") return Response.json({ posts: [] });
    if (path === "/api/catalogue/cards") return Response.json({ products: (url.searchParams.get("handles") ?? "").split(",").filter(Boolean).map(card), published: true });
    if (path.startsWith("/api/catalogue/cards/")) return Response.json({ product: card(decodeURIComponent(path.split("/").at(-1)!)), published: true });
    if (path === "/api/catalogue/related") return Response.json({ category: url.searchParams.get("category"), products: [card("arno")], published: true });
    if (path.startsWith("/api/catalogue/collections/")) {
      const handle = decodeURIComponent(path.split("/").at(-1)!);
      return Response.json({ handle, query: queryFixture(), products: [card("caro")], total: 1, collectionTotal: 1, inStock: 0, outOfStock: 1,
        highestPrice: 123400, limit: 24, published: true, mode: "preview", checkoutEnabled: false });
    }
    if (path.startsWith("/api/products/")) return Response.json(product(decodeURIComponent(path.split("/").at(-1)!)));
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}

const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
async function html(node: ReactNode) {
  const stream = await renderToReadableStream(
    <AppRouterContext.Provider value={router as never}><SearchParamsContext.Provider value={new URLSearchParams()}><ShopProvider>{node}</ShopProvider></SearchParamsContext.Provider></AppRouterContext.Provider>);
  await stream.allReady;
  return new Response(stream).text();
}

test("the homepage, landing pages, story, blog, a collection and a product page render no Shopify address", async () => {
  const { blogs } = resolveEditorialContent(defaultStorefrontContent.editorialContent, defaultStorefrontContent.authoredArticles);
  const blog = blogs.find((item) => item.articles.length > 0)!;
  const pages: [string, () => Promise<ReactNode>][] = [
    ["/", async () => Home()],
    ["/sofas", async () => SofasPage()],
    ["/chairs", async () => ChairsPage()],
    ["/tables", async () => TablesPage()],
    ["/nimbus-collection", async () => NimbusPage()],
    ["/our-story", async () => StoryPage()],
    [`/blogs/${blog.handle}`, async () => BlogPage({ params: Promise.resolve({ blog: blog.handle }) })],
    // The dining-table guide carried a Shopify picture in its imported text.
    ...blog.articles.map((article): [string, () => Promise<ReactNode>] =>
      [`/blogs/${blog.handle}/${article.handle}`, async () => ArticlePage({ params: Promise.resolve({ blog: blog.handle, article: article.handle }) })]),
    ["/collections/chairs", async () => Collection({ params: Promise.resolve({ handle: "chairs" }), searchParams: Promise.resolve({}) })],
    ["/products/caro", async () => ProductPage({ params: Promise.resolve({ handle: "caro" }), searchParams: Promise.resolve({}) })],
  ];
  await withStore(async () => {
    for (const [path, render] of pages) {
      const markup = await html(await render());
      assert.ok(markup.length > 1000, `${path} rendered`);
      assert.equal(shopify.exec(markup)?.[0], undefined, `${path} names no Shopify address`);
    }
    // The published hero film is gone, and the Keeri stills stand in for it.
    const home = await html(await Home());
    assert.match(home, /Published favourites/, "the published content is used, not the bundled fallback");
    assert.doesNotMatch(home, /<video/);
    // A retired bestseller is shown as its Keeri replacement.
    assert.match(home, /\/products\/avelon-chair/);
    assert.doesNotMatch(home, /aera-swivel-lounge-chair/);
    assert.match(home, /media%2Fkeeri%2Farborsofa\.webp|media\/keeri\/arborsofa\.webp/);
  });
});
