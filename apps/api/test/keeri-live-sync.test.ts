import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { catalogueCommandOptions, pullKeeriCatalogue } from "../src/keeri-live-sync.js";
import { keeriFixture } from "./fixtures/keeri.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/shopmaple_test")
  throw new Error("Dedicated shopmaple_test database required");
const db = new PrismaClient({datasources: {db: {url: databaseUrl}}});
const now = new Date("2026-10-25T10:02:00Z");
const options = {origin: "https://maplefurnishers.keeri.in", token: "synthetic-catalogue-service-token", tenantId: "maple", now};
function fixture() {
  const data = keeriFixture();
  data.publicMedia[0]!.url = "https://cdn.shopify.com/s/files/synthetic/zyro.webp";
  return data;
}
const response = (data = fixture()) => Response.json(data);
before(() => db.$connect());
beforeEach(async () => {
  await db.cartItem.deleteMany(); await db.cart.deleteMany();
  await db.variant.deleteMany(); await db.product.deleteMany(); await db.catalogueSyncState.deleteMany();
  await db.product.create({data: {id:"preview-1", handle:"preview-chair", title:"Public preview", category:"chairs", description:"", images:[], published:true, source:"shopify-preview", sourceUpdatedAt:now}});
});
after(() => db.$disconnect());

test("command is read-only by default and requires explicit flags for apply or empty retirement", () => {
  const env={KEERI_ORIGIN:options.origin, KEERI_CATALOGUE_TOKEN:options.token, KEERI_TENANT_ID:"maple", DATABASE_URL:databaseUrl, APPROVE_KEERI_CATALOGUE:"publish-selected-keeri-no-checkout"};
  assert.equal(catalogueCommandOptions([], env).apply, false);
  assert.equal(catalogueCommandOptions(["--apply", "--allow-empty"], env).allowEmpty, true);
  assert.equal(catalogueCommandOptions(["--apply"], env).approval, "publish-selected-keeri-no-checkout");
  for (const args of [["--allow-empty"], ["--force"], ["--apply", "--apply"]])
    assert.throws(() => catalogueCommandOptions(args,env), /INVALID_SYNC_ARGUMENTS/);
  assert.throws(() => catalogueCommandOptions([],{}), /MISSING_SYNC_CONFIGURATION/);
});

test("live pull defaults to a read-only reviewed catalogue summary without a database URL", async () => {
  const result = await pullKeeriCatalogue({...options, fetch: async (url, init) => {
    assert.equal(String(url), "https://maplefurnishers.keeri.in/api/storefront/catalogue");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-catalogue-service-token");
    return response();
  }});
  assert.deepEqual(result, {source:"keeri:maple", capturedAt:"2026-10-25T10:00:00Z", eligibleProducts:1, dryRun:true, checkoutEnabled:false});
  assert.equal(await db.product.count(), 1);
  assert.equal(await db.catalogueSyncState.count(), 0);
});

test("apply rejects unapproved or nonisolated database targets before contacting Keeri", async () => {
  for (const patch of [
    {databaseUrl, approval:""},
    {databaseUrl:"postgresql://synthetic@127.0.0.1:5432/keeri", approval:"publish-selected-keeri-no-checkout"},
    {databaseUrl:"postgresql://synthetic@remote.example.com:55440/shopmaple_store", approval:"publish-selected-keeri-no-checkout"},
    {databaseUrl:"postgresql://synthetic@127.0.0.1:55440/shopmaple_store?host=remote.example.com", approval:"publish-selected-keeri-no-checkout"},
  ]) {
    let requested = false;
    await assert.rejects(pullKeeriCatalogue({...options, apply:true, ...patch, fetch:async () => {requested=true; return response();}}), /ISOLATED_DATABASE_APPROVAL_REQUIRED/);
    assert.equal(requested, false);
  }
});

test("approved pull persists eligible Keeri products without enabling stock or replacing public preview", async () => {
  const result = await pullKeeriCatalogue({...options, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response()});
  assert.equal(result.dryRun, false);
  const item = await db.product.findUniqueOrThrow({where:{id:"keeri:maple:model1"},include:{variants:true}});
  assert.equal(item.variants[0]!.available, false);
  assert.equal(item.variants[0]!.pricePaise, 1234567);
  assert.equal((await db.product.findUniqueOrThrow({where:{id:"preview-1"}})).published, true);
  assert.equal(await db.catalogueSyncState.count(), 1);
});

test("stale or future snapshots cannot update the storefront read model", async () => {
  for (const clock of [new Date("2026-10-25T10:16:00Z"), new Date("2026-10-25T09:58:00Z")]) {
    await assert.rejects(pullKeeriCatalogue({...options, now:clock, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response()}), /STALE_OR_FUTURE_SNAPSHOT/);
  }
  assert.equal(await db.product.count(), 1);
  assert.equal(await db.catalogueSyncState.count(), 0);
});

test("media outside the deployed storefront image allowlist blocks publication", async () => {
  for (const url of ["https://private.example.com/admin/photo.webp", "https://cdn.shopify.com/admin/photo.webp", "https://shop.maplefurnishers.com:444/cdn/shop/photo.webp"]) {
    const input=fixture(); input.publicMedia[0]!.url=url;
    await assert.rejects(pullKeeriCatalogue({...options, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response(input)}), /UNSUPPORTED_PUBLIC_MEDIA/);
  }
  assert.equal(await db.product.count(), 1);
});

test("wrong-tenant responses cannot write products or advance the sync cursor", async () => {
  const input=fixture(); input.tenantId="other-merchant";
  await assert.rejects(pullKeeriCatalogue({...options, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response(input)}), /INVALID_EXPORT/);
  assert.equal(await db.product.count(), 1);
  assert.equal(await db.catalogueSyncState.count(), 0);
});

test("colliding preview handles fail atomically without exposing database details", async () => {
  const input=fixture(); input.publication[0]!.handle="preview-chair";
  await assert.rejects(pullKeeriCatalogue({...options, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response(input)}), /^Error: CATALOGUE_APPLY_FAILED$/);
  assert.equal(await db.product.count(), 1);
  assert.equal(await db.catalogueSyncState.count(), 0);
  assert.equal((await db.product.findUniqueOrThrow({where:{id:"preview-1"}})).published, true);
});

test("empty catalogue needs explicit retirement approval and never retires Shopify preview", async () => {
  await pullKeeriCatalogue({...options, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response()});
  const input=fixture(); input.models=[]; input.publication=[]; input.publicMedia=[];
  input.capturedAt="2026-10-25T10:01:00Z";
  await assert.rejects(pullKeeriCatalogue({...options, databaseUrl, apply:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response(input)}), /EMPTY_CATALOGUE_REQUIRES_APPROVAL/);
  assert.equal((await db.product.findUniqueOrThrow({where:{id:"keeri:maple:model1"}})).published, true);
  await pullKeeriCatalogue({...options, databaseUrl, apply:true, allowEmpty:true, approval:"publish-selected-keeri-no-checkout", fetch:async () => response(input)});
  assert.equal((await db.product.findUniqueOrThrow({where:{id:"preview-1"}})).published, true);
  assert.equal((await db.product.findUniqueOrThrow({where:{id:"keeri:maple:model1"}})).published, false);
});
