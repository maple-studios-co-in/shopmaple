import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000", token = randomBytes(32).toString("hex"), digest = (v: string) => createHash("sha256").update(v).digest("hex");
let root: string, staffId: string;
const fixture = () => ({ schemaVersion: 1, homeSections: [{ key: "hero", enabled: false }, { key: "nimbus", enabled: false }], homeCopy: { categoryHeading: "Rooms", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Furniture", testimonialHeading: "Customers", testimonialSubheading: "Stories" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/existing.webp", alt: "Room" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } });
let http: ReturnType<typeof request>;
const auth = { Origin: origin, Cookie: `shop_admin=${token}`, "X-CSRF-Token": digest("csrf:" + token) };
before(async () => {
  root = await mkdtemp(join(tmpdir(), "template-media-test-"));
  const staff = await db.shopAdmin.create({ data: { email: `artwork-${randomBytes(6).toString("hex")}@example.invalid`, passwordHash: "unused-test-password-hash", role: "publisher" } });
  staffId = staff.id;
  await db.shopAdminSession.create({ data: { adminId: staffId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 600000) } });
  http = request(createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, mediaRoot: root }));
});
after(async () => {
  if (staffId) {
    await db.shopContentRevision.deleteMany({ where: { actorId: staffId } });
    await db.shopMediaAsset.deleteMany({ where: { createdById: staffId } });
    await db.shopAdminSession.deleteMany({ where: { adminId: staffId } });
    await db.shopAdmin.deleteMany({ where: { id: staffId } });
  }
  await db.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
});
async function upload(background: string) {
  const image = await sharp({ create: { width: 16, height: 12, channels: 3, background } }).png().toBuffer();
  const response = await http.post("/api/admin/media").set(auth).set("Content-Type", "image/png").send(image);
  assert.equal(response.status, 201);
  return response.body.asset as { id: string; url: string; sha256: string; previewUrl: string };
}
async function save(templateMedia: unknown[]) {
  const version = (await db.shopContent.findUnique({ where: { id: "storefront" } }))?.version ?? 0;
  const response = await http.put("/api/admin/content").set(auth).send({ expectedVersion: version, content: { ...fixture(), templateMedia } });
  assert.equal(response.status, 200);
  return response.body.version as number;
}
const publish = (expectedVersion: number) => http.post("/api/admin/content/publish").set(auth).send({ expectedVersion });

test("draft template images stay private and publishing hidden artwork exposes both responsive files", async () => {
  const desktop = await upload("#102030"), mobile = await upload("#203040");
  const templateMedia = [{ key: "home-nimbus", image: desktop.url, mobileImage: mobile.url, alt: "Nimbus room" }];
  const version = await save(templateMedia);
  const draft = await http.get("/api/admin/content").set(auth);
  assert.deepEqual(draft.body.draft.templateMedia, templateMedia);
  for (const asset of [desktop, mobile]) {
    assert.equal((await http.get(asset.url)).status, 404);
    assert.equal((await http.get(asset.previewUrl)).status, 401);
    assert.equal((await http.get(asset.previewUrl).set(auth)).status, 200);
  }
  assert.equal((await publish(version)).status, 200);
  const publicContent = await http.get("/api/content/storefront");
  assert.deepEqual(publicContent.body.content.templateMedia, templateMedia);
  for (const asset of [desktop, mobile]) {
    const response = await http.get(asset.url);
    assert.equal(response.status, 200, "Every referenced template image must become public even when its section is hidden");
    const cacheControl = response.headers["cache-control"];
    assert.equal(typeof cacheControl, "string");
    assert.match(cacheControl!, /immutable/);
  }
});

test("missing template upload references reject publication atomically", async () => {
  const asset = await upload("#304050");
  const version = await save([{ key: "home-nimbus", image: asset.url, mobileImage: `/media/uploads/${"f".repeat(64)}.webp`, alt: "Nimbus" }]);
  const previous = await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } });
  const revisionCount = await db.shopContentRevision.count();
  const response = await publish(version);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "MEDIA_REFERENCE_MISSING");
  const current = await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } });
  assert.equal(current.version, version);
  assert.deepEqual(current.published, previous.published);
  assert.equal(await db.shopContentRevision.count(), revisionCount);
  assert.equal((await http.get(asset.url)).status, 404);
  assert.equal((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicAt, null);
});

test("missing template files and malformed managed paths cannot publish or expose other valid images", async () => {
  const desktop = await upload("#405060"), mobile = await upload("#506070");
  const version = await save([{ key: "nimbus-hero-poster", image: desktop.url, mobileImage: mobile.url, alt: "Collection film" }]);
  const path = join(root, `${mobile.sha256}.webp`);
  await rename(path, `${path}.missing`);
  try {
    const response = await publish(version);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "MEDIA_REFERENCE_MISSING");
    assert.equal((await http.get(desktop.url)).status, 404);
    assert.equal((await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } })).version, version);
  } finally { await rename(`${path}.missing`, path); }
  const malformedVersion = await save([{ key: "home-newsletter", image: "/media/uploads/not-a-hash.webp", alt: "Room" }]);
  const malformed = await publish(malformedVersion);
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, "MEDIA_REFERENCE_INVALID");
});
