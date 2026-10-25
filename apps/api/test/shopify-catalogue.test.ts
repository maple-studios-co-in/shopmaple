import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptShopifyCatalogue } from "../src/shopify-catalogue.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
test("current Shopify draft listings retain true prices and stable preview IDs, always enquiry-only", () => {
  const p = adaptShopifyCatalogue(shopifyFixture()).products[0]!;
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
