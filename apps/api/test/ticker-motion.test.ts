import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const tokens = { editor: randomBytes(32).toString("hex"), publisher: randomBytes(32).toString("hex") };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const ids: string[] = [];
const http = request(createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false }));
const content = () => ({ schemaVersion: 1, homeSections: [{ key: "ticker", enabled: true }], homeCopy: { categoryHeading: "Rooms", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Furniture", testimonialHeading: "Customers", testimonialSubheading: "Stories" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/test.webp", alt: "Room" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: true } });
function authorized(req: request.Test, role: keyof typeof tokens = "publisher") { const token = tokens[role]; return req.set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token)); }
const save = (value: object, expectedVersion: number, role: keyof typeof tokens = "publisher") => authorized(http.put("/api/admin/content"), role).send({ expectedVersion, content: value });
const publish = (expectedVersion: number, role: keyof typeof tokens = "publisher") => authorized(http.post("/api/admin/content/publish"), role).send({ expectedVersion });
before(async () => {
  for (const role of ["editor", "publisher"] as const) {
    const staff = await db.shopAdmin.create({ data: { email: `ticker-${role}-${randomBytes(6).toString("hex")}@example.invalid`, passwordHash: "unused-test-password-hash", role } });
    ids.push(staff.id);
    await db.shopAdminSession.create({ data: { adminId: staff.id, tokenHash: digest(tokens[role]), expiresAt: new Date(Date.now() + 600_000) } });
  }
});
beforeEach(async () => { await db.shopContentRevision.deleteMany(); await db.shopContent.deleteMany(); });
after(async () => {
  await db.shopContentRevision.deleteMany(); await db.shopContent.deleteMany();
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: ids } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

test("legacy ticker and chairs heading omission remain absent through save and publication", async () => {
  const saved = await save(content(), 0);
  assert.equal(saved.status, 200);
  assert.equal(Object.hasOwn(saved.body.draft.motion, "autoplayTicker"), false);
  assert.equal(Object.hasOwn(saved.body.draft.homeCopy, "chairsHeading"), false);
  assert.equal((await publish(1)).status, 200);
  const published = (await http.get("/api/content/storefront")).body.content;
  assert.equal(Object.hasOwn(published.motion, "autoplayTicker"), false);
  assert.equal(Object.hasOwn(published.homeCopy, "chairsHeading"), false);
});

test("ticker and heading remain private until publisher approval and reject stale or unauthorized writes", async () => {
  assert.equal((await save(content(), 0)).status, 200);
  assert.equal((await publish(1)).status, 200);
  const original = (await http.get("/api/content/storefront")).body;
  const next = { ...content(), homeCopy: { ...content().homeCopy, chairsHeading: "Studio chairs" }, motion: { ...content().motion, autoplayTicker: false } };
  const saved = await save(next, 2, "editor");
  assert.equal(saved.status, 200, "Editors must be able to save private ticker and heading preferences");
  assert.equal(saved.body.version, 3);
  assert.deepEqual(saved.body.draft.motion, { autoplaySocial: false, autoplayCities: false, revealSections: true, autoplayTicker: false });
  assert.equal(saved.body.draft.homeCopy.chairsHeading, "Studio chairs");
  assert.deepEqual((await http.get("/api/content/storefront?draft=true")).body, original);
  assert.equal((await publish(3, "editor")).status, 403);
  assert.equal((await http.put("/api/admin/content").set("Origin", origin).send({ expectedVersion: 3, content: next })).status, 401);
  assert.equal((await authorized(http.put("/api/admin/content")).set("X-CSRF-Token", "invalid").send({ expectedVersion: 3, content: next })).status, 403);
  assert.equal((await save({ ...next, motion: { ...next.motion, autoplayTicker: true } }, 2)).status, 409);
  assert.equal((await authorized(http.get("/api/admin/content"))).body.draft.motion.autoplayTicker, false);
  assert.deepEqual((await http.get("/api/content/storefront")).body, original);
  assert.equal((await publish(3)).status, 200);
  const published = (await http.get("/api/content/storefront")).body;
  assert.equal(published.content.motion.autoplayTicker, false);
  assert.equal(published.content.homeCopy.chairsHeading, "Studio chairs");
  assert.equal((await save({ ...next, motion: { ...next.motion, autoplayTicker: true } }, 4)).status, 200);
  assert.deepEqual((await http.get("/api/content/storefront")).body, published);
  assert.equal((await publish(5)).status, 200);
  assert.equal((await http.get("/api/content/storefront")).body.content.motion.autoplayTicker, true);
});

test("invalid ticker types, headings and unknown motion fields do not create drafts or revisions", async () => {
  for (const value of ["false", 0, null, [], {}]) {
    assert.equal((await save({ ...content(), motion: { ...content().motion, autoplayTicker: value } }, 0)).status, 400);
  }
  for (const value of [null, false, "x".repeat(161), "bad\u0000text"]) {
    assert.equal((await save({ ...content(), homeCopy: { ...content().homeCopy, chairsHeading: value } }, 0)).status, 400);
  }
  assert.equal((await save({ ...content(), motion: { ...content().motion, autoplayUnknown: true } }, 0)).status, 400);
  assert.equal(await db.shopContent.count(), 0);
  assert.equal(await db.shopContentRevision.count(), 0);
});
