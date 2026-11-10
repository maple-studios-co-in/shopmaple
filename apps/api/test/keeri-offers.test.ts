import assert from "node:assert/strict";
import { test } from "node:test";
import { productSchema } from "@shopmaple/contracts";
import { adaptKeeriExportV2 } from "../src/keeri.js";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { buildKeeriQuery, fetchKeeriExport, KeeriFetchError } from "../src/keeri-fetch.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

const offer = { label: "15% off", code: "DIWALI15", startsAt: "2026-10-20T00:00:00.000Z", endsAt: "2026-11-20T00:00:00.000Z" };
function fixtures() {
  const k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  return { s: shopifyFixture(), k };
}

test("the store asks Keeri for the offers level, the product-page level plus each model's offer", () => {
  assert.equal(
    buildKeeriQuery({ includeTaxonomy: true, includeContent: true, includeAttributes: true, includeProductPage: true, includeOffers: true }),
    "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1",
  );
  // offers=1 extends the product-page level and is never sent without it.
  assert.equal(buildKeeriQuery({ includeTaxonomy: true, includeContent: true, includeAttributes: true, includeOffers: true }), "?taxonomy=1&content=1&attributes=1");
});

test("a Keeri from before offers refuses the level with 400, reported so the sync can step down", async () => {
  await assert.rejects(
    fetchKeeriExport({
      endpoint: "https://keeri.example/api/storefront/catalogue/v2", trustedOrigin: "https://keeri.example", token: "t0ken", tenantId: "maple",
      schemaVersion: 2, includeTaxonomy: true, includeContent: true, includeAttributes: true, includeProductPage: true, includeOffers: true,
      fetch: (async () => Response.json({ error: "query_not_supported" }, { status: 400 })) as typeof fetch,
    }),
    (error: unknown) => error instanceof KeeriFetchError && error.code === "OFFERS_UNSUPPORTED",
  );
});

test("each model's offer, or Keeri's null, becomes the store product's offer; a lower level sends none", () => {
  const { k } = fixtures();
  (k.models[0] as any).offer = offer;
  assert.deepEqual(adaptKeeriExportV2(k, "maple").products[0]!.offer, offer);
  (k.models[0] as any).offer = null;
  assert.equal(adaptKeeriExportV2(k, "maple").products[0]!.offer, null);
  delete (k.models[0] as any).offer;
  assert.equal(adaptKeeriExportV2(k, "maple").products[0]!.offer, undefined);
});

test("an offer that is not Keeri's shape fails the export rather than showing a wrong code", () => {
  for (const bad of [
    { ...offer, code: "diwali15" },
    { ...offer, code: "SALE-20" },
    { ...offer, label: "" },
    { ...offer, label: "x".repeat(41) },
    { ...offer, endsAt: "next week" },
    { ...offer, endsAt: offer.startsAt },
    { ...offer, extra: true },
  ]) {
    const { k } = fixtures();
    (k.models[0] as any).offer = bad;
    assert.throws(() => adaptKeeriExportV2(k, "maple"), Error, JSON.stringify(bad));
  }
});

test("a listing merged from a Keeri model takes that model's offer, and the product contract keeps it", () => {
  const { s, k } = fixtures();
  (k.models[0] as any).offer = offer;
  const plan = planCatalogueUnion(s, k, "maple");
  assert.equal(plan.report.mergedModels, 1);
  const merged = plan.products[0]!;
  assert.equal(merged.id, "preview-101", "the Shopify listing");
  assert.deepEqual(merged.offer, offer);
  assert.deepEqual(productSchema.parse(merged).offer, offer);
  (k.models[0] as any).offer = null;
  assert.equal(planCatalogueUnion(s, k, "maple").products[0]!.offer, null);
});
