import assert from "node:assert/strict";
import { test } from "node:test";
import type { Product } from "@shopmaple/contracts";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { keeriExportV2Schema } from "../src/keeri.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
const keeriPhoto = (id: string) => `https://store.maplefurnishers.com/media/keeri/${id}.webp`;
function fixture() {
  const k = v2Fixture();
  k.publicMedia = [];
  return k;
}
/** A former merged listing as earlier union syncs stored it: Shopify's id, address, copy and photos. */
function formerListing(): Product {
  return {
    id: "preview-101", handle: "real-chair", title: "Real chair", description: "Actual description",
    pdpContent: null, category: "chairs", images: ["https://cdn.shopify.com/s/files/1/chair.jpg"], published: true,
    source: "shopify-preview", sourceUpdatedAt: "2026-10-25T09:00:00Z",
    variants: [
      { id: "preview-201", title: "Oak", sku: "CHAIR-OAK", pricePaise: 12345, compareAtPaise: 15000, available: false, stockPolicy: "unverified", slug: "oak" },
      { id: "preview-202", title: "Ash", sku: "CHAIR-ASH", pricePaise: 12345, compareAtPaise: null, available: false, stockPolicy: "unverified", slug: "ash" },
    ],
  } as Product;
}
const merged = () => ({
  products: [formerListing()],
  productBindings: [{ source: "keeri:maple", externalId: "keeri:maple:model1", targetId: "preview-101" }],
  variantBindings: [{ source: "keeri:maple", externalId: "keeri:maple:variant1", targetId: "preview-201" }],
});

test("the catalogue is Keeri's alone: one store product per published Keeri product, at Keeri's store price", () => {
  const plan = planCatalogueUnion(fixture(), "maple");
  assert.equal(plan.products.length, 1);
  const p = plan.products[0]!;
  assert.equal(p.id, "keeri:maple:model1");
  assert.equal(p.source, "keeri:maple");
  assert.equal(p.variants[0]!.pricePaise, 1234567);
  assert.deepEqual(plan.report, { keeriProducts: 1, formerShopifyListings: 0, keeriPricedVariants: 1, totalProducts: 1, totalVariants: 1 });
});

test("a former Shopify listing keeps its store id, address and variant ids but shows Keeri's copy, photos and price", () => {
  const k = fixture();
  k.publicMedia = [{ assetId: "photo1", url: keeriPhoto("photo1") }];
  const plan = planCatalogueUnion(k, "maple", merged());
  assert.equal(plan.products.length, 1);
  const p = plan.products[0]!;
  assert.equal(p.id, "preview-101");
  assert.equal(p.handle, "real-chair");
  assert.equal(p.title, "Zyro");
  assert.equal(p.description, "Solid wood chair");
  assert.equal(p.pdpContent, null);
  assert.deepEqual(p.images, [keeriPhoto("photo1")]);
  assert.equal(p.source, "keeri:maple");
  assert.deepEqual(p.variants.map((v) => [v.id, v.title, v.pricePaise, v.slug]), [["preview-201", "Linen / Walnut", 1234567, "oak"]],
    "the Shopify-only variant is left out, and the bound one keeps its ?variant= value");
  assert.deepEqual(plan.handleAliases, []);
  assert.equal(plan.report.formerShopifyListings, 1);
});

test("a former listing's variant without Keeri's store price shows no price and cannot be bought", () => {
  const k = fixture();
  k.models[0]!.variants[0]!.prices = [];
  const v = planCatalogueUnion(k, "maple", merged()).products[0]!.variants[0]!;
  assert.equal(v.pricePaise, null, "Shopify's old price is never kept");
  assert.equal(v.compareAtPaise, null);
  assert.equal(v.available, false);
});

test("a former listing drops photos from unapproved hosts instead of failing the sync", () => {
  const k = fixture();
  const variant = k.models[0]!.variants[0]!;
  variant.media = [{ id: "photo9", tenantId: "maple", modelId: null, variantId: variant.id, stage: "approved", storageKey: "public-media:photo9", supersededAt: null, position: 0 }];
  k.publicMedia = [{ assetId: "photo1", url: "https://cdn.shopify.com/s/files/1/keeri.jpg" }, { assetId: "photo9", url: "https://media.example.com/photo9.webp" }];
  const p = planCatalogueUnion(k, "maple", merged()).products[0]!;
  assert.deepEqual(p.images, []);
  assert.deepEqual(p.variants[0]!.images, []);
});

