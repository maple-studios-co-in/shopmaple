import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { HttpError } from "../src/cart.js";
import { prepareMediaForPublication } from "../src/admin/media.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const token = randomBytes(32).toString("hex");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
let root: string, staffId: string;
let http: ReturnType<typeof request>;
const tile = (image: string, enabled = true) => ({ key: "living", title: "Living room", collectionHandle: "living-room", image, alt: "A living room", enabled });
const content = () => ({ schemaVersion: 1, homeSections: [{ key: "categories", enabled: true }], homeCopy: { categoryHeading: "Rooms", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Furniture", testimonialHeading: "Customers", testimonialSubheading: "Stories" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/test.webp", alt: "Room" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: true } });
const authorized = (req: request.Test) => req.set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token));
const save = (value: object, expectedVersion: number) => authorized(http.put("/api/admin/content")).send({ expectedVersion, content: value });
const publish = (expectedVersion: number) => authorized(http.post("/api/admin/content/publish")).send({ expectedVersion });
async function upload(color: string) {
  const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: color } }).png().toBuffer();
  const result = await authorized(http.post("/api/admin/media")).set("Content-Type", "image/png").set("X-Media-Label", "Merchandising fixture").send(png);
  assert.equal(result.status, 201);
  return result.body.asset as { id: string; url: string; sha256: string };
}
before(async () => {
  root = await mkdtemp(join(tmpdir(), "shop-merchandising-test-"));
  const staff = await db.shopAdmin.create({ data: { email: `merch-${randomBytes(6).toString("hex")}@example.invalid`, passwordHash: "unused-test-password-hash", role: "publisher" } });
  staffId = staff.id;
  await db.shopAdminSession.create({ data: { adminId: staffId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 600_000) } });
  http = request(createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, mediaRoot: root }));
});
beforeEach(async () => {
  await db.shopContentRevision.deleteMany();
  await db.shopContent.deleteMany();
});
after(async () => {
  await db.shopContentRevision.deleteMany({ where: { actorId: staffId } });
  await db.shopContent.deleteMany();
  if (staffId) {
    await db.shopMediaAsset.deleteMany({ where: { createdById: staffId } });
    await db.shopAdminSession.deleteMany({ where: { adminId: staffId } });
    await db.shopAdmin.delete({ where: { id: staffId } });
  }
  await db.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
});

test("legacy drafts retain publication behavior without merchandising", async () => {
  const saved = await save(content(), 0);
  assert.equal(saved.status, 200);
  assert.equal((await http.get("/api/content/storefront")).status, 404);
  assert.equal((await publish(1)).status, 200);
  const published = await http.get("/api/content/storefront");
  assert.equal(published.status, 200);
  assert.equal(published.body.content.homeMerchandising, undefined);
});

test("saved merchandising stays private and publication exposes visible and hidden tile media with ordered selections", async () => {
  const category = await upload("#abc123"), offer = await upload("#def456");
  const homeMerchandising = { bestsellers: ["second-item", "first-item"], chairs: [], categories: [tile(category.url)], offers: [tile(offer.url, false)] };
  const saved = await save({ ...content(), homeMerchandising }, 0);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.draft.homeMerchandising, homeMerchandising);
  assert.deepEqual((await authorized(http.get("/api/admin/content"))).body.draft.homeMerchandising, homeMerchandising);
  assert.equal((await http.get("/api/content/storefront")).status, 404);
  for (const asset of [category, offer]) assert.equal((await http.get(asset.url)).status, 404);
  assert.equal((await publish(1)).status, 200);
  for (const asset of [category, offer]) {
    const publicImage = await http.get(asset.url);
    assert.equal(publicImage.status, 200, "Publishing must expose every tile image, including hidden offers");
    assert.match(String(publicImage.headers["cache-control"]), /immutable/);
  }
  assert.deepEqual((await http.get("/api/content/storefront")).body.content.homeMerchandising, homeMerchandising);
});

test("missing media in either tile rail refuses publication atomically without exposing valid draft assets", async () => {
  assert.equal((await save(content(), 0)).status, 200);
  assert.equal((await publish(1)).status, 200);
  const previous = (await http.get("/api/content/storefront")).body;
  const asset = await upload("#123789");
  let version = 2;
  for (const rail of ["categories", "offers"]) {
    const homeMerchandising = { bestsellers: [], chairs: [], categories: [tile(asset.url)], offers: [tile(asset.url)], [rail]: [tile(`/media/uploads/${"e".repeat(64)}.webp`, false)] };
    const saved = await save({ ...content(), homeMerchandising }, version);
    assert.equal(saved.status, 200);
    version = saved.body.version;
    const rejected = await publish(version);
    assert.equal(rejected.status, 400, "A missing hidden tile image must block publication");
    assert.equal(rejected.body.code, "MEDIA_REFERENCE_MISSING");
    assert.equal((await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } })).version, version);
    assert.deepEqual((await http.get("/api/content/storefront")).body, previous);
    assert.equal((await http.get(asset.url)).status, 404);
    assert.equal(await db.shopContentRevision.count({ where: { action: "publish" } }), 1);
  }
});

test("merchandising publication rejects missing files and malformed upload references", async () => {
  const asset = await upload("#a123bc");
  await unlink(join(root, `${asset.sha256}.webp`));
  await assert.rejects(db.$transaction(tx => prepareMediaForPublication(tx, { homeMerchandising: { categories: [tile(asset.url)] } }, root)), (error: unknown) => error instanceof HttpError && error.code === "MEDIA_REFERENCE_MISSING");
  assert.equal((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicAt, null);
  for (const rail of ["categories", "offers"]) {
    await assert.rejects(db.$transaction(tx => prepareMediaForPublication(tx, { homeMerchandising: { [rail]: [tile("/media/uploads/not-a-hash.webp")] } }, root)), (error: unknown) => error instanceof HttpError && error.code === "MEDIA_REFERENCE_INVALID");
  }
});
