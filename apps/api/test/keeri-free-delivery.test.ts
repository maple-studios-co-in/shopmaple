import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { productCardSchema, productSchema, toProductCard } from "@shopmaple/contracts";
import { catalogueCard } from "../src/catalogue-view.js";
import { adaptKeeriExportV2 } from "../src/keeri.js";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { buildKeeriQuery, fetchKeeriExport, KeeriFetchError } from "../src/keeri-fetch.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

/** The fixture Keeri checks its own export against (Keeri docs/contracts/shopmaple-catalogue-v2-free-delivery.json). */
const shared = () => JSON.parse(readFileSync(new URL("../../../docs/contracts/shopmaple-catalogue-v2-free-delivery.json", import.meta.url), "utf8"));
const richest = { includeTaxonomy: true, includeContent: true, includeAttributes: true, includeProductPage: true, includeOffers: true, includeFreeDelivery: true };

test("the store asks Keeri for the free-delivery level, the offers level plus each variant's tick", () => {
  assert.equal(buildKeeriQuery(richest), "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1");
  // freeDelivery=1 extends the offers level and is never sent without it.
  assert.equal(buildKeeriQuery({ ...richest, includeOffers: false }), "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1");
});

test("a Keeri from before the free-delivery level refuses it with 400, reported so the sync can step down", async () => {
  await assert.rejects(
    fetchKeeriExport({
      endpoint: "https://keeri.example/api/storefront/catalogue/v2", trustedOrigin: "https://keeri.example", token: "t0ken", tenantId: "maple",
      schemaVersion: 2, ...richest,
      fetch: (async () => Response.json({ error: "query_not_supported" }, { status: 400 })) as typeof fetch,
    }),
    (error: unknown) => error instanceof KeeriFetchError && error.code === "FREE_DELIVERY_UNSUPPORTED",
  );
});

test("Keeri's shared fixture reads: the ticked variant ships free, the other does not", () => {
  const product = adaptKeeriExportV2(shared(), "tenant-demo").products.find((p) => p.variants.length)!;
  assert.deepEqual(product.variants.map((v) => [v.id, v.freeDelivery]), [
    ["keeri:tenant-demo:variant-demo", true],
    ["keeri:tenant-demo:variant-demo-walnut", false],
  ]);
});

test("an export from a lower level, which carries no tick, ships nothing free", () => {
  const k = v2Fixture();
  k.publicMedia = [];
  assert.deepEqual(adaptKeeriExportV2(k, "maple").products.flatMap((p) => p.variants.map((v) => v.freeDelivery)).filter(Boolean), []);
});

test("a tick that is not true or false fails the export rather than promising free delivery", () => {
  for (const bad of ["true", 1, null, { all: true }]) {
    const k = v2Fixture();
    k.publicMedia = [];
    (k.models[0]!.variants[0] as any).freeDelivery = bad;
    assert.throws(() => adaptKeeriExportV2(k, "maple"), Error, JSON.stringify(bad));
  }
});

test("a former Shopify listing takes its Keeri variant's tick, and the product contract keeps it", () => {
  const k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  (k.models[0]!.variants[0] as any).freeDelivery = true;
  const existing = {
    products: [productSchema.parse({ id: "preview-101", handle: "real-chair", title: "Real chair", description: "", category: "chairs", images: [], published: true,
      source: "shopify-preview", sourceUpdatedAt: "2026-10-25T09:00:00Z",
      variants: [{ id: "preview-201", title: "Oak", sku: null, pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" }] })],
    productBindings: [{ source: "keeri:maple", externalId: "keeri:maple:model1", targetId: "preview-101" }],
    variantBindings: [{ source: "keeri:maple", externalId: "keeri:maple:variant1", targetId: "preview-201" }],
  };
  const merged = planCatalogueUnion(k, "maple", existing).products[0]!.variants.find((v) => v.id === "preview-201")!;
  assert.equal(merged.freeDelivery, true);
  assert.equal(productSchema.shape.variants.element.parse(merged).freeDelivery, true);
  (k.models[0]!.variants[0] as any).freeDelivery = false;
  assert.equal(planCatalogueUnion(k, "maple", existing).products[0]!.variants.find((v) => v.id === "preview-201")!.freeDelivery, false);
});

const piece = { id: "p", handle: "oak-chair", title: "Oak chair", images: ["https://example.com/a.jpg"], category: "chairs" };
const option = (title: string, freeDelivery: boolean, buyable = true) =>
  ({ title, pricePaise: 250000 as number | null, compareAtPaise: null, available: buyable, stockPolicy: "made_to_order", freeDelivery });

test("a card says free delivery only when every variant a shopper can buy ships free (the card routes decide)", () => {
  assert.equal(catalogueCard({ ...piece, variants: [option("Oak", true), option("Ash", true)] }).freeDelivery, true);
  assert.equal(catalogueCard({ ...piece, variants: [option("Oak", true)] }).freeDelivery, true);
  // An enquiry-only finish cannot be checked out, so it does not hold the badge back.
  assert.equal(catalogueCard({ ...piece, variants: [option("Oak", true), option("Ash", false, false)] }).freeDelivery, true);
  for (const variants of [
    [option("Oak", true), option("Ash", false)],
    [option("Oak", false)],
    // Ticked, but nothing here can be bought: checkout would never apply it.
    [option("Oak", true, false)],
    [{ ...option("Oak", true), pricePaise: null }],
    [{ ...option("Oak", true), stockPolicy: "dropship" }],
    [],
  ]) assert.equal("freeDelivery" in catalogueCard({ ...piece, variants }), false, JSON.stringify(variants));
});

test("the card contract takes the badge only as true, and older payloads without it still read", () => {
  const card = toProductCard({ ...piece, variants: [option("Oak", false)] });
  assert.equal(productCardSchema.safeParse(card).success, true);
  assert.equal(productCardSchema.safeParse(catalogueCard({ ...piece, variants: [option("Oak", true)] })).success, true);
  assert.equal(productCardSchema.safeParse({ ...card, freeDelivery: true }).success, true);
  for (const bad of [false, "true", 1, null])
    assert.equal(productCardSchema.safeParse({ ...card, freeDelivery: bad }).success, false, JSON.stringify(bad));
});
