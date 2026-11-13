import assert from "node:assert/strict";
import { test } from "node:test";
import { pullCatalogueUnion } from "../src/union-live-sync.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
function options() {
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, {taxonomy: { category: "Dining", subCategory: null }, content: {details:null, materials:null, dimensions:null, careInstructions:null, warranty:null}});
  return {
    origin: "https://keeri.example",
    token: "synthetic-only",
    tenantId: "maple",
    now: new Date(k.capturedAt),
    fetch: async (input: URL | RequestInfo) => {
      assert.equal(
        String(input),
        "https://keeri.example/api/storefront/catalogue/v2?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1",
      );
      return new Response(JSON.stringify(k), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}
test("live V2 sync reads Keeri alone, with no Shopify export, and defaults to a dry run", async () => {
  const result = await pullCatalogueUnion(options());
  assert.equal(result.totalProducts, 1);
  assert.equal(result.keeriProducts, 1);
  assert.equal(result.formerShopifyListings, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.checkoutEnabled, false);
  assert.equal("shopifyRefreshMode" in result, false);
  assert.equal("shopifySnapshotCapturedAt" in result, false);
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
  assert.equal(result.totalProducts, 1);
  // The offers and product-page levels need variant options too, so such a Keeri refuses all three before the plain level.
  assert.deepEqual(asked.map((url) => new URL(url).search), ["?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1", "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1", "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1", "?taxonomy=1&content=1&attributes=1", "?taxonomy=1&content=1"]);
  await assert.rejects(pullCatalogueUnion({ ...base, fetch: async () => Response.json({ error: "unauthorized" }, { status: 401 }) }), "other refusals are not retried");
});

test("an older Keeri without the product-page level steps the sync down to variant options", async () => {
  const asked: string[] = [];
  const base = options();
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, {taxonomy: { category: "Dining", subCategory: null }, content: {details:null, materials:null, dimensions:null, careInstructions:null, warranty:null}});
  const result = await pullCatalogueUnion({
    ...base,
    fetch: async (input: URL | RequestInfo) => {
      asked.push(String(input).split("?")[1]!);
      if (String(input).includes("productPage=1"))
        return new Response(JSON.stringify({ error: "query_not_supported" }), { status: 400, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(k), { headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(asked, ["taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1", "taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1", "taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1", "taxonomy=1&content=1&attributes=1"]);
  assert.equal(result.totalProducts, 1);
});

test("a Keeri from before offers steps the sync down to the product-page level, and the store shows no offer", async () => {
  const asked: string[] = [];
  const base = options();
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, { taxonomy: { category: "Dining", subCategory: null }, content: { details: null, materials: null, dimensions: null, careInstructions: null, warranty: null } });
  const result = await pullCatalogueUnion({
    ...base,
    fetch: async (input: URL | RequestInfo) => {
      asked.push(String(input).split("?")[1]!);
      if (String(input).includes("offers=1")) return Response.json({ error: "query_not_supported" }, { status: 400 });
      return new Response(JSON.stringify(k), { headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(asked, ["taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1", "taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1", "taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1"]);
  assert.equal(result.totalProducts, 1);
});

test("a Keeri from before the free-delivery level steps the sync down to the offers level, and nothing ships free", async () => {
  const asked: string[] = [];
  const base = options();
  const k = v2Fixture();
  k.publicMedia = [];
  for (const model of k.models) Object.assign(model, { taxonomy: { category: "Dining", subCategory: null }, content: { details: null, materials: null, dimensions: null, careInstructions: null, warranty: null } });
  const result = await pullCatalogueUnion({
    ...base,
    fetch: async (input: URL | RequestInfo) => {
      asked.push(String(input).split("?")[1]!);
      if (String(input).includes("freeDelivery=1")) return Response.json({ error: "query_not_supported" }, { status: 400 });
      return new Response(JSON.stringify(k), { headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(asked, ["taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1", "taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1"]);
  assert.equal(result.totalProducts, 1);
});
