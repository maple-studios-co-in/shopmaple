import request from "supertest";
import { createApp } from "../src/app.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import { resolveCatalogueBindings } from "../src/orders/catalogue-bindings.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
import { largeGalleryFixture } from "./fixtures/large-gallery.js";
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
  await db.productHandleAlias.deleteMany();
});
function fixtures() {
  const k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  return k;
}
const keeriPhoto = (id: string) => `https://store.maplefurnishers.com/media/keeri/${id}.webp`;
const app = () => createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
/** A guest cart holding these variants, and the cookie that opens it. */
async function cartWith(...variantIds: string[]) {
  const secret = createHash("sha256").update(variantIds.join(",")).digest("hex");
  const cart = await db.cart.create({ data: {
    tokenHash: createHash("sha256").update(secret).digest("hex"), expiresAt: new Date(Date.now() + 60000),
    items: { create: variantIds.map((variantId) => ({ variantId, quantity: 1 })) },
  } });
  return { cart, cookie: `maple_cart=${secret}` };
}

/** What production holds before this release: the Shopify union's rows and the bindings it recorded. */
async function seedShopifyUnion() {
  const shopifyCopy = { source: "shopify-metafields", sourceProductId: "gid://shopify/Product/101", capturedAt: "2026-10-25T09:00:00Z",
    details: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Shopify copy" }] }] }, materialsCare: null, shippingReturns: null };
  await db.product.create({ data: {
    id: "preview-101", handle: "real-chair", title: "Real chair", description: "Shopify description", pdpContent: shopifyCopy,
    category: "chairs", images: ["https://cdn.shopify.com/s/files/1/chair.jpg", keeriPhoto("old")], published: true,
    source: "shopify-preview", sourceUpdatedAt: new Date("2026-10-25T09:00:00Z"),
    variants: { create: [
      { id: "preview-201", title: "Oak", sku: "CHAIR-OAK", pricePaise: 12345, compareAtPaise: 15000, published: true, available: false, stockPolicy: "unverified", slug: "oak", images: ["https://cdn.shopify.com/s/files/1/oak.jpg"] },
      { id: "preview-202", title: "Ash", sku: "CHAIR-ASH", pricePaise: 12345, published: true, available: false, stockPolicy: "unverified", slug: "ash" },
    ] },
  } });
  await db.product.create({ data: {
    id: "preview-301", handle: "nova-dining-table", title: "Nova dining table", description: "Shopify only", category: "tables",
    images: ["https://cdn.shopify.com/s/files/1/nova.jpg"], published: true, source: "shopify-preview",
    sourceUpdatedAt: new Date("2026-10-25T09:00:00Z"),
    variants: { create: [{ id: "preview-401", title: "Standard", pricePaise: 99900, published: true, available: false, stockPolicy: "unverified", slug: "standard" }] },
  } });
  await db.productSourceIdentity.createMany({ data: [
    { source: "shopify", externalId: "preview-101", productId: "preview-101" },
    { source: "shopify", externalId: "preview-301", productId: "preview-301" },
    { source: "keeri:maple", externalId: "keeri:maple:model1", productId: "preview-101" },
  ] });
  await db.variantSourceIdentity.createMany({ data: [
    { source: "shopify", externalId: "preview-201", variantId: "preview-201" },
    { source: "shopify", externalId: "preview-202", variantId: "preview-202" },
    { source: "shopify", externalId: "preview-401", variantId: "preview-401" },
    { source: "keeri:maple", externalId: "keeri:maple:variant1", variantId: "preview-201" },
  ] });
  await db.productHandleAlias.create({ data: { handle: "real-chair-old", productId: "preview-101" } });
  await db.catalogueSyncState.create({ data: { source: "union:maple", capturedAt: new Date("2026-10-25T09:30:00Z"), payloadHash: "shopify-union" } });
}

test("the first Keeri-only sync after the Shopify union keeps merged identities and carts, and unpublishes Shopify-only rows", async () => {
  await seedShopifyUnion();
  const { cart, cookie } = await cartWith("preview-201", "preview-202", "preview-401");
  const k = fixtures();
  k.publicMedia = [{ assetId: "photo1", url: keeriPhoto("photo1") }];
  const report = await syncCatalogueUnion(db, k, "maple");
  assert.equal(report.replayed, false);
  assert.equal(report.retiredProducts, 1);
  assert.equal(report.formerShopifyListings, 1);
  assert.equal(report.totalProducts, 1);

  const merged = await db.product.findUniqueOrThrow({ where: { id: "preview-101" }, include: { variants: { orderBy: { id: "asc" } }, handleAliases: true } });
  assert.equal(merged.handle, "real-chair");
  assert.equal(merged.title, "Zyro");
  assert.equal(merged.description, "Solid wood chair");
  assert.equal(merged.pdpContent, null);
  assert.deepEqual(merged.images, [keeriPhoto("photo1")]);
  assert.equal(merged.source, "keeri:maple");
  assert.equal(merged.published, true);
  assert.deepEqual(merged.handleAliases.map((a) => a.handle), ["real-chair-old"]);
  assert.deepEqual(merged.variants.map((v) => [v.id, v.published, v.pricePaise, v.title, v.slug]), [
    ["preview-201", true, 1234567, "Linen / Walnut", "oak"],
    ["preview-202", false, 12345, "Ash", "ash"],
  ]);
  assert.equal(merged.variants[1]!.available, false);

  const retired = await db.product.findUniqueOrThrow({ where: { id: "preview-301" }, include: { variants: true } });
  assert.equal(retired.published, false, "a Shopify-only listing stays as a row but leaves the store");
  assert.deepEqual(retired.variants.map((v) => [v.id, v.published, v.available]), [["preview-401", false, false]]);
  assert.equal(await db.product.count(), 2, "no row is deleted");
  assert.deepEqual((await db.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { variantId: "asc" } })).map((i) => i.variantId),
    ["preview-201", "preview-202", "preview-401"]);

  const served = await request(app()).get("/api/cart").set("Cookie", cookie);
  assert.equal(served.status, 200);
  const line = (id: string) => served.body.items.find((item: { variantId: string }) => item.variantId === id);
  assert.deepEqual([line("preview-201").title, line("preview-201").image, line("preview-201").pricePaise], ["Zyro", keeriPhoto("photo1"), 1234567]);
  assert.equal(line("preview-202").available, false);
  assert.deepEqual([line("preview-401").available, line("preview-401").cartable, line("preview-401").image], [false, false, ""]);
  assert.doesNotMatch(served.text, /shopify/i);
  assert.equal((await request(app()).get("/api/products/nova-dining-table")).status, 404);
  assert.equal((await request(app()).get("/api/products/real-chair")).body.title, "Zyro");
  const alias = await request(app()).get("/api/products/real-chair-old");
  assert.equal(alias.status, 308);
  assert.equal(alias.headers.location, "/api/products/real-chair");

  assert.equal((await syncCatalogueUnion(db, k, "maple")).replayed, true);
  const cursor = await db.catalogueSyncState.findMany();
  const older = structuredClone(k);
  older.capturedAt = "2026-10-25T09:45:00Z";
  older.models = [];
  older.publication = [];
  older.publicMedia = [];
  await assert.rejects(syncCatalogueUnion(db, older, "maple"), /STALE_UNION_SNAPSHOT/);
  assert.deepEqual(await db.catalogueSyncState.findMany(), cursor);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: "preview-101" } })).published, true);
});

