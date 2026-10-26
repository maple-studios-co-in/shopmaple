import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
import { shopifyPricedFixture } from "./fixtures/shopify-admin.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Dedicated loopback shopmaple_test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
  await db.catalogueSyncState.deleteMany();
});

// Exercises the actual importer, persistence and HTTP collection route together.
test("sparse Keeri-only products remain discoverable by category, page and search beside Shopify products", async () => {
  const keeri = v2Fixture();
  const original = keeri.models[0]!;
  keeri.publicMedia = [];
  keeri.models = Array.from({ length: 27 }, (_, i) => {
    const suffix = String(i).padStart(2, "0");
    return {
      ...structuredClone(original), id: `model-${suffix}`, name: `Keeri ${suffix}`,
      productType: i === 26 ? "custom" : "chair", media: [],
      variants: [{ ...original.variants[0]!, id: `variant-${suffix}`, modelId: `model-${suffix}`, sku: null, prices: [], media: [] }],
    };
  });
  keeri.publication = keeri.models.map(model => ({ modelId: model.id, handle: `keeri-${model.id}`, category: null }));
  const imported = await syncCatalogueUnion(db, shopifyPricedFixture(), keeri, "maple");
  assert.equal(imported.totalProducts, 28);
  assert.equal(imported.totalVariants, 28);
  assert.equal(imported.mergedModels, 0);
  const first = await request(app).get("/api/catalogue/collections/chairs");
  assert.equal(first.status, 200);
  assert.equal(first.body.total, 27);
  assert.equal(first.body.products.length, 24);
  assert.equal(first.body.products[0].handle, "keeri-model-00");
  assert.equal(first.body.products[23].handle, "keeri-model-23");
  assert.equal(first.body.products[0].pricePaise, null);
  assert.equal(first.body.products[0].image, null);
  assert.equal(first.body.checkoutEnabled, false);
  const last = await request(app).get("/api/catalogue/collections/chairs?page=2");
  assert.equal(last.status, 200);
  assert.deepEqual(last.body.products.map((p: { handle: string }) => p.handle), ["keeri-model-24", "keeri-model-25", "real-chair"]);
  const searched = await request(app).get("/api/catalogue/collections/chairs?q=Keeri%2025&page=999");
  assert.equal(searched.status, 200);
  assert.equal(searched.body.query.page, 1);
  assert.equal(searched.body.total, 1);
  assert.equal(searched.body.products[0].handle, "keeri-model-25");
  const unclassified = await request(app).get("/api/catalogue/collections/all?q=Keeri%2026");
  assert.equal(unclassified.status, 200);
  assert.equal(unclassified.body.collectionTotal, 28);
  assert.equal(unclassified.body.products[0].handle, "keeri-model-26");
  const priceFilter = await request(app).get("/api/catalogue/collections/chairs?max=200");
  assert.equal(priceFilter.status, 200);
  assert.deepEqual(priceFilter.body.products.map((p: { handle: string }) => p.handle), ["real-chair"]);
  const detail = await request(app).get("/api/products/keeri-model-25");
  assert.equal(detail.status, 200);
  assert.equal(detail.body.category, "chairs");
  assert.equal(detail.body.variants[0].pricePaise, null);
  assert.equal(detail.body.variants[0].available, false);
});
