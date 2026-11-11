import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { batchNudge, productSchema } from "@shopmaple/contracts";
import { adaptKeeriExportV2 } from "../src/keeri.js";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { buildKeeriQuery, KeeriFetchError, fetchKeeriExport } from "../src/keeri-fetch.js";

/** Keeri's own synthetic `productPage=1` fixture (Keeri docs/contracts/shopmaple-catalogue-v2-product-page.json). */
const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/keeri-v2-product-page.json", import.meta.url), "utf8"));
const id = (value: string) => `keeri:tenant-demo:${value}`;

test("the product-page level fills specs, highlights, FAQ, assembly, customisation and rooms", () => {
  const chair = adaptKeeriExportV2(fixture(), "tenant-demo").products.find((p) => p.handle === "keeri-model-demo")!;
  const page = chair.productPage!;
  assert.deepEqual(page.specs, { widthCm: 52.5, depthCm: 56, heightCm: 81, seatHeightCm: 46, weightKg: 6.5 });
  assert.deepEqual(page.highlights, ["Solid wood frame", "Hand-finished in Jaipur", "Choose your fabric"]);
  assert.deepEqual(page.faq, [{ question: "Can I choose a different fabric?", answer: "Yes, from the swatches shown on this page." }]);
  assert.deepEqual(page.assembly, { required: true, minutes: 20 });
  assert.deepEqual(page.customisation, { options: ["fabric", "finish"], note: "Ask us for other finishes." });
  assert.deepEqual(page.rooms, [{ id: "room-demo", name: "Dining" }]);
  assert.doesNotThrow(() => productSchema.parse(chair));
});

test("approved reviews keep Keeri's own average and count, with store variant ids and review photo addresses", () => {
  const page = adaptKeeriExportV2(fixture(), "tenant-demo").products.find((p) => p.handle === "keeri-model-demo")!.productPage!;
  assert.equal(page.reviews.average, 4.5);
  assert.equal(page.reviews.count, 2);
  const [first, second] = page.reviews.items;
  assert.equal(first!.verifiedBuyer, true);
  assert.equal(first!.variantId, id("variant-demo"));
  assert.deepEqual(first!.photos, [{ id: "review-photo-demo", url: "https://store.maplefurnishers.com/media/keeri-review/review-photo-demo.webp", width: 1600, height: 1200 }]);
  assert.equal(second!.verifiedBuyer, false);
  assert.equal(second!.city, null);
  // A product nobody has reviewed says so rather than inventing a score.
  const table = adaptKeeriExportV2(fixture(), "tenant-demo").products.find((p) => p.handle === "keeri-model-demo-table")!.productPage!;
  assert.deepEqual(table.reviews, { average: null, count: 0, items: [] });
});

test("review photos on the store's new shop. address are accepted after the move; any other host is refused", () => {
  const moved = (host: string) =>
    JSON.parse(JSON.stringify(fixture()).replaceAll("https://store.maplefurnishers.com/media/keeri-review/", `https://${host}/media/keeri-review/`));
  const chair = adaptKeeriExportV2(moved("shop.maplefurnishers.com"), "tenant-demo").products.find((p) => p.handle === "keeri-model-demo")!;
  assert.equal(chair.productPage!.reviews.items[0]!.photos[0]!.url, "https://shop.maplefurnishers.com/media/keeri-review/review-photo-demo.webp");
  assert.doesNotThrow(() => productSchema.parse(chair));
  assert.throws(() => adaptKeeriExportV2(moved("evil.example.com"), "tenant-demo"));
  assert.throws(() => adaptKeeriExportV2(moved("shop.maplefurnishers.com.evil.example"), "tenant-demo"));
});

test("photo details carry the public address, role, alt text, real-photo mark and hotspots", () => {
  const page = adaptKeeriExportV2(fixture(), "tenant-demo").products.find((p) => p.handle === "keeri-model-demo")!.productPage!;
  assert.deepEqual(page.media, [{
    url: "https://store.maplefurnishers.com/media/keeri/asset-demo.webp",
    variantId: id("variant-demo"),
    role: "cutout",
    width: 1600,
    height: 1200,
    altText: "Demo dining chair in oak with grey fabric",
    realPhoto: false,
    hotspots: [
      { x: 0.4812, y: 0.3125, label: "Fabric", text: "Ash Grey boucle, removable cover.", type: "fabric" },
      { x: 0.31, y: 0.82, label: "Legs", text: "Solid oak, oil finish.", type: "material" },
    ],
  }]);
});