test("atomic sync preserves cart references, identity bindings and handles across repeated imports", async () => {
  const k = fixtures();
  await syncCatalogueUnion(db, k, "maple");
  assert.equal(await db.product.count(), 1);
  const { cart } = await cartWith("keeri:maple:variant1");
  assert.equal((await syncCatalogueUnion(db, k, "maple")).replayed, true);
  const handle = (await db.product.findFirstOrThrow()).handle;
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.models[0]!.variants[0]!.sku = "RENAMED";
  k.models[0]!.name = "Renamed in Keeri";
  await syncCatalogueUnion(db, k, "maple");
  assert.equal(await db.product.count(), 1);
  assert.equal((await db.product.findFirstOrThrow()).handle, handle);
  assert.equal((await db.cartItem.findFirst({ where: { cartId: cart.id } }))!.variantId, "keeri:maple:variant1");
  assert.equal(await db.productSourceIdentity.count(), 1);
  assert.equal(await db.variantSourceIdentity.count(), 1);
});

test("checkout resolves the Keeri link exactly as the sync recorded it", async () => {
  // The sync writes Keeri identities under `keeri:<tenant>`; checkout once looked for a bare
  // "keeri" source, found nothing and refused every live checkout as CATALOGUE_BINDING_REQUIRED.
  await seedShopifyUnion();
  await syncCatalogueUnion(db, fixtures(), "maple");
  await db.variant.update({ where: { id: "preview-201" }, data: { available: true, stockPolicy: "stocked" } });
  const bindings = await resolveCatalogueBindings(db as never, ["preview-201"], "maple");
  assert.equal(bindings.items.length, 1);
  assert.match(bindings.items[0]!.sourceVariantId, /^keeri:maple:/);
  assert.match(bindings.items[0]!.sourceProductId, /^keeri:maple:/);
  await assert.rejects(resolveCatalogueBindings(db as never, ["preview-201"], "other"), { code: "CATALOGUE_BINDING_REQUIRED" });
});

