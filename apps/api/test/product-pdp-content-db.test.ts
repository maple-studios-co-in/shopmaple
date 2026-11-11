import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import { tree } from "./fixtures/product-pdp.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/shopmaple_test") throw new Error("Dedicated local test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany(); await db.cart.deleteMany(); await db.variant.deleteMany(); await db.product.deleteMany(); await db.catalogueSyncState.deleteMany();
});
const shopifyCopy = { source: "shopify-metafields", sourceProductId: "gid://shopify/Product/101", capturedAt: "2026-10-25T10:00:00Z", details: tree, materialsCare: null, shippingReturns: null };
/** A former merged listing as the Shopify union stored it, with its Shopify copy blocks, bound to Keeri's model1. */
async function seedFormerListing() {
  await db.product.create({ data: {
    id: "preview-101", handle: "real-chair", title: "Real chair", description: "Actual description", pdpContent: shopifyCopy,
    category: "chairs", images: [], published: true, source: "shopify-preview", sourceUpdatedAt: new Date("2026-10-25T09:00:00Z"),
    variants: { create: [{ id: "preview-201", title: "Oak", sku: "CHAIR-OAK", published: true }] },
  } });
  await db.productSourceIdentity.create({ data: { source: "keeri:maple", externalId: "keeri:maple:model1", productId: "preview-101" } });
  await db.variantSourceIdentity.create({ data: { source: "keeri:maple", externalId: "keeri:maple:variant1", variantId: "preview-201" } });
}
function keeri() {
  const k = v2Fixture(); k.publicMedia = []; return k;
}
test("the Keeri sync clears a former listing's Shopify copy blocks; the product shows Keeri's copy", async () => {
  await seedFormerListing();
  let response = await request(app).get("/api/products/real-chair");
  assert.deepEqual(response.body.pdpContent.details, tree, "before the sync the stored copy is served");
  await syncCatalogueUnion(db, keeri(), "maple");
  response = await request(app).get("/api/products/real-chair");
  assert.equal(response.status, 200);
  assert.equal(response.body.pdpContent, null);
  assert.equal(response.body.description, "Solid wood chair");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: "preview-101" } })).pdpContent, null);
});
test("unsafe persisted copy cannot escape public serialization", async () => {
  await seedFormerListing();
  const unsafe = { type: "root", children: [{ type: "paragraph", children: [{ type: "link", url: "javascript:alert(1)", children: [{ type: "text", value: "unsafe" }] }] }] };
  await db.product.update({ where: { id: "preview-101" }, data: { pdpContent: { ...shopifyCopy, details: unsafe } } });
  const response = await request(app).get("/api/products/real-chair");
  assert.notEqual(response.status, 200);
  assert.equal(JSON.stringify(response.body).includes("javascript:"), false);
});
test("catalogue listing omits full PDP documents while product detail retains them", async () => {
  await seedFormerListing();
  const listing = await request(app).get("/api/products");
  assert.equal(listing.status, 200);
  assert.equal(listing.body.products.length, 1);
  assert.equal(Object.hasOwn(listing.body.products[0], "pdpContent"), false);
  assert.equal(listing.body.products[0].description, "Actual description");
  const detail = await request(app).get("/api/products/real-chair");
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.pdpContent.details, tree);
});
test("Keeri's product-page data reaches the product detail but never the catalogue listing", async () => {
  const page = { specs: { widthCm: 52, depthCm: null, heightCm: null, seatHeightCm: null, weightKg: null }, highlights: [], faq: [{ question: "Can I choose a fabric?", answer: "Yes." }], assembly: null, customisation: null, rooms: [], reviews: { average: null, count: 0, items: [] }, media: [], bundles: [] };
  const variantPage = { specs: { widthCm: null, depthCm: null, heightCm: null, seatHeightCm: null, weightKg: null }, copy: { description: null, details: null, materials: null, dimensions: null, careInstructions: null }, batch: { remaining: 3, showAtOrBelow: 5 }, options: [] };
  await db.product.create({ data: { id: "page-product", handle: "page-product", title: "Chair", description: "", images: [], published: true, source: "keeri:maple", sourceUpdatedAt: new Date(), productPage: page,
    variants: { create: [{ id: "page-variant", title: "Oak", sku: null, productPage: variantPage }] } } });
  const listing = await request(app).get("/api/products");
  const card = listing.body.products.find((p: { handle: string }) => p.handle === "page-product");
  assert.equal(Object.hasOwn(card, "productPage"), false);
  assert.equal(Object.hasOwn(card.variants[0], "productPage"), false);
  const detail = await request(app).get("/api/products/page-product");
  assert.deepEqual(detail.body.productPage, page);
  assert.deepEqual(detail.body.variants[0].productPage, variantPage);
});
