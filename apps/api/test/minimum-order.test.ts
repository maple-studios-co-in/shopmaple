import assert from "node:assert/strict";
import { test } from "node:test";
import { minimumOrderShortfalls, minimumToAdd, productSchema } from "@shopmaple/contracts";
import { adaptKeeriExportV2 } from "../src/keeri.js";
import { buildKeeriQuery, fetchKeeriExport, KeeriFetchError } from "../src/keeri-fetch.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

const richest = { includeTaxonomy: true, includeContent: true, includeAttributes: true, includeProductPage: true, includeOffers: true, includeFreeDelivery: true, includeMinOrder: true };

test("the store asks Keeri for each design's minimum order at the level after free delivery", () => {
  assert.equal(buildKeeriQuery(richest), "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1&minOrder=1");
  assert.equal(buildKeeriQuery({ ...richest, includeFreeDelivery: false }), "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1");
});

test("a Keeri from before minimum orders refuses the level with 400, reported so the sync steps down", async () => {
  await assert.rejects(
    fetchKeeriExport({
      endpoint: "https://keeri.example/api/storefront/catalogue/v2", trustedOrigin: "https://keeri.example", token: "t0ken", tenantId: "maple",
      schemaVersion: 2, ...richest,
      fetch: (async () => Response.json({ error: "query_not_supported" }, { status: 400 })) as typeof fetch,
    }),
    (error: unknown) => error instanceof KeeriFetchError && error.code === "MIN_ORDER_UNSUPPORTED",
  );
});

test("a design's minimum order reaches the product; none, or a lower level, means no minimum", () => {
  const k = v2Fixture() as any;
  k.publicMedia = [];
  k.models[0].minOrderQuantity = 4;
  assert.equal(adaptKeeriExportV2(k, "maple").products[0]!.minOrderQuantity, 4);
  k.models[0].minOrderQuantity = null;
  assert.equal(adaptKeeriExportV2(k, "maple").products[0]!.minOrderQuantity, null);
  delete k.models[0].minOrderQuantity;
  assert.equal(adaptKeeriExportV2(k, "maple").products[0]!.minOrderQuantity, undefined);
  for (const bad of [1, 21, 2.5, "4"]) {
    k.models[0].minOrderQuantity = bad;
    assert.throws(() => adaptKeeriExportV2(k, "maple"), Error, JSON.stringify(bad));
  }
  assert.equal(productSchema.shape.minOrderQuantity.safeParse(30).success, false);
});

test("the bag's shortfalls count every finish of a design together", () => {
  const items = [
    { handle: "alain", title: "Alain", quantity: 1, minOrderQuantity: 4 },
    { handle: "alain", title: "Alain", quantity: 2, minOrderQuantity: 4 },
    { handle: "kyro", title: "Kyro", quantity: 2, minOrderQuantity: 2 },
    { handle: "nola", title: "Nola", quantity: 1, minOrderQuantity: null },
    { handle: "orlo", title: "Orlo", quantity: 1 },
  ];
  assert.deepEqual(minimumOrderShortfalls(items), [{ handle: "alain", title: "Alain", minimum: 4, quantity: 3 }]);
  assert.deepEqual(minimumOrderShortfalls(items.slice(2)), []);
});

test("the product page adds enough to meet the minimum, counting what is already in the bag", () => {
  assert.equal(minimumToAdd(4, 0), 4);
  assert.equal(minimumToAdd(4, 3), 1);
  assert.equal(minimumToAdd(4, 6), 1);
  assert.equal(minimumToAdd(null, 0), 1);
  assert.equal(minimumToAdd(undefined, 2), 1);
});
