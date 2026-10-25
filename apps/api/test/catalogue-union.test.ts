import assert from "node:assert/strict";
import { test } from "node:test";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import {
  shopifyFixture,
  shopifyPricedFixture,
} from "./fixtures/shopify-admin.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
function fixtures() {
  const k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  return { s: shopifyFixture(), k };
}
test("exact SKU union preserves Shopify product/cart identities and missing presentation/price", () => {
  const { s, k } = fixtures();
  k.publicMedia = [];
  k.models[0]!.description = null;
  k.models[0]!.variants[0]!.prices = [];
  const plan = planCatalogueUnion(shopifyPricedFixture(), k, "maple");
  assert.equal(plan.products.length, 1);
  const p = plan.products[0]!;
  assert.equal(p.id, "preview-101");
  assert.equal(p.handle, "real-chair");
  assert.equal(p.description, "Actual description");
  assert.equal(p.images.length, 1);
  assert.equal(p.variants[0]!.id, "preview-201");
  assert.equal(p.variants[0]!.pricePaise, 12345);
  assert.equal(plan.report.mergedModels, 1);
});
test("conflicting exact evidence does not guess; unrelated Shopify variants remain", () => {
  const { s, k } = fixtures();
  s.products[0]!.variants.nodes.push({
    ...s.products[0]!.variants.nodes[0]!,
    id: "gid://shopify/ProductVariant/202",
    sku: "OTHER",
  });
  assert.equal(
    planCatalogueUnion(s, k, "maple").products[0]!.variants.length,
    2,
  );
  k.models[0]!.variants[0]!.shopifyVariantId = "202";
  k.models[0]!.variants[0]!.shopifyProductId = "101";
  const plan = planCatalogueUnion(s, k, "maple");
  assert.equal(plan.products.length, 2);
  assert.equal(plan.report.ambiguousModels, 1);
});
test("two Keeri models cannot claim the same Shopify product", () => {
  const { s, k } = fixtures();
  const second = structuredClone(k.models[0]!);
  second.id = "model2";
  second.variants[0]!.id = "variant2";
  second.variants[0]!.modelId = "model2";
  second.variants[0]!.sku = "OTHER";
  second.variants[0]!.shopifyProductId = "101";
  second.variants[0]!.shopifyVariantId = "201";
  second.media = [];
  second.variants[0]!.media = [];
  k.models.push(second);
  k.publication.push({
    ...k.publication[0]!,
    modelId: "model2",
    handle: "model-two",
  });
  const plan = planCatalogueUnion(s, k, "maple");
  assert.equal(plan.products.length, 3);
  assert.equal(plan.report.ambiguousModels, 2);
});

test("duplicate SKU evidence on either source never deduplicates distinct identities", () => {
  const { s, k } = fixtures();
  s.products[0]!.variants.nodes.push({
    ...s.products[0]!.variants.nodes[0]!,
    id: "gid://shopify/ProductVariant/202",
  });
  assert.equal(planCatalogueUnion(s, k, "maple").products.length, 2);
  const f = fixtures();
  f.k.models[0]!.variants.push({
    ...f.k.models[0]!.variants[0]!,
    id: "variant2",
    media: [],
  });
  assert.equal(planCatalogueUnion(f.s, f.k, "maple").products.length, 2);
});

test("a persisted identity from another Keeri tenant cannot merge through shared Shopify rows", () => {
  const { s, k } = fixtures();
  const prior = planCatalogueUnion(s, k, "maple");
  assert.throws(
    () =>
      planCatalogueUnion(s, k, "maple", {
        products: prior.products,
        productBindings: [
          {
            source: "keeri:other",
            externalId: "keeri:other:model1",
            targetId: "preview-101",
          },
        ],
        variantBindings: [],
      }),
    /FOREIGN_TENANT/,
  );
});

test("a reused SKU cannot override stable Shopify identifiers missing from the current snapshot", () => {
  for (const evidence of [
    { shopifyProductId: "999", shopifyVariantId: "9999" },
    { shopifyProductId: "101", shopifyVariantId: "9999" },
  ]) {
    const { s, k } = fixtures();
    Object.assign(k.models[0]!.variants[0]!, evidence);
    const plan = planCatalogueUnion(s, k, "maple");
    assert.equal(plan.products.length, 2);
    assert.equal(plan.report.ambiguousModels, 1);
  }
});

test("Keeri raw MRP with unknown tax basis is not presented as a customer price", () => {
  const { s, k } = fixtures();
  s.products = [];
  const result = planCatalogueUnion(s, k, "maple");
  assert.equal(result.products[0]!.variants[0]!.pricePaise, null);
});

