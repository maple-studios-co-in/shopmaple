import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../src/cart.js";
import { mediaUsage, registerMediaRoutes } from "../src/admin/media.js";

// Managing the media library (owner, 23 Nov 2026: "an option for delete and edit of images in media gallery and delete
// should be of two types"): rename; remove (hidden from the library, the file kept so pages that use it keep working);
// restore; where a file is used; delete permanently (the row and the file), only a publisher, only for a removed file
// that neither the draft nor the live storefront uses.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const publisherToken = randomBytes(32).toString("hex"), editorToken = randomBytes(32).toString("hex");
const staffIds: string[] = [];
let root: string;
let savedDocument: { draft: Prisma.JsonValue; published: Prisma.JsonValue | null } | null = null;

function app() {
  const app = express();
  registerMediaRoutes(app, db, { webOrigin: origin, secureCookies: false, mediaRoot: root });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) res.status(err.status).json({ code: err.code, message: err.message });
    else res.status(500).json({ code: "SERVER_ERROR" });
  });
  return app;
}
const as = (token: string, call: request.Test) => call.set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token));
const upload = async (background: string, label: string) => {
  const png = await sharp({ create: { width: 320, height: 200, channels: 3, background } }).png().toBuffer();
  const response = await as(publisherToken, request(app()).post("/api/admin/media")).set("Content-Type", "image/png").set("X-Media-Label", encodeURIComponent(label)).send(png);
  assert.ok([200, 201].includes(response.status), String(response.status));
  return response.body.asset as { id: string; sha256: string; url: string; previewUrl: string; label: string; removedAt: string | null };
};
const listed = async (removed = false) => (await request(app()).get(`/api/admin/media${removed ? "?removed=1" : ""}`).set("Cookie", `shop_admin=${editorToken}`)).body.assets.map((asset: { id: string }) => asset.id) as string[];
const setDocument = (draft: Prisma.InputJsonValue, published: Prisma.InputJsonValue | null) =>
  db.shopContent.upsert({ where: { id: "storefront" }, create: { id: "storefront", draft, published: published ?? undefined }, update: { draft, published: published ?? Prisma.DbNull } });

before(async () => {
  root = await mkdtemp(join(tmpdir(), "shop-media-manage-"));
  const existing = await db.shopContent.findUnique({ where: { id: "storefront" }, select: { draft: true, published: true } });
  savedDocument = existing;
  for (const [role, token] of [["publisher", publisherToken], ["editor", editorToken]] as const) {
    const admin = await db.shopAdmin.create({ data: { email: `manage-${role}-${randomBytes(6).toString("hex")}@example.invalid`, name: `Manage ${role}`, passwordHash: "unused-test-password-hash", role } });
    staffIds.push(admin.id);
    await db.shopAdminSession.create({ data: { adminId: admin.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 600_000) } });
  }
});
after(async () => {
  if (savedDocument) await db.shopContent.update({ where: { id: "storefront" }, data: { draft: savedDocument.draft as Prisma.InputJsonValue, published: savedDocument.published === null ? Prisma.DbNull : savedDocument.published as Prisma.InputJsonValue } });
  else await db.shopContent.deleteMany({ where: { id: "storefront" } });
  await db.shopMediaAsset.deleteMany({ where: { createdById: { in: staffIds } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: staffIds } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: staffIds } } });
  await db.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
});

test("staff rename a file; the name must read", async () => {
  const asset = await upload("#7a1d16", "IMG_2041.png");
  const renamed = await as(editorToken, request(app()).patch(`/api/admin/media/${asset.id}`)).send({ label: "  Beds banner, Diwali  " });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.asset.label, "Beds banner, Diwali");
  for (const label of ["", "x".repeat(161), "two\nlines", 5]) assert.equal((await as(editorToken, request(app()).patch(`/api/admin/media/${asset.id}`)).send({ label })).status, 400, JSON.stringify(label));
  assert.equal((await request(app()).patch(`/api/admin/media/${asset.id}`).set("Origin", origin).set("Cookie", `shop_admin=${editorToken}`).send({ label: "No token" })).status, 403, "a change needs the CSRF token");
  assert.equal((await as(editorToken, request(app()).patch("/api/admin/media/nope")).send({ label: "Missing" })).status, 404);
});