test("each variant keeps its batch count, own measurements, copy overrides and swatch options", () => {
  const variant = adaptKeeriExportV2(fixture(), "tenant-demo").products.find((p) => p.handle === "keeri-model-demo")!.variants[0]!;
  const page = variant.productPage!;
  assert.deepEqual(page.batch, { remaining: 3, showAtOrBelow: 5 });
  assert.equal(batchNudge(page.batch), 3);
  assert.equal(batchNudge({ remaining: 9, showAtOrBelow: 5 }), null);
  assert.equal(batchNudge(null), null);
  assert.deepEqual(page.specs, { widthCm: null, depthCm: null, heightCm: null, seatHeightCm: null, weightKg: null });
  assert.equal(page.copy.description, null);
  assert.deepEqual(page.options, [
    { axis: "fabric", value: "Ash Grey", code: "AG", hex: "#B2B2AE" },
    { axis: "polish", value: "Natural Oak", code: "NO", hex: null },
  ]);
});

test("an export without the product-page level leaves the new fields empty", () => {
  const data = fixture();
  delete data.bundles;
  for (const m of data.models) {
    delete m.productPage;
    for (const v of m.variants) {
      delete v.productPage;
      for (const a of v.attributes ?? []) { delete a.code; delete a.hex; }
      for (const media of v.media) for (const key of ["role", "width", "height", "altText", "realPhoto", "hotspots"]) delete media[key];
    }
  }
  const products = adaptKeeriExportV2(data, "tenant-demo").products;
  assert.ok(products.every((p) => p.productPage == null && p.variants.every((v) => v.productPage == null)));
});

test("bundles name store products by their current address, and a bundle missing a piece is left out", () => {
  const plan = planCatalogueUnion(fixture(), "tenant-demo");
  const chair = plan.products.find((p) => p.id === id("model-demo"))!;
  assert.deepEqual(chair.productPage!.bundles, [{
    id: "bundle-demo",
    name: "Demo dining set",
    description: "Synthetic fixture bundle.",
    items: [
      { productId: id("model-demo"), handle: chair.handle, variantId: id("variant-demo"), quantity: 4 },
      { productId: id("model-demo-table"), handle: plan.products.find((p) => p.id === id("model-demo-table"))!.handle, variantId: null, quantity: 1 },
    ],
  }]);
  const partial = fixture();
  partial.bundles[0].items[1].modelId = "model-not-in-snapshot";
  assert.throws(() => planCatalogueUnion(partial, "tenant-demo"), /bundle/i);
});

test("the store asks Keeri for the product-page level with exactly the documented query", () => {
  assert.equal(buildKeeriQuery({ includeTaxonomy: true, includeContent: true, includeAttributes: true, includeProductPage: true }), "?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1");
  assert.equal(buildKeeriQuery({ includeTaxonomy: true, includeContent: true, includeAttributes: true }), "?taxonomy=1&content=1&attributes=1");
});

test("an older Keeri that refuses the product-page level is reported as such, so the sync can step down", async () => {
  const refused = (async () => new Response(JSON.stringify({ error: "query_not_supported" }), { status: 400, headers: { "content-type": "application/json" } })) as typeof fetch;
  await assert.rejects(
    fetchKeeriExport({ endpoint: "https://keeri.example/api/storefront/catalogue/v2", trustedOrigin: "https://keeri.example", token: "t0ken", tenantId: "tenant-demo", schemaVersion: 2, includeTaxonomy: true, includeContent: true, includeAttributes: true, includeProductPage: true, fetch: refused }),
    (error: unknown) => error instanceof KeeriFetchError && error.code === "PRODUCT_PAGE_UNSUPPORTED",
  );
});
