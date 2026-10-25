import assert from "node:assert/strict";
import { test } from "node:test";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
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
  const plan = planCatalogueUnion(s, k, "maple");
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