test("raw Keeri MRP cannot overwrite verified public prices across repeated sync plans", () => {
  const { k } = fixtures();
  const s = shopifyPricedFixture();
  const first = planCatalogueUnion(s, k, "maple");
  assert.equal(first.products[0]!.variants[0]!.pricePaise, 12345);
  assert.equal(first.products[0]!.variants[0]!.compareAtPaise, 15000);
  const repeated = planCatalogueUnion(s, k, "maple", {
    products: first.products,
    productBindings: first.productBindings,
    variantBindings: first.variantBindings,
  });
  assert.equal(repeated.products[0]!.variants[0]!.pricePaise, 12345);
  s.publicPrices.products = [];
  const revoked = planCatalogueUnion(s, k, "maple", {
    products: repeated.products,
    productBindings: repeated.productBindings,
    variantBindings: repeated.variantBindings,
  });
  assert.equal(revoked.products[0]!.variants[0]!.pricePaise, null);
});

test("exactly mapped products retain Shopify display copy and photos over populated Keeri presentation", () => {
  const { k } = fixtures();
  k.publicMedia = [{ assetId: "photo1", url: "https://cdn.shopify.com/s/files/1/keeri.jpg" }];
  const plan = planCatalogueUnion(shopifyPricedFixture(), k, "maple");
  const p = plan.products[0]!;
  assert.equal(p.title, "Real chair");
  assert.equal(p.description, "Actual description");
  assert.deepEqual(p.images, ["https://cdn.shopify.com/s/files/1/chair.jpg"]);
  assert.equal(p.id, "preview-101");
  assert.equal(p.handle, "real-chair");
  assert.deepEqual(p.variants.map(v => [v.id, v.pricePaise, v.compareAtPaise, v.available, v.stockPolicy]),
    [["preview-201", 12345, 15000, false, "stocked"]]);
  assert.deepEqual(plan.variantBindings, [
    { source: "shopify", externalId: "preview-201", targetId: "preview-201" },
    { source: "keeri:maple", externalId: "keeri:maple:variant1", targetId: "preview-201" },
  ]);
});

test("empty current Shopify copy and photos are not replaced with Keeri or historical presentation", () => {
  const { k } = fixtures();
  k.publicMedia = [{ assetId: "photo1", url: "https://cdn.shopify.com/s/files/1/keeri.jpg" }];
  const s = shopifyPricedFixture();
  const prior = planCatalogueUnion(s, k, "maple");
  s.products[0]!.description = "";
  s.products[0]!.media.nodes = [];
  const next = planCatalogueUnion(s, k, "maple", {
    products: prior.products, productBindings: prior.productBindings, variantBindings: prior.variantBindings,
  });
  assert.equal(next.products[0]!.description, "");
  assert.deepEqual(next.products[0]!.images, []);
});

test("mapped variant labels preserve Shopify copy while unmatched same-name variants remain distinct and unpriced", () => {
  const { k } = fixtures();
  const extra = structuredClone(k.models[0]!.variants[0]!);
  extra.id = "variant2";
  extra.sku = "UNMATCHED-OAK";
  extra.variantName = "Oak";
  k.models[0]!.variants.push(extra);
  const plan = planCatalogueUnion(shopifyPricedFixture(), k, "maple");
  assert.deepEqual(plan.products[0]!.variants.map(v => [v.id, v.title, v.sku, v.pricePaise, v.available]), [
    ["preview-201", "Oak", "CHAIR-OAK", 12345, false],
    ["keeri:maple:variant2", "Oak", "UNMATCHED-OAK", null, false],
  ]);
});

test("Keeri-only products retain their current display copy and approved photos", () => {
  const { k } = fixtures();
  k.publicMedia = [{ assetId: "photo1", url: "https://cdn.shopify.com/s/files/1/keeri.jpg" }];
  const s = shopifyPricedFixture();
  s.products = [];
  s.publicPrices.products = [];
  const p = planCatalogueUnion(s, k, "maple").products[0]!;
  assert.equal(p.title, "Zyro");
  assert.equal(p.description, "Solid wood chair");
  assert.deepEqual(p.images, ["https://cdn.shopify.com/s/files/1/keeri.jpg"]);
  assert.equal(p.variants[0]!.title, "Linen / Walnut");
  assert.equal(p.variants[0]!.pricePaise, null);
  assert.equal(p.variants[0]!.available, false);
});
