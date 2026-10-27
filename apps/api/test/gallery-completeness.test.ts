import assert from "node:assert/strict";
import { test } from "node:test";
import { productSchema } from "@shopmaple/contracts";
import { adaptKeeriExport, adaptKeeriExportV2 } from "../src/keeri.js";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { adaptShopifyCatalogue } from "../src/shopify-catalogue.js";
import { fetchKeeriExport } from "../src/keeri-fetch.js";
import { keeriFixture } from "./fixtures/keeri.js";
import { largeGalleryFixture } from "./fixtures/large-gallery.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";

const expectedImages = (count: number) => Array.from({ length: count }, (_, i) =>
  `https://store.maplefurnishers.com/media/keeri/gallery-${i}.webp`);

test("product contracts accept a complete gallery beyond thirty while rejecting malformed URLs", () => {
  const product = adaptKeeriExport(keeriFixture(), "maple").products[0]!;
  assert.equal(productSchema.safeParse({ ...product, images: expectedImages(240) }).success, true);
  for (const invalid of ["not-a-url", "http://example.test/photo.jpg", "javascript:alert(1)"])
    assert.throws(() => productSchema.parse({ ...product, images: [...expectedImages(240), invalid] }));
});

test("V1 and V2 keep every approved gallery image in source order beyond thirty", () => {
  const data = largeGalleryFixture();
  data.models[0]!.media.reverse();
  assert.deepEqual(adaptKeeriExportV2(data, "maple").products[0]!.images, expectedImages(37));
  const legacy = keeriFixture();
  assert.deepEqual(adaptKeeriExport({ ...legacy, publicMedia: data.publicMedia,
    models: [{ ...legacy.models[0]!, media: data.models[0]!.media }],
  }, "maple").products[0]!.images, expectedImages(37));
});

for (const relation of ["model", "variant"] as const) {
  test(`Keeri ${relation} media has no per-product image-count ceiling`, () => {
    const data = largeGalleryFixture(240, relation);
    assert.deepEqual(adaptKeeriExportV2(data, "maple").products[0]!.images, expectedImages(240));
  });
}

test("large galleries still omit unapproved, superseded, unstored, unmapped and unpublished variant media", () => {
  const data = largeGalleryFixture();
  const model = data.models[0]!;
  model.media[31]!.stage = "raw";
  model.media[32]!.supersededAt = data.capturedAt;
  model.media[33]!.storageKey = null;
  data.publicMedia = data.publicMedia.filter(asset => asset.assetId !== "gallery-34");
  model.variants[0]!.channelPublished = false;
  model.media[35]!.variantId = "variant1";
  // A duplicate relation row must still produce only one image.
  model.media.push({ ...model.media[0]! });
  assert.deepEqual(adaptKeeriExportV2(data, "maple").products[0]!.images,
    [...expectedImages(31), "https://store.maplefurnishers.com/media/keeri/gallery-36.webp"]);
});

test("merged galleries keep Shopify first and append all distinct approved Keeri images", () => {
  const data = largeGalleryFixture();
  data.models[0]!.shopifyProductId = "101";
  data.publicMedia[0]!.url = "https://cdn.shopify.com/s/files/1/chair.jpg";
  const plan = planCatalogueUnion(shopifyFixture(), data, "maple");
  assert.equal(plan.products.length, 1);
  assert.deepEqual(plan.products[0]!.images,
    ["https://cdn.shopify.com/s/files/1/chair.jpg", ...expectedImages(37).slice(1)]);
});

test("Shopify galleries also retain every image beyond thirty", () => {
  const data = shopifyFixture();
  data.products[0]!.media.nodes = expectedImages(240).map(url => ({ image: { url } }));
  assert.deepEqual(adaptShopifyCatalogue(data).products[0]!.images, expectedImages(240));
});

test("unsafe URLs and foreign media ownership beyond the old cap still fail closed", () => {
  for (const url of ["not-a-url", "http://example.test/image.jpg", "https://user:pass@example.test/image.jpg"]) {
    const data = largeGalleryFixture();
    data.publicMedia[36]!.url = url;
    assert.throws(() => adaptKeeriExportV2(data, "maple"));
  }
  const unapproved = largeGalleryFixture();
  unapproved.publicMedia[36]!.url = "https://unapproved.example.test/image.jpg";
  assert.throws(() => planCatalogueUnion({ ...shopifyFixture(), products: [] }, unapproved, "maple"), /UNSUPPORTED_PUBLIC_MEDIA/);
  const foreign = largeGalleryFixture();
  foreign.models[0]!.media[36]!.tenantId = "other";
  assert.throws(() => adaptKeeriExportV2(foreign, "maple"), /Media tenant mismatch/);
});

test("complete galleries respect the unchanged total transport byte budget", async () => {
  const payload = JSON.stringify(largeGalleryFixture(240));
  const bytes = Buffer.byteLength(payload);
  const options = {
    endpoint: "https://keeri.example.test/api/storefront/catalogue/v2", trustedOrigin: "https://keeri.example.test",
    token: "synthetic-gallery-token", tenantId: "maple", schemaVersion: 2 as const,
    fetch: async () => new Response(payload, { headers: { "Content-Type": "application/json" } }),
  };
  const result = await fetchKeeriExport({ ...options, maxBytes: bytes });
  assert.deepEqual(result.products[0]!.images, expectedImages(240));
  await assert.rejects(fetchKeeriExport({ ...options, maxBytes: bytes - 1 }), { code: "EXPORT_TOO_LARGE" });
  await assert.rejects(fetchKeeriExport({ ...options, maxBytes: bytes - 1,
    fetch: async () => new Response(payload, { headers: { "Content-Type": "application/json", "Content-Length": String(bytes) } }),
  }), { code: "EXPORT_TOO_LARGE" });
});
