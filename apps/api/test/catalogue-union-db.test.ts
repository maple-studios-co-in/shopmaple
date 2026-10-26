import request from "supertest";
import { createApp } from "../src/app.js";
import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import {
  shopifyFixture,
  shopifyPricedFixture,
} from "./fixtures/shopify-admin.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
  await db.catalogueSyncState.deleteMany();
});
function fixtures() {
  const s = shopifyFixture(),
    k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  return { s, k };
}
test("atomic union preserves cart references, identity bindings and handles across repeated imports", async () => {
  const { s, k } = fixtures();
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(await db.product.count(), 1);
  const cart = await db.cart.create({
    data: {
      tokenHash: "synthetic-union",
      expiresAt: new Date(Date.now() + 60000),
      items: { create: { variantId: "preview-201", quantity: 1 } },
    },
  });
  assert.equal((await syncCatalogueUnion(db, s, k, "maple")).replayed, true);
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.models[0]!.variants[0]!.sku = "RENAMED";
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(await db.product.count(), 1);
  assert.equal(
    (await db.cartItem.findFirst({ where: { cartId: cart.id } }))!.variantId,
    "preview-201",
  );
  assert.equal((await syncCatalogueUnion(db, s, k, "maple")).totalProducts, 1);
  assert.equal(await db.productSourceIdentity.count(), 2);
  assert.equal(await db.variantSourceIdentity.count(), 2);
});
test("source opt-out removes Keeri-only items while Shopify union membership stays and stale payloads cannot restore", async () => {
  const { s, k } = fixtures();
  k.models[0]!.variants[0]!.sku = "ONLY-KEERI";
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(await db.product.count({ where: { published: true } }), 2);
  const older = structuredClone(k);
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.models = [];
  k.publication = [];
  k.publicMedia = [];
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(await db.product.count({ where: { published: true } }), 1);
  await assert.rejects(syncCatalogueUnion(db, s, older, "maple"));
  assert.equal(await db.product.count({ where: { published: true } }), 1);
});
test("handle collision rolls back catalogue and watermark; foreign tenant never writes", async () => {
  const { s, k } = fixtures();
  await syncCatalogueUnion(db, s, k, "maple");
  const cursor = await db.catalogueSyncState.findMany();
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  await assert.rejects(syncCatalogueUnion(db, s, k, "other"));
  assert.deepEqual(await db.catalogueSyncState.findMany(), cursor);
  await db.product.create({
    data: {
      id: "unrelated",
      handle: "taken",
      title: "Unrelated",
      description: "",
      category: null,
      images: [],
      source: "other",
      sourceUpdatedAt: new Date(),
    },
  });
  const second = structuredClone(k.models[0]!);
  second.id = "model2";
  second.variants = [];
  second.media = [];
  k.models.push(second);
  k.publication.push({
    modelId: "model2",
    handle: "taken",
    category: "chairs",
  });
  await assert.rejects(syncCatalogueUnion(db, s, k, "maple"));
  assert.deepEqual(await db.catalogueSyncState.findMany(), cursor);
  assert.equal(await db.product.count(), 2);
});

test("complete Keeri snapshot revokes former price and approved images instead of resurrecting old Keeri data", async () => {
  const { s, k } = fixtures();
  k.models[0]!.variants[0]!.sku = "KEERI-ONLY";
  k.publicMedia = [
    {
      assetId: k.models[0]!.media[0]!.id,
      url: "https://cdn.shopify.com/s/files/1/approved.jpg",
    },
  ];
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(
    (await db.product.findUnique({ where: { id: "keeri:maple:model1" } }))!
      .images.length,
    1,
  );
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.publicMedia = [];
  k.models[0]!.variants[0]!.prices = [];
  await syncCatalogueUnion(db, s, k, "maple");
  assert.deepEqual(
    (await db.product.findUnique({ where: { id: "keeri:maple:model1" } }))!
      .images,
    [],
  );
  assert.equal(
    (await db.variant.findUnique({ where: { id: "keeri:maple:variant1" } }))!
      .pricePaise,
    null,
  );
});

