import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
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
