import assert from "node:assert/strict";
import { test } from "node:test";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { keeriExportV2Schema } from "../src/keeri.js";
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

test("a derived Keeri type does not replace an explicit Shopify category on an exact match", () => {
  const { s, k } = fixtures();
  k.publication[0]!.category = null;
  k.models[0]!.productType = "table";
  assert.equal(planCatalogueUnion(s, k, "maple").products[0]!.category, "chairs");
  k.publication[0]!.category = "outdoors";
  assert.equal(planCatalogueUnion(s, k, "maple").products[0]!.category, "outdoors");
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

test("exactly mapped products retain Shopify copy and leading photos while appending approved Keeri photos", () => {
  const { k } = fixtures();
  k.publicMedia = [{ assetId: "photo1", url: "https://cdn.shopify.com/s/files/1/keeri.jpg" }];
  const plan = planCatalogueUnion(shopifyPricedFixture(), k, "maple");
  const p = plan.products[0]!;
  assert.equal(p.title, "Real chair");
  assert.equal(p.description, "Actual description");
  assert.deepEqual(p.images, ["https://cdn.shopify.com/s/files/1/chair.jpg", "https://cdn.shopify.com/s/files/1/keeri.jpg"]);
  assert.equal(p.id, "preview-101");
  assert.equal(p.handle, "real-chair");
  assert.deepEqual(p.variants.map(v => [v.id, v.pricePaise, v.compareAtPaise, v.available, v.stockPolicy]),
    [["preview-201", 12345, 15000, false, "stocked"]]);
  assert.deepEqual(plan.variantBindings, [
    { source: "shopify", externalId: "preview-201", targetId: "preview-201" },
    { source: "keeri:maple", externalId: "keeri:maple:variant1", targetId: "preview-201" },
  ]);
});

test("empty Shopify copy remains unchanged while current approved Keeri photos fill the gallery", () => {
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
  assert.deepEqual(next.products[0]!.images, ["https://cdn.shopify.com/s/files/1/keeri.jpg"]);
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

function keeriOnly(name = "Zyro") {
  const k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.name = name;
  k.publication[0]!.handle = "keeri-model1";
  return k;
}
const byKeeri = (plan: ReturnType<typeof planCatalogueUnion>) => plan.products.find((p) => p.source.startsWith("keeri:"))!;

test("a Keeri product's fallback address becomes its readable name, and the old address is kept for redirecting", () => {
  const plan = planCatalogueUnion(shopifyFixture(), keeriOnly("Zyro Lounge"), "maple");
  const p = byKeeri(plan);
  assert.equal(p.handle, "zyro-lounge");
  assert.deepEqual(plan.handleAliases, [{ handle: "keeri-model1", productId: p.id }]);
});

test("a readable name another product already uses gains the product type, then a number", () => {
  const taken = planCatalogueUnion(shopifyFixture(), keeriOnly("Real Chair"), "maple");
  assert.equal(byKeeri(taken).handle, "real-chair-chair", "Shopify already uses real-chair");
  const s = shopifyFixture();
  const k = keeriOnly("Real");
  k.models[0]!.productType = "chair";
  assert.equal(byKeeri(planCatalogueUnion(s, k, "maple")).handle, "real");
});

test("reviewed and already readable addresses never change, so links stay stable", () => {
  const reviewed = v2Fixture();
  reviewed.publicMedia = [];
  const plan = planCatalogueUnion(shopifyFixture(), reviewed, "maple");
  assert.equal(byKeeri(plan).handle, "zyro-chair");
  assert.deepEqual(plan.handleAliases, []);
  const first = byKeeri(planCatalogueUnion(shopifyFixture(), keeriOnly("Zyro"), "maple"));
  const again = planCatalogueUnion(shopifyFixture(), keeriOnly("Zyro Renamed"), "maple", {
    products: [first], productBindings: [{ source: first.source, externalId: "model1", targetId: first.id }], variantBindings: [],
  });
  assert.equal(byKeeri(again).handle, "zyro", "a later rename in Keeri keeps the published address");
  assert.deepEqual(again.handleAliases, []);
});

test("every variant gets a readable ?variant= value that is unique within its product", () => {
  const k = keeriOnly();
  const base = k.models[0]!.variants[0]!;
  k.models[0]!.variants = [base, { ...base, id: "variant2", sku: "CH-ZYRO-2" }, { ...base, id: "variant3", sku: "CH-ZYRO-3", variantName: "Teal / Oak" }];
  const slugs = byKeeri(planCatalogueUnion(shopifyFixture(), k, "maple")).variants.map((v) => v.slug);
  assert.deepEqual(slugs, ["linen-walnut", "linen-walnut-2", "teal-oak"]);
});

test("a variant photo from an unapproved host is refused like a product photo", () => {
  const k = keeriOnly();
  const variant = k.models[0]!.variants[0]!;
  variant.media = [{ id: "photo2", tenantId: "maple", modelId: null, variantId: variant.id, stage: "approved", storageKey: "public-media:photo2", supersededAt: null, position: 0 }];
  k.publicMedia = [{ assetId: "photo2", url: "https://store.maplefurnishers.com/media/keeri/photo2.webp" }];
  assert.deepEqual(byKeeri(planCatalogueUnion(shopifyFixture(), k, "maple")).variants[0]!.images, ["https://store.maplefurnishers.com/media/keeri/photo2.webp"]);
  k.publicMedia = [{ assetId: "photo2", url: "https://elsewhere.example/photo2.webp" }];
  assert.throws(() => planCatalogueUnion(shopifyFixture(), k, "maple"), /UNSUPPORTED_PUBLIC_MEDIA/);
});

const existingOf = (products: ReturnType<typeof planCatalogueUnion>["products"], handleAliases: { handle: string; productId: string }[] = []) => ({
  products, handleAliases,
  productBindings: products.filter((p) => p.source.startsWith("keeri:")).map((p) => ({ source: p.source, externalId: p.id.split(":").at(-1)!, targetId: p.id })),
  variantBindings: products.filter((p) => p.source.startsWith("keeri:")).flatMap((p) => p.variants.map((v) => ({ source: p.source, externalId: v.id.split(":").at(-1)!, targetId: v.id }))),
});

test("a rename never takes an address an unpublished product or an earlier alias still holds", () => {
  const retired = { ...planCatalogueUnion(shopifyFixture(), keeriOnly("Other"), "maple").products.find((p) => !p.source.startsWith("keeri:"))!, id: "preview-999", handle: "alain", published: false };
  const plan = planCatalogueUnion(shopifyFixture(), keeriOnly("Alain"), "maple", existingOf([retired]));
  assert.equal(byKeeri(plan).handle, "alain-chair");
  const aliased = planCatalogueUnion(shopifyFixture(), keeriOnly("Zyro"), "maple", existingOf([], [{ handle: "zyro", productId: "preview-101" }]));
  assert.equal(byKeeri(aliased).handle, "zyro-chair");
});

test("a merged product drops variant photos from unapproved hosts instead of failing the sync", () => {
  const { s, k } = fixtures();
  const variant = k.models[0]!.variants[0]!;
  variant.media = [{ id: "photo9", tenantId: "maple", modelId: null, variantId: variant.id, stage: "approved", storageKey: "public-media:photo9", supersededAt: null, position: 0 }];
  k.publicMedia = [{ assetId: "photo9", url: "https://media.example.com/photo9.webp" }];
  const plan = planCatalogueUnion(s, k, "maple");
  assert.equal(plan.report.mergedModels, 1);
  assert.deepEqual(plan.products[0]!.variants[0]!.images, []);
});

test("a variant keeps its ?variant= value when its title changes, and a new variant never reuses one", () => {
  const k = keeriOnly();
  const base = k.models[0]!.variants[0]!;
  k.models[0]!.variants = [base, { ...base, id: "variant2", sku: "CH-ZYRO-2", variantName: "Teal / Oak" }];
  const first = byKeeri(planCatalogueUnion(shopifyFixture(), k, "maple"));
  assert.deepEqual(first.variants.map((v) => v.slug), ["linen-walnut", "teal-oak"]);
  const later = keeriOnly();
  later.models[0]!.variants = [{ ...base, variantName: "Teal / Oak" }, { ...base, id: "variant2", sku: "CH-ZYRO-2", variantName: "Sand / Ash" }, { ...base, id: "variant3", sku: "CH-ZYRO-3", variantName: "Linen / Walnut" }];
  const again = byKeeri(planCatalogueUnion(shopifyFixture(), later, "maple", existingOf([first])));
  assert.deepEqual(again.variants.map((v) => v.slug), ["linen-walnut", "teal-oak", "linen-walnut-2"]);
});

test("a name with no letters falls back to the type and Keeri id, and a name that merely starts with keeri stays put", () => {
  assert.equal(byKeeri(planCatalogueUnion(shopifyFixture(), keeriOnly("!!!"), "maple")).handle, "chair-model1");
  const first = planCatalogueUnion(shopifyFixture(), keeriOnly("Keeri Lounge"), "maple");
  assert.equal(byKeeri(first).handle, "keeri-lounge");
  const again = planCatalogueUnion(shopifyFixture(), keeriOnly("Keeri Lounge"), "maple", existingOf(first.products));
  assert.equal(byKeeri(again).handle, "keeri-lounge");
  assert.deepEqual(again.handleAliases, []);
});

test("a variant named by many long options keeps a title within the limit", () => {
  const k = keeriExportV2Schema.parse({ ...keeriOnly(), models: keeriOnly().models.map((m) => ({ ...m, variants: m.variants.map((v) => ({ ...v, variantName: null,
    attributes: Array.from({ length: 20 }, (_, i) => ({ axis: `axis${i}`, value: "x".repeat(200) })) })) })) });
  const v = byKeeri(planCatalogueUnion(shopifyFixture(), k, "maple")).variants[0]!;
  assert.ok(v.title.length <= 300);
});
