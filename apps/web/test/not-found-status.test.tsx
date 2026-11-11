import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Product } from "@shopmaple/contracts";
import CollectionLayout from "../app/collections/[handle]/layout";
import ProductLayout from "../app/products/[handle]/layout";

// An unknown address answers HTTP 404 only if notFound() runs before the response starts streaming. A loading.tsx
// streams its fallback first and fixes the status at 200, so none may sit above a route's existence check: a
// loading.tsx wraps everything in its folder and below, except the layout.tsx beside it. A page below a loading.tsx
// may repeat the check only when that layout already makes it (the page's call is then a backstop, never the 404).
// scripts/check-not-found-status.mjs asserts the statuses themselves against a built store.
const app = join(dirname(fileURLToPath(import.meta.url)), "../app");
const files = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(folder, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(folder, entry.name)] : []);

test("no loading screen streams before a route decides that its address does not exist", () => {
  const checksExistence = (file: string) => existsSync(file) && /\bnotFound\(\)/.test(readFileSync(file, "utf8"));
  const checks = files(app).filter(checksExistence);
  assert.ok(checks.length >= 7, "the collection, product, policy, blog, article, page and order routes call notFound()");
  const streamedFirst = checks.flatMap((file) => {
    const above: string[] = [];
    for (let folder = dirname(file); folder.startsWith(app); folder = dirname(folder)) {
      const exempt = file === join(folder, "layout.tsx") || checksExistence(join(folder, "layout.tsx"));
      if (!exempt && existsSync(join(folder, "loading.tsx"))) above.push(relative(app, join(folder, "loading.tsx")));
    }
    return above.map((loading) => `${relative(app, file)} is wrapped by ${loading}`);
  });
  assert.deepEqual(streamedFirst, []);
  assert.equal(existsSync(join(app, "loading.tsx")), false, "a root loading.tsx would wrap every route");
});

test("the catalogue routes keep their loading screen below the layout that checks the address", () => {
  for (const route of ["collections/[handle]", "products/[handle]"]) {
    assert.ok(existsSync(join(app, route, "loading.tsx")), `${route} keeps the logo screen`);
    assert.match(readFileSync(join(app, route, "layout.tsx"), "utf8"), /notFound\(\)/, `${route}/layout.tsx decides existence`);
  }
});

const layoutProps = <K extends string>(key: K, value: string) =>
  ({ children: "page", params: Promise.resolve({ [key]: value } as Record<K, string>) });

test("an unknown collection is turned away by its layout, before the loading screen", async () => {
  await assert.rejects(CollectionLayout(layoutProps("handle", "zzz-missing")), /NEXT_HTTP_ERROR_FALLBACK;404/);
  await assert.rejects(CollectionLayout(layoutProps("handle", "constructor")), /NEXT_HTTP_ERROR_FALLBACK;404/);
  assert.equal(await CollectionLayout(layoutProps("handle", "all")), "page");
  assert.equal(await CollectionLayout(layoutProps("handle", "sofas")), "page");
});

const chair: Product = {
  id: "layout-chair", handle: "layout-chair", title: "Layout Chair", description: "A chair", category: "chairs", images: [],
  published: true, source: "keeri", sourceUpdatedAt: "2026-11-10T00:00:00Z",
  variants: [{ id: "v", title: "Standard", sku: "S", pricePaise: 100000, compareAtPaise: null, available: true, stockPolicy: "stocked" }],
};
async function withCatalogue(status: number, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => new Response(status === 200 ? JSON.stringify(chair) : "{}", { status })) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = previous; }
}

test("an unknown product is turned away by its layout, before the loading screen", async () => {
  await withCatalogue(404, async () => {
    await assert.rejects(ProductLayout(layoutProps("handle", "layout-missing")), /NEXT_HTTP_ERROR_FALLBACK;404/);
  });
  await withCatalogue(200, async () => {
    assert.equal(await ProductLayout(layoutProps("handle", "layout-chair")), "page");
  });
});

test("a catalogue outage is an error, not a missing product", async () => {
  await withCatalogue(503, async () => {
    await assert.rejects(ProductLayout(layoutProps("handle", "layout-outage")), (error: Error) => !/NEXT_HTTP_ERROR_FALLBACK/.test(String(error)));
  });
});