test("a new Keeri product with a Shopify-hosted photo is refused, as is any other host", () => {
  for (const url of ["https://cdn.shopify.com/s/files/1/keeri.jpg", "https://shop.maplefurnishers.com/cdn/shop/files/keeri.jpg"]) {
    const k = fixture();
    k.publicMedia = [{ assetId: "photo1", url }];
    assert.throws(() => planCatalogueUnion(k, "maple"), /UNSUPPORTED_PUBLIC_MEDIA/, url);
  }
});

test("a recorded identity is never shared: two Keeri products bound to one store product fail", () => {
  const k = fixture();
  const second = structuredClone(k.models[0]!);
  second.id = "model2";
  second.variants[0]!.id = "variant2";
  second.variants[0]!.modelId = "model2";
  second.variants[0]!.sku = "OTHER";
  second.media = [];
  second.variants[0]!.media = [];
  k.models.push(second);
  k.publication.push({ ...k.publication[0]!, modelId: "model2", handle: "model-two" });
  const existing = merged();
  existing.productBindings.push({ source: "keeri:maple", externalId: "keeri:maple:model2", targetId: "preview-101" });
  assert.throws(() => planCatalogueUnion(k, "maple", existing), /EXISTING_IDENTITY_CONFLICT/);
});

test("a variant binding that points into another store product fails rather than moving the variant", () => {
  const existing = merged();
  const other = { ...formerListing(), id: "preview-301", handle: "other", variants: [{ ...formerListing().variants[0]!, id: "preview-401", slug: "oak" }] };
  existing.products.push(other);
  existing.variantBindings = [{ source: "keeri:maple", externalId: "keeri:maple:variant1", targetId: "preview-401" }];
  assert.throws(() => planCatalogueUnion(fixture(), "maple", existing), /EXISTING_IDENTITY_CONFLICT/);
});

test("a persisted identity from another Keeri tenant is refused", () => {
  assert.throws(
    () => planCatalogueUnion(fixture(), "maple", {
      products: [formerListing()],
      productBindings: [{ source: "keeri:other", externalId: "keeri:other:model1", targetId: "preview-101" }],
      variantBindings: [],
    }),
    /FOREIGN_TENANT/,
  );
});

test("a product of another source is never overwritten through a binding", () => {
  const existing = merged();
  existing.products = [{ ...formerListing(), source: "other" }];
  assert.throws(() => planCatalogueUnion(fixture(), "maple", existing), /FOREIGN_SOURCE_IDENTITY/);
});

test("Keeri-only products retain their current display copy and approved photos", () => {
  const k = fixture();
  k.publicMedia = [{ assetId: "photo1", url: keeriPhoto("photo1") }];
  const p = planCatalogueUnion(k, "maple").products[0]!;
  assert.equal(p.title, "Zyro");
  assert.equal(p.description, "Solid wood chair");
  assert.deepEqual(p.images, [keeriPhoto("photo1")]);
  assert.equal(p.variants[0]!.title, "Linen / Walnut");
  assert.equal(p.variants[0]!.pricePaise, 1234567);
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
  const plan = planCatalogueUnion(keeriOnly("Zyro Lounge"), "maple");
  const p = byKeeri(plan);
  assert.equal(p.handle, "zyro-lounge");
  assert.deepEqual(plan.handleAliases, [{ handle: "keeri-model1", productId: p.id }]);
});

test("a readable name another product already uses gains the product type, then a number", () => {
  const holder = { ...formerListing(), published: false };
  const taken = planCatalogueUnion(keeriOnly("Real Chair"), "maple", { products: [holder], productBindings: [], variantBindings: [] });
  assert.equal(byKeeri(taken).handle, "real-chair-chair", "a former listing still holds real-chair");
  const k = keeriOnly("Real");
  k.models[0]!.productType = "chair";
  assert.equal(byKeeri(planCatalogueUnion(k, "maple")).handle, "real");
});

test("reviewed and already readable addresses never change, so links stay stable", () => {
  const reviewed = v2Fixture();
  reviewed.publicMedia = [];
  const plan = planCatalogueUnion(reviewed, "maple");
  assert.equal(byKeeri(plan).handle, "zyro-chair");
  assert.deepEqual(plan.handleAliases, []);
  const first = byKeeri(planCatalogueUnion(keeriOnly("Zyro"), "maple"));
  const again = planCatalogueUnion(keeriOnly("Zyro Renamed"), "maple", {
    products: [first], productBindings: [{ source: first.source, externalId: "model1", targetId: first.id }], variantBindings: [],
  });
  assert.equal(byKeeri(again).handle, "zyro", "a later rename in Keeri keeps the published address");
  assert.deepEqual(again.handleAliases, []);
});