test("a Keeri opt-out unpublishes the product and a stale payload cannot restore it", async () => {
  const k = fixtures();
  await syncCatalogueUnion(db, k, "maple");
  assert.equal(await db.product.count({ where: { published: true } }), 1);
  const older = structuredClone(k);
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.models = [];
  k.publication = [];
  k.publicMedia = [];
  assert.equal((await syncCatalogueUnion(db, k, "maple")).retiredProducts, 1);
  assert.equal(await db.product.count({ where: { published: true } }), 0);
  await assert.rejects(syncCatalogueUnion(db, older, "maple"));
  assert.equal(await db.product.count({ where: { published: true } }), 0);
});

test("handle collision rolls back catalogue and watermark; foreign tenant never writes", async () => {
  const k = fixtures();
  await syncCatalogueUnion(db, k, "maple");
  const cursor = await db.catalogueSyncState.findMany();
  k.capturedAt = "2026-10-25T11:00:00Z";
  await assert.rejects(syncCatalogueUnion(db, k, "other"));
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
  await assert.rejects(syncCatalogueUnion(db, k, "maple"));
  assert.deepEqual(await db.catalogueSyncState.findMany(), cursor);
  assert.equal(await db.product.count(), 2);
});

test("complete Keeri snapshot revokes former price and approved images instead of resurrecting old Keeri data", async () => {
  const k = fixtures();
  k.publicMedia = [{ assetId: k.models[0]!.media[0]!.id, url: keeriPhoto("approved") }];
  await syncCatalogueUnion(db, k, "maple");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" } })).images.length, 1);
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.publicMedia = [];
  k.models[0]!.variants[0]!.prices = [];
  await syncCatalogueUnion(db, k, "maple");
  assert.deepEqual((await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" } })).images, []);
  assert.equal((await db.variant.findUniqueOrThrow({ where: { id: "keeri:maple:variant1" } })).pricePaise, null);
});

test("persisted Keeri taxonomy fills Dining Chairs without exposing unpublished models", async () => {
  const k = fixtures();
  const input = { ...k, models: k.models.map((m) => ({ ...m, productType: "chair", taxonomy: { category: "Dining", subCategory: null } })) };
  await syncCatalogueUnion(db, input, "maple");
  const result = await request(app()).get("/api/catalogue/collections/dining-chair");
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 1);
  assert.deepEqual(result.body.products.map((p: { handle: string }) => p.handle), [k.publication[0]!.handle]);
  const persisted = await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" } });
  assert.deepEqual(persisted.sourceTaxonomy, { productType: "chair", category: "Dining", subCategory: null });
  input.capturedAt = "2026-10-25T12:00:00Z";
  input.models[0]!.taxonomy.category = "Accent";
  await syncCatalogueUnion(db, input, "maple");
  assert.equal((await request(app()).get("/api/catalogue/collections/dining-chair")).body.total, 0);
  // A legacy snapshot must clear stale category metadata rather than retain an obsolete assignment.
  k.capturedAt = "2026-10-25T13:00:00Z";
  await syncCatalogueUnion(db, k, "maple");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" } })).sourceTaxonomy, null);
});

test("large galleries survive persistence, replay and detail responses while cards remain compact", async () => {
  const k = largeGalleryFixture(240);
  await syncCatalogueUnion(db, k, "maple");
  const expected = Array.from({ length: 240 }, (_, i) => keeriPhoto(`gallery-${i}`));
  const handle = k.publication[0]!.handle;
  assert.deepEqual((await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" } })).images, expected);
  assert.equal((await syncCatalogueUnion(db, k, "maple")).replayed, true);
  const detail = await request(app()).get(`/api/products/${handle}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.images, expected);
  const card = await request(app()).get(`/api/catalogue/cards/${handle}`);
  assert.equal(card.status, 200);
  assert.equal(card.body.product.image, expected[0]);
  assert.equal("images" in card.body.product, false);
  assert.ok(Buffer.byteLength(card.text) < 500, "cards must not carry full galleries");
  const collection = await request(app()).get("/api/catalogue/collections/all");
  assert.equal(collection.status, 200);
  assert.equal(collection.body.products[0].image, expected[0]);
  assert.equal("images" in collection.body.products[0], false);
  assert.ok(Buffer.byteLength(collection.text) < 1500);
  const cursor = await db.catalogueSyncState.findMany();
  k.capturedAt = "2026-10-25T11:00:00Z";
  k.publicMedia[239]!.url = "https://cdn.shopify.com/s/files/1/photo.jpg";
  // Malformed input cannot partially write a sync.
  await assert.rejects(syncCatalogueUnion(db, k, "maple"), /CATALOGUE|UNSUPPORTED_PUBLIC_MEDIA/);
  assert.deepEqual((await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" } })).images, expected);
  assert.deepEqual(await db.catalogueSyncState.findMany(), cursor);
});

test("a renamed Keeri address redirects permanently, and each variant keeps its name, photos and ?variant= value", async () => {
  const k = v2Fixture();
  k.models[0]!.name = "Zyro Lounge";
  k.publication[0]!.handle = "keeri-model1";
  const variant = k.models[0]!.variants[0]!;
  (variant as typeof variant & { attributes: unknown }).attributes = [{ axis: "fabric", value: "Linen" }];
  variant.media = [{ id: "photo2", tenantId: "maple", modelId: null, variantId: variant.id, stage: "approved", storageKey: "public-media:photo2", supersededAt: null, position: 0 }];
  k.publicMedia = [{ assetId: "photo2", url: "https://store.maplefurnishers.com/media/keeri/photo2.webp" }];
  await syncCatalogueUnion(db, k, "maple");
  const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });

  const old = await request(app).get("/api/products/keeri-model1");
  assert.equal(old.status, 308);
  assert.equal(old.headers.location, "/api/products/zyro-lounge");
  const current = await request(app).get("/api/products/zyro-lounge");
  assert.equal(current.status, 200);
  assert.deepEqual(current.body.variants[0], { ...current.body.variants[0], slug: "linen-walnut", images: ["https://store.maplefurnishers.com/media/keeri/photo2.webp"] });
  assert.equal((await request(app).get("/api/products/keeri-nothing")).status, 404, "an unknown address is still not found");
  const listing = await request(app).get("/api/products?limit=50");
  const listed = listing.body.products.find((p: { handle: string }) => p.handle === "zyro-lounge");
  assert.deepEqual(Object.keys(listed.variants[0]).filter((key) => ["images", "slug"].includes(key)), [], "lists stay lean; the detail response carries variant photos and slugs");
  const card = await request(app).get("/api/catalogue/cards/keeri-model1");
  assert.equal(card.status, 308);
  assert.equal(card.headers.location, "/api/catalogue/cards/zyro-lounge");
  const batch = await request(app).get("/api/catalogue/cards?handles=keeri-model1,missing");
  assert.equal(batch.status, 200);
  assert.deepEqual(batch.body.products.map((p: { handle: string }) => p.handle), ["zyro-lounge"]);
  assert.deepEqual(batch.body.moved, [{ handle: "zyro-lounge", from: "keeri-model1" }], "saved homepage picks still find a renamed product");

  k.capturedAt = "2026-10-25T11:00:00Z";
  await syncCatalogueUnion(db, k, "maple");
  assert.equal((await db.product.findFirstOrThrow({ where: { source: { startsWith: "keeri:" } } })).handle, "zyro-lounge", "the readable address is stable");
  assert.equal(await db.productHandleAlias.count(), 1);
});

test("a rename steps around an unpublished product's address instead of failing every sync", async () => {
  await db.product.create({ data: { id: "preview-retired", handle: "zyro-lounge", title: "Retired", description: "", images: [], published: false, source: "shopify-preview", sourceUpdatedAt: new Date("2026-10-01T00:00:00Z") } });
  const k = v2Fixture();
  k.publicMedia = [];
  k.models[0]!.name = "Zyro Lounge";
  k.publication[0]!.handle = "keeri-model1";
  await syncCatalogueUnion(db, k, "maple");
  assert.equal((await db.product.findFirstOrThrow({ where: { source: { startsWith: "keeri:" } } })).handle, "zyro-lounge-chair");
});

test("a sync stores Keeri's purchasable verdict and lead time, and a later refusal withdraws it", async () => {
  const k = fixtures();
  Object.assign(k.models[0]!.variants[0]!, {
    stockPolicy: "made_to_order",
    prices: [
      { kind: "mrp", amount: 10462, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
      { kind: "store_price", amount: 12345, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
    ],
    fulfilment: { kind: "made_to_order", leadTimeDays: 28 },
    eligibility: { sellable: true, reasons: [] },
  });
  await syncCatalogueUnion(db, k, "maple");
  const sold = await db.variant.findUniqueOrThrow({ where: { id: "keeri:maple:variant1" } });
  assert.equal(sold.available, true);
  assert.equal(sold.stockPolicy, "made_to_order");
  assert.equal(sold.leadTimeDays, 28);
  Object.assign(k.models[0]!.variants[0]!, { eligibility: { sellable: false, reasons: ["approval_missing"] } });
  k.capturedAt = "2026-10-25T11:00:00Z";
  await syncCatalogueUnion(db, k, "maple");
  const withdrawn = await db.variant.findUniqueOrThrow({ where: { id: "keeri:maple:variant1" } });
  assert.equal(withdrawn.available, false);
});

test("a sync stores each product's Keeri offer, the product API serves it, and a later export without one clears it", async () => {
  const k = fixtures();
  const offer = { label: "15% off", code: "DIWALI15", startsAt: "2026-10-20T00:00:00.000Z", endsAt: "2026-11-20T00:00:00.000Z" };
  (k.models[0] as any).offer = offer;
  await syncCatalogueUnion(db, k, "maple");
  const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
  const product = await db.product.findFirstOrThrow({ where: { published: true } });
  const served = await request(app).get(`/api/products/${product.handle}`);
  assert.equal(served.status, 200);
  assert.deepEqual(served.body.offer, offer);
  (k.models[0] as any).offer = null;
  k.capturedAt = "2026-10-25T11:00:00Z";
  await syncCatalogueUnion(db, k, "maple");
  assert.equal((await request(app).get(`/api/products/${product.handle}`)).body.offer, null);
  (k.models[0] as any).offer = offer;
  k.capturedAt = "2026-10-25T12:00:00Z";
  await syncCatalogueUnion(db, k, "maple");
  delete (k.models[0] as any).offer;
  k.capturedAt = "2026-10-25T13:00:00Z";
  await syncCatalogueUnion(db, k, "maple");
  assert.equal((await request(app).get(`/api/products/${product.handle}`)).body.offer, null, "a lower level clears it too");
});