test("a removed file leaves the library and its pickers but keeps serving, and comes back by Restore or by uploading it again", async () => {
  const asset = await upload("#2f6b32", "Removed then restored.png");
  const removed = await as(editorToken, request(app()).post(`/api/admin/media/${asset.id}/remove`));
  assert.equal(removed.status, 200);
  assert.ok(Number.isFinite(Date.parse(removed.body.asset.removedAt)));
  assert.equal((await listed()).includes(asset.id), false, "gone from the library");
  assert.equal((await listed(true)).includes(asset.id), true, "listed under Removed");
  assert.equal((await request(app()).get(asset.previewUrl).set("Cookie", `shop_admin=${editorToken}`)).status, 200, "the file is kept");
  const restored = await as(editorToken, request(app()).post(`/api/admin/media/${asset.id}/restore`));
  assert.equal(restored.body.asset.removedAt, null);
  assert.equal((await listed()).includes(asset.id), true);
  await as(editorToken, request(app()).post(`/api/admin/media/${asset.id}/remove`));
  const again = await upload("#2f6b32", "Uploaded again.png");
  assert.equal(again.id, asset.id, "the same picture");
  assert.equal(again.removedAt, null, "uploading it again brings it back");
});

test("where a file is used is listed for the draft and the live storefront", async () => {
  const asset = await upload("#563c49", "Used.png");
  await setDocument({ instagramPosts: [{ src: "/media/uploads/other.webp" }, { src: asset.url }], campaigns: [{ key: "beds-hero", artwork: { desktopImage: asset.url } }] }, { pages: [{ title: "Our Story", banner: { mobileImage: asset.url } }] });
  const usage = await request(app()).get(`/api/admin/media/${asset.id}/usage`).set("Cookie", `shop_admin=${editorToken}`);
  assert.equal(usage.status, 200);
  assert.deepEqual(usage.body, { draft: ["Instagram, post 2", "Campaign “beds-hero”, wide picture"], published: ["Page “Our Story”, phone banner"] });
  assert.deepEqual(mediaUsage({ homeDetails: { hero: { slides: [{ kind: "video", src: "/media/uploads/f.mp4", poster: asset.url }] } } }).get(asset.url), ["Homepage hero, slide 1 (cover)"]);
});

test("only a publisher deletes permanently, from Removed or straight from the library, and never a file the draft or the live storefront uses", async () => {
  const asset = await upload("#b07a1f", "To delete.png");
  const file = join(root, `${asset.sha256}.webp`);
  await as(editorToken, request(app()).post(`/api/admin/media/${asset.id}/remove`));
  const editor = await as(editorToken, request(app()).delete(`/api/admin/media/${asset.id}`));
  assert.equal(editor.status, 403);
  assert.equal(editor.body.message, "A publisher must approve this change.");
  await setDocument({ campaigns: [{ key: "beds-hero", artwork: { mobileImage: asset.url } }] }, { instagramPosts: [{ src: asset.url }] });
  const used = await as(publisherToken, request(app()).delete(`/api/admin/media/${asset.id}`));
  assert.equal(used.status, 409);
  assert.equal(used.body.code, "MEDIA_IN_USE");
  assert.equal(used.body.message, "It is still used: Instagram, post 1 (live); Campaign “beds-hero”, phone picture (draft). Choose another picture there and save and publish first.");
  await setDocument({ campaigns: [] }, { instagramPosts: [] });
  const deleted = await as(publisherToken, request(app()).delete(`/api/admin/media/${asset.id}`));
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { deleted: asset.id });
  assert.equal(await db.shopMediaAsset.findUnique({ where: { id: asset.id } }), null, "the row is gone");
  await assert.rejects(access(file), "and the file");
  assert.equal((await request(app()).get(asset.previewUrl).set("Cookie", `shop_admin=${editorToken}`)).status, 404);
  assert.equal((await listed(true)).includes(asset.id), false);
  assert.equal((await as(publisherToken, request(app()).delete(`/api/admin/media/${asset.id}`))).status, 404, "nothing left to delete");
  // The second kind of delete sits beside Remove on every card (owner, 23 Nov 2026): a file still in the library goes too.
  const direct = await upload("#3d5a80", "Deleted from the library.png");
  assert.equal(direct.removedAt, null);
  const gone = await as(publisherToken, request(app()).delete(`/api/admin/media/${direct.id}`));
  assert.equal(gone.status, 200);
  assert.equal(await db.shopMediaAsset.findUnique({ where: { id: direct.id } }), null);
  await assert.rejects(access(join(root, `${direct.sha256}.webp`)));
});