test("every variant gets a readable ?variant= value that is unique within its product", () => {
  const k = keeriOnly();
  const base = k.models[0]!.variants[0]!;
  k.models[0]!.variants = [base, { ...base, id: "variant2", sku: "CH-ZYRO-2" }, { ...base, id: "variant3", sku: "CH-ZYRO-3", variantName: "Teal / Oak" }];
  const slugs = byKeeri(planCatalogueUnion(k, "maple")).variants.map((v) => v.slug);
  assert.deepEqual(slugs, ["linen-walnut", "linen-walnut-2", "teal-oak"]);
});

test("a variant photo from an unapproved host is refused like a product photo", () => {
  const k = keeriOnly();
  const variant = k.models[0]!.variants[0]!;
  variant.media = [{ id: "photo2", tenantId: "maple", modelId: null, variantId: variant.id, stage: "approved", storageKey: "public-media:photo2", supersededAt: null, position: 0 }];
  k.publicMedia = [{ assetId: "photo2", url: "https://store.maplefurnishers.com/media/keeri/photo2.webp" }];
  assert.deepEqual(byKeeri(planCatalogueUnion(k, "maple")).variants[0]!.images, ["https://store.maplefurnishers.com/media/keeri/photo2.webp"]);
  k.publicMedia = [{ assetId: "photo2", url: "https://elsewhere.example/photo2.webp" }];
  assert.throws(() => planCatalogueUnion(k, "maple"), /UNSUPPORTED_PUBLIC_MEDIA/);
});

const existingOf = (products: ReturnType<typeof planCatalogueUnion>["products"], handleAliases: { handle: string; productId: string }[] = []) => ({
  products, handleAliases,
  productBindings: products.filter((p) => p.source.startsWith("keeri:")).map((p) => ({ source: p.source, externalId: p.id.split(":").at(-1)!, targetId: p.id })),
  variantBindings: products.filter((p) => p.source.startsWith("keeri:")).flatMap((p) => p.variants.map((v) => ({ source: p.source, externalId: v.id.split(":").at(-1)!, targetId: v.id }))),
});

test("a rename never takes an address an unpublished product or an earlier alias still holds", () => {
  const retired = { ...formerListing(), id: "preview-999", handle: "alain", published: false };
  const plan = planCatalogueUnion(keeriOnly("Alain"), "maple", existingOf([retired]));
  assert.equal(byKeeri(plan).handle, "alain-chair");
  const aliased = planCatalogueUnion(keeriOnly("Zyro"), "maple", existingOf([], [{ handle: "zyro", productId: "preview-101" }]));
  assert.equal(byKeeri(aliased).handle, "zyro-chair");
});

test("a variant keeps its ?variant= value when its title changes, and a new variant never reuses one", () => {
  const k = keeriOnly();
  const base = k.models[0]!.variants[0]!;
  k.models[0]!.variants = [base, { ...base, id: "variant2", sku: "CH-ZYRO-2", variantName: "Teal / Oak" }];
  const first = byKeeri(planCatalogueUnion(k, "maple"));
  assert.deepEqual(first.variants.map((v) => v.slug), ["linen-walnut", "teal-oak"]);
  const later = keeriOnly();
  later.models[0]!.variants = [{ ...base, variantName: "Teal / Oak" }, { ...base, id: "variant2", sku: "CH-ZYRO-2", variantName: "Sand / Ash" }, { ...base, id: "variant3", sku: "CH-ZYRO-3", variantName: "Linen / Walnut" }];
  const again = byKeeri(planCatalogueUnion(later, "maple", existingOf([first])));
  assert.deepEqual(again.variants.map((v) => v.slug), ["linen-walnut", "teal-oak", "linen-walnut-2"]);
});

test("a name with no letters falls back to the type and Keeri id, and a name that merely starts with keeri stays put", () => {
  assert.equal(byKeeri(planCatalogueUnion(keeriOnly("!!!"), "maple")).handle, "chair-model1");
  const first = planCatalogueUnion(keeriOnly("Keeri Lounge"), "maple");
  assert.equal(byKeeri(first).handle, "keeri-lounge");
  const again = planCatalogueUnion(keeriOnly("Keeri Lounge"), "maple", existingOf(first.products));
  assert.equal(byKeeri(again).handle, "keeri-lounge");
  assert.deepEqual(again.handleAliases, []);
});

test("a variant named by many long options keeps a title within the limit", () => {
  const k = keeriExportV2Schema.parse({ ...keeriOnly(), models: keeriOnly().models.map((m) => ({ ...m, variants: m.variants.map((v) => ({ ...v, variantName: null,
    attributes: Array.from({ length: 20 }, (_, i) => ({ axis: `axis${i}`, value: "x".repeat(200) })) })) })) });
  const v = byKeeri(planCatalogueUnion(k, "maple")).variants[0]!;
  assert.ok(v.title.length <= 300);
});
