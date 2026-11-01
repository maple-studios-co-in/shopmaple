import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type { Product } from "@shopmaple/contracts";
import { generateMetadata as productMetadata } from "../app/products/[handle]/page";
import { generateMetadata as collectionMetadata } from "../app/collections/[handle]/page";
import { proxy } from "../proxy";

const chair: Product = {
  id: "seo-chair", handle: "seo-chair", title: "Seo Chair", description: "A chair", category: "chairs", images: [],
  published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [{ id: "v", title: "Standard", sku: "S", pricePaise: 100000, compareAtPaise: null, available: true, stockPolicy: "stocked" }],
};
async function withFetch(status: number, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => new Response(status === 200 ? JSON.stringify(chair) : "{}", { status })) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = previous; }
}
const props = (handle: string) => ({ params: Promise.resolve({ handle }) });
const noindex = { index: false, follow: false };

test("a product page whose catalogue read fails still says noindex instead of losing its robots tag", async () => {
  await withFetch(503, async () => {
    assert.deepEqual((await productMetadata(props("seo-down"))).robots, noindex);
  });
  await withFetch(404, async () => {
    const meta = await productMetadata(props("seo-missing"));
    assert.equal(meta.title, "Product not found");
    assert.deepEqual(meta.robots, noindex);
  });
  await withFetch(200, async () => {
    const meta = await productMetadata(props("seo-chair"));
    assert.equal(meta.title, "Seo Chair");
    assert.equal(meta.robots, undefined, "a found product follows the site switch");
  });
});

test("later pages of a collection keep their own canonical; sorting and filters do not", async () => {
  const canonical = async (query: Record<string, string>) => (await collectionMetadata({ ...props("chairs"), searchParams: Promise.resolve(query) })).alternates?.canonical;
  assert.equal(await canonical({}), "/collections/chairs");
  assert.equal(await canonical({ sort: "price-asc", material: "teak" }), "/collections/chairs");
  assert.equal(await canonical({ page: "2", sort: "title" }), "/collections/chairs?page=2");
  assert.equal(await canonical({ page: "1" }), "/collections/chairs");
  assert.equal(await canonical({ page: "x" }), "/collections/chairs");
});

test("every response carries the noindex header until launch, and private pages always do", () => {
  const header = (path: string, indexing: string | undefined) => {
    const previous = process.env.SEO_INDEXING;
    if (indexing === undefined) delete process.env.SEO_INDEXING; else process.env.SEO_INDEXING = indexing;
    try { return proxy(new NextRequest(`https://store.maplefurnishers.com${path}`)).headers.get("x-robots-tag"); }
    finally { if (previous === undefined) delete process.env.SEO_INDEXING; else process.env.SEO_INDEXING = previous; }
  };
  for (const path of ["/", "/products/arix", "/media/keeri/a.webp", "/api/products"]) assert.equal(header(path, undefined), "noindex, nofollow", path);
  assert.equal(header("/products/arix", "on"), null);
  assert.equal(header("/cart", "on"), "noindex, nofollow");
  assert.equal(header("/api/products", "on"), "noindex, nofollow");
});
