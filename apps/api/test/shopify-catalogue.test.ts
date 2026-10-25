import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptShopifyCatalogue } from "../src/shopify-catalogue.js";
import {
  shopifyFixture,
  shopifyPricedFixture,
} from "./fixtures/shopify-admin.js";
test("current Shopify draft listings retain true prices and stable preview IDs, always enquiry-only", () => {
  const p = adaptShopifyCatalogue(shopifyPricedFixture()).products[0]!;
  assert.equal(p.id, "preview-101");
  assert.equal(p.variants[0]!.id, "preview-201");
  assert.equal(p.variants[0]!.pricePaise, 12345);
  assert.equal(p.variants[0]!.available, false);
  assert.equal(p.sourceStatus, "DRAFT");
});
test("Shopify export rejects incomplete pagination, duplicate IDs, invalid prices and foreign media hosts", () => {
  const x = shopifyFixture();
  x.products[0]!.variants.pageInfo.hasNextPage = true;
  assert.throws(() => adaptShopifyCatalogue(x));
  const y = shopifyFixture();
  y.products.push(y.products[0]!);
  assert.throws(() => adaptShopifyCatalogue(y));
  const z = shopifyFixture();
  z.products[0]!.variants.nodes[0]!.price = "1.001";
  assert.throws(() => adaptShopifyCatalogue(z));
  const a = shopifyFixture();
  a.products[0]!.media.nodes[0]!.image.url = "https://private.example/a";
  assert.throws(() => adaptShopifyCatalogue(a));
});
test("unpriced/model-only Shopify listings stay representable; archived source excluded", () => {
  const x = shopifyFixture();
  x.products[0]!.variants.nodes[0]!.price = "0.00";
  assert.equal(
    adaptShopifyCatalogue(x).products[0]!.variants[0]!.pricePaise,
    null,
  );
  x.products[0]!.variants.nodes = [];
  assert.deepEqual(adaptShopifyCatalogue(x).products[0]!.variants, []);
  x.products[0]!.status = "ARCHIVED";
  assert.equal(adaptShopifyCatalogue(x).products.length, 0);
});

test("raw Admin prices without verified buyer-facing evidence are not displayed", () => {
  const input = shopifyFixture();
  assert.equal(
    adaptShopifyCatalogue(input).products[0]!.variants[0]!.pricePaise,
    null,
  );
});

test("verified INR public prices join by exact owned IDs, including compare-at and missing evidence", () => {
  const input = shopifyPricedFixture();
  input.products[0]!.variants.nodes[0]!.price = "100.00";
  const variant = adaptShopifyCatalogue(input).products[0]!.variants[0]!;
  assert.equal(variant.pricePaise, 12345);
  assert.equal(variant.compareAtPaise, 15000);
  input.publicPrices.products = [];
  const unknown = adaptShopifyCatalogue(input).products[0]!.variants[0]!;
  assert.equal(unknown.pricePaise, null);
  assert.equal(unknown.compareAtPaise, null);
});

test("public price evidence rejects foreign context, duplicate IDs, wrong ownership and stale capture", () => {
  for (const field of ["currency", "country", "origin"] as const) {
    const input = shopifyPricedFixture();
    input.publicPrices[field] = "foreign";
    assert.throws(() => adaptShopifyCatalogue(input));
  }
  const duplicate = shopifyPricedFixture();
  duplicate.publicPrices.products.push(duplicate.publicPrices.products[0]!);
  assert.throws(() => adaptShopifyCatalogue(duplicate));
  const wrong = shopifyPricedFixture();
  wrong.publicPrices.products[0]!.variants[0]!.id =
    "gid://shopify/ProductVariant/999";
  assert.throws(() => adaptShopifyCatalogue(wrong));
  const duplicateVariant = shopifyPricedFixture();
  duplicateVariant.publicPrices.products[0]!.variants.push(
    duplicateVariant.publicPrices.products[0]!.variants[0]!,
  );
  assert.throws(() => adaptShopifyCatalogue(duplicateVariant));
  const stale = shopifyPricedFixture();
  stale.publicPrices.capturedAt = "2026-10-24T10:00:00Z";
  assert.throws(() => adaptShopifyCatalogue(stale));
});
