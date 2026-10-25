import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import request from "supertest";
import { createApp } from "../src/app.js";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import { adaptShopifyCatalogue } from "../src/shopify-catalogue.js";
import { pdpFixture, tree } from "./fixtures/product-pdp.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/shopmaple_test") throw new Error("Dedicated local test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany(); await db.cart.deleteMany(); await db.variant.deleteMany(); await db.product.deleteMany(); await db.catalogueSyncState.deleteMany();
});
function fixtures() {
  const s = pdpFixture(), k = v2Fixture(); k.publicMedia = []; k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  return { s, k };
}
test("PDP content survives real union persistence, scheduled refresh and public API serialization; source null revokes stale content", async () => {
  const { s, k } = fixtures();
  await syncCatalogueUnion(db, s, k, "maple");
  let response = await request(app).get("/api/products/real-chair");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.pdpContent.details, tree);
  assert.equal(response.body.pdpContent.materialsCare, null);
  assert.equal(response.body.pdpContent.sourceProductId, "gid://shopify/Product/101");
  k.capturedAt = "2026-10-25T11:00:00Z";
  await syncCatalogueUnion(db, s, k, "maple");
  const row = await db.product.findUniqueOrThrow({ where: { id: "preview-101" }, include: { variants: true } });
  assert.deepEqual((row.pdpContent as any).details, tree);
  assert.equal(row.description, "Actual description");
  assert.deepEqual(row.variants.map(v => [v.id, v.available, v.stockPolicy]), [["preview-201", false, "stocked"]]);
  (s.pdpMetafields.products[0] as any).details = null;
  k.capturedAt = "2026-10-25T12:00:00Z";
  await syncCatalogueUnion(db, s, k, "maple");
  response = await request(app).get("/api/products/real-chair");
  assert.equal(response.body.pdpContent.details, null);
  assert.equal(response.body.description, "Actual description");
});
test("malicious source rejects atomically and unsafe persisted content cannot escape public serialization", async () => {
  const { s, k } = fixtures();
  await syncCatalogueUnion(db, s, k, "maple");
  const before = await db.catalogueSyncState.findMany();
  (s.pdpMetafields.products[0]!.details.jsonValue as any).children[0].children = [{ type: "link", url: "javascript:alert(1)", children: [{ type: "text", value: "unsafe" }] }];
  k.capturedAt = "2026-10-25T11:00:00Z";
  await assert.rejects(syncCatalogueUnion(db, s, k, "maple"));
  assert.deepEqual(await db.catalogueSyncState.findMany(), before);
  const valid = await db.product.findUniqueOrThrow({ where: { id: "preview-101" } });
  assert.deepEqual((valid.pdpContent as any).details, tree);
  await db.product.update({ where: { id: "preview-101" }, data: { pdpContent: { ...(valid.pdpContent as any), details: s.pdpMetafields.products[0]!.details.jsonValue } } });
  const response = await request(app).get("/api/products/real-chair");
  assert.notEqual(response.status, 200);
  assert.equal(JSON.stringify(response.body).includes("javascript:"), false);
});
test("legacy preview import without PDP capture clears prior PDP data instead of retaining stale source copy", async () => {
  const { s, k } = fixtures();
  await syncCatalogueUnion(db, s, k, "maple");
  const p = adaptShopifyCatalogue(s).products[0]!;
  delete p.pdpContent;
  const dir = await mkdtemp(join(tmpdir(), "shopmaple-pdp-test-"));
  try {
    const file = join(dir, "legacy.json");
    await writeFile(file, JSON.stringify({ schemaVersion: 1, source: "shopify-preview", capturedAt: s.capturedAt, products: [p] }));
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    await promisify(execFile)(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/import-preview.ts", file], { cwd: root, env: { ...process.env, NODE_ENV: "test", DATABASE_URL: url } });
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: "preview-101" } })).pdpContent, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("catalogue listing omits full PDP documents while product detail retains them", async () => {
  const { s, k } = fixtures();
  await syncCatalogueUnion(db, s, k, "maple");
  const listing = await request(app).get("/api/products");
  assert.equal(listing.status, 200);
  assert.equal(listing.body.products.length, 1);
  assert.equal(Object.hasOwn(listing.body.products[0], "pdpContent"), false);
  assert.equal(listing.body.products[0].description, "Actual description");
  const detail = await request(app).get("/api/products/real-chair");
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.pdpContent.details, tree);
});
