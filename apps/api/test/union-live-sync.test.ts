import assert from "node:assert/strict";
import { test } from "node:test";
import { pullCatalogueUnion } from "../src/union-live-sync.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
function options() {
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, {taxonomy: { category: "Dining", subCategory: null }, content: {details:null, materials:null, dimensions:null, careInstructions:null, warranty:null}});
  return {
    origin: "https://keeri.example",
    token: "synthetic-only",
    tenantId: "maple",
    shopify: shopifyFixture(),
    now: new Date(k.capturedAt),
    fetch: async (input: URL | RequestInfo) => {
      assert.equal(
        String(input),
        "https://keeri.example/api/storefront/catalogue/v2?taxonomy=1&content=1&attributes=1&compareAt=1",
      );
      return new Response(JSON.stringify(k), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}
test("live V2 union defaults to dry-run and reports pinned Shopify freshness separately", async () => {
  const result = await pullCatalogueUnion(options());
  assert.equal(result.totalProducts, 2);
  assert.equal(result.dryRun, true);
  assert.equal(result.shopifyRefreshMode, "pinned-snapshot");
  assert.equal(result.checkoutEnabled, false);
});
test("live union rejects unsafe DB before sending credentials and rejects stale snapshots", async () => {
  await assert.rejects(
    pullCatalogueUnion({
      ...options(),
      apply: true,
      databaseUrl: "postgresql://localhost/production",
    }),
    /ISOLATED_DATABASE/,
  );
  await assert.rejects(
    pullCatalogueUnion({ ...options(), now: new Date("2026-10-26T00:00:00Z") }),
    /STALE/,
  );
});

test("a Keeri that does not offer variant options yet is asked again without them, so the sync never freezes", async () => {
  const base = options();
  const asked: string[] = [];
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, { taxonomy: { category: "Dining", subCategory: null }, content: { details: null, materials: null, dimensions: null, careInstructions: null, warranty: null } });
  const result = await pullCatalogueUnion({ ...base, fetch: async (input: URL | RequestInfo) => {
    asked.push(String(input));
    if (String(input).includes("attributes=1")) return Response.json({ error: "query_not_supported" }, { status: 400 });
    return new Response(JSON.stringify(k), { headers: { "content-type": "application/json" } });
  } });
  assert.equal(result.totalProducts, 2);
  assert.deepEqual(asked.map((url) => new URL(url).search), ["?taxonomy=1&content=1&attributes=1&compareAt=1", "?taxonomy=1&content=1&attributes=1", "?taxonomy=1&content=1"]);
  await assert.rejects(pullCatalogueUnion({ ...base, fetch: async () => Response.json({ error: "unauthorized" }, { status: 401 }) }), "other refusals are not retried");
});

test("a Keeri that offers options but not compare-at prices is asked again with options only", async () => {
  const asked: string[] = [];
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, { taxonomy: { category: "Dining", subCategory: null }, content: { details: null, materials: null, dimensions: null, careInstructions: null, warranty: null } });
  await pullCatalogueUnion({ ...options(), fetch: async (input: URL | RequestInfo) => {
    asked.push(String(input));
    if (String(input).includes("compareAt=1")) return Response.json({ error: "query_not_supported" }, { status: 400 });
    return new Response(JSON.stringify(k), { headers: { "content-type": "application/json" } });
  } });
  assert.deepEqual(asked.map((url) => new URL(url).search), ["?taxonomy=1&content=1&attributes=1&compareAt=1", "?taxonomy=1&content=1&attributes=1"]);
});