test("scheduled refresh persists verified public prices and never restores raw MRP", async () => {
  const { k } = fixtures();
  const s = shopifyPricedFixture();
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(
    (await db.variant.findUniqueOrThrow({ where: { id: "preview-201" } }))
      .pricePaise,
    12345,
  );
  k.capturedAt = "2026-10-25T11:00:00Z";
  await syncCatalogueUnion(db, s, k, "maple");
  assert.equal(
    (await db.variant.findUniqueOrThrow({ where: { id: "preview-201" } }))
      .pricePaise,
    12345,
  );
  s.publicPrices.products = [];
  k.capturedAt = "2026-10-25T12:00:00Z";
  await syncCatalogueUnion(db, s, k, "maple");
  const unknown = await db.variant.findUniqueOrThrow({
    where: { id: "preview-201" },
  });
  assert.equal(unknown.pricePaise, null);
  assert.equal(unknown.compareAtPaise, null);
});

test("newer union refresh restores Shopify presentation without moving cart or source identities", async () => {
  const { k } = fixtures();
  const s = shopifyPricedFixture();
  k.publicMedia = [{ assetId: "photo1", url: "https://cdn.shopify.com/s/files/1/keeri.jpg" }];
  await syncCatalogueUnion(db, s, k, "maple");
  // Simulate a persisted row from the former Keeri-first presentation policy.
  await db.product.update({ where: { id: "preview-101" }, data: {
    title: "Zyro", description: "Solid wood chair", images: ["https://cdn.shopify.com/s/files/1/keeri.jpg"],
  } });
  const cart = await db.cart.create({ data: {
    tokenHash: "synthetic-display-refresh", expiresAt: new Date(Date.now() + 60000),
    items: { create: { variantId: "preview-201", quantity: 2 } },
  } });
  k.capturedAt = "2026-10-25T11:00:00Z";
  await syncCatalogueUnion(db, s, k, "maple");
  const p = await db.product.findUniqueOrThrow({ where: { id: "preview-101" }, include: { variants: true } });
  assert.equal(p.title, "Real chair");
  assert.equal(p.description, "Actual description");
  assert.deepEqual(p.images, ["https://cdn.shopify.com/s/files/1/chair.jpg", "https://cdn.shopify.com/s/files/1/keeri.jpg"]);
  assert.equal(p.handle, "real-chair");
  assert.deepEqual(p.variants.map(v => [v.id, v.title, v.pricePaise, v.available]), [["preview-201", "Oak", 12345, false]]);
  assert.deepEqual((await db.cartItem.findMany({ where: { cartId: cart.id } })).map(i => [i.variantId, i.quantity]), [["preview-201", 2]]);
  assert.equal(await db.productSourceIdentity.count({ where: { productId: "preview-101" } }), 2);
  assert.equal(await db.variantSourceIdentity.count({ where: { variantId: "preview-201" } }), 2);
});

test('persisted Keeri taxonomy expands Dining Chairs without losing Shopify members or exposing unpublished models', async () => {
  const {s,k}=fixtures();
  s.products[0]!.handle='aero-dining-chair';
  k.models[0]!.variants[0]!.sku='KEERI-ONLY';
  const input={...k,models:k.models.map(m=>({...m, productType:'chair',taxonomy:{category:'Dining',subCategory:null}}))};
  await syncCatalogueUnion(db,s,input,'maple');
  const app=createApp(db,{webOrigin:'http://localhost:3000',catalogMode:'preview',secureCookies:false});
  const result=await request(app).get('/api/catalogue/collections/dining-chair');
  assert.equal(result.status,200);
  assert.equal(result.body.total,2);
  assert.deepEqual(new Set(result.body.products.map((p:{handle:string})=>p.handle)),new Set(['aero-dining-chair',k.publication[0]!.handle]));
  const persisted=await db.product.findUniqueOrThrow({where:{id:'keeri:maple:model1'}});
  assert.deepEqual(persisted.sourceTaxonomy,{productType:'chair',category:'Dining',subCategory:null});
  input.capturedAt='2026-10-25T12:00:00Z'; input.models[0]!.taxonomy.category='Accent';
  await syncCatalogueUnion(db,s,input,'maple');
  assert.equal((await request(app).get('/api/catalogue/collections/dining-chair')).body.total,1);
  // A legacy snapshot must clear stale category metadata rather than retain an obsolete assignment.
  k.capturedAt='2026-10-25T13:00:00Z';
  await syncCatalogueUnion(db,s,k,'maple');
  assert.equal((await db.product.findUniqueOrThrow({where:{id:'keeri:maple:model1'}})).sourceTaxonomy,null);
});
