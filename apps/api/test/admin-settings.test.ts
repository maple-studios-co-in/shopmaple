import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { HttpError } from "../src/cart.js";
import { registerMediaRoutes } from "../src/admin/media.js";
import { readMediaUploadRules, registerSettingsRoutes } from "../src/admin/settings.js";

// Settings (owner, 23 Nov 2026): a publisher chooses the only banner sizes the media library takes; uploads of any other
// size are refused with the list, by the API as well as by the admin.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const publisherToken = randomBytes(32).toString("hex"), editorToken = randomBytes(32).toString("hex");
const staffIds: string[] = [];
let root: string;

function app() {
  const app = express();
  registerMediaRoutes(app, db, { webOrigin: origin, secureCookies: false, mediaRoot: root });
  app.use(express.json({ limit: "16kb" }));
  registerSettingsRoutes(app, db, false);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) res.status(err.status).json({ code: err.code, message: err.message });
    else res.status(500).json({ code: "SERVER_ERROR" });
  });
  return app;
}
const save = (rules: unknown, token = publisherToken, csrf = true) => {
  const call = request(app()).put("/api/admin/settings/media-uploads").set("Origin", origin).set("Cookie", `shop_admin=${token}`).send({ rules });
  return csrf ? call.set("X-CSRF-Token", digest("csrf:" + token)) : call;
};
const upload = (bytes: Buffer, type = "image/png") => request(app()).post("/api/admin/media").set("Origin", origin).set("Cookie", `shop_admin=${publisherToken}`)
  .set("X-CSRF-Token", digest("csrf:" + publisherToken)).set("Content-Type", type).set("X-Media-Label", encodeURIComponent("Banner")).send(bytes);
const picture = (width: number, height: number, background = "#7a1d16") => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

before(async () => {
  root = await mkdtemp(join(tmpdir(), "shop-settings-test-"));
  await db.shopSetting.deleteMany({ where: { key: "media-uploads" } });
  for (const [role, token] of [["publisher", publisherToken], ["editor", editorToken]] as const) {
    const admin = await db.shopAdmin.create({ data: { email: `settings-${role}-${randomBytes(6).toString("hex")}@example.invalid`, name: `Settings ${role}`, passwordHash: "unused-test-password-hash", role } });
    staffIds.push(admin.id);
    await db.shopAdminSession.create({ data: { adminId: admin.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 600_000) } });
  }
});
after(async () => {
  await db.shopSetting.deleteMany({ where: { key: "media-uploads" } });
  await db.shopMediaAsset.deleteMany({ where: { createdById: { in: staffIds } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: staffIds } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: staffIds } } });
  await db.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
});

test("any staff member reads the upload rules, which take every size until a publisher sets them", async () => {
  assert.equal((await request(app()).get("/api/admin/settings/media-uploads")).status, 401);
  const read = await request(app()).get("/api/admin/settings/media-uploads").set("Cookie", `shop_admin=${editorToken}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, { rules: { restrictSizes: false, sizes: [], maxImageBytes: 5 * 1024 * 1024 }, updatedAt: null, updatedBy: null }, "files up to 5 MB until a publisher chooses (owner, 23 Nov 2026)");
  assert.match(String(read.headers["cache-control"]), /no-store/);
});

test("only a publisher changes them, with the session's token, and only to rules that read", async () => {
  const rules = { restrictSizes: true, sizes: [{ width: 2784, height: 400, label: "Collection banner" }, { width: 500, height: 500, label: "" }] };
  const editor = await save(rules, editorToken);
  assert.equal(editor.status, 403);
  assert.equal(editor.body.message, "A publisher must approve this change.");
  assert.equal((await save(rules, publisherToken, false)).status, 403, "a change needs the CSRF token");
  for (const [bad, reason] of [
    [{ restrictSizes: true, sizes: [] }, "at least one size"],
    [{ restrictSizes: false, sizes: [{ width: 500, height: 500, label: "" }, { width: 500, height: 500, label: "Again" }] }, "listed once"],
    [{ restrictSizes: false, sizes: [{ width: 6000, height: 5000, label: "" }] }, "24 million"],
    [{ restrictSizes: false, sizes: [{ width: 0, height: 5, label: "" }] }, ""],
    [{ restrictSizes: "yes", sizes: [] }, ""],
    [{ restrictSizes: false, sizes: [], maxImageBytes: 3 * 1024 * 1024 }, ""],
    [{ restrictSizes: false, sizes: [], maxImageBytes: 9 * 1024 * 1024 }, ""],
  ] as const) {
    const refused = await save(bad);
    assert.equal(refused.status, 400, JSON.stringify(bad));
    assert.equal(refused.body.code, "SETTINGS_INVALID");
    if (reason) assert.match(refused.body.message, new RegExp(reason));
  }
  const saved = await save(rules);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.rules, { ...rules, maxImageBytes: 5 * 1024 * 1024 }, "rules saved without a file size keep 5 MB");
  assert.equal(saved.body.updatedBy, "Settings publisher");
  assert.ok(Number.isFinite(Date.parse(saved.body.updatedAt)));
  assert.deepEqual(await readMediaUploadRules(db), { ...rules, maxImageBytes: 5 * 1024 * 1024 });
});

test("while the rule is on, a picture of any other size is refused with the list, and nothing is stored", async () => {
  await save({ restrictSizes: true, sizes: [{ width: 2784, height: 400, label: "Collection banner" }, { width: 500, height: 500, label: "" }] });
  const refused = await upload(await picture(3000, 1500));
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, "MEDIA_SIZE_NOT_ALLOWED");
  assert.equal(refused.body.message, "This picture is 3000 × 1500 px. Only these sizes can be uploaded: 2784 × 400, 500 × 500 px. A publisher can change the list under Settings, Banner sizes.");
  assert.deepEqual(await readdir(root), [], "a refused picture is never written");
  // The size checked is the picture as made, before the library fits it within 2560 px.
  const banner = await upload(await picture(2784, 400));
  assert.equal(banner.status, 201);
  assert.equal(banner.body.asset.width, 2560);
  // A photo stored on its side with an EXIF turn is judged upright.
  const turned = await sharp({ create: { width: 500, height: 500, channels: 3, background: "#123456" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await upload(turned, "image/jpeg")).status, 201);
  const sideways = await sharp({ create: { width: 400, height: 2784, channels: 3, background: "#654321" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await upload(sideways, "image/jpeg")).status, 201, "400 x 2784 stored, turned a quarter: 2784 x 400 upright");
  const upright = await sharp({ create: { width: 400, height: 2784, channels: 3, background: "#654322" } }).jpeg().toBuffer();
  assert.equal((await upload(upright, "image/jpeg")).status, 422, "the same pixels without the turn are 400 x 2784");
});

test("with the rule off, every size is taken again", async () => {
  await save({ restrictSizes: false, sizes: [{ width: 2784, height: 400, label: "Collection banner" }] });
  assert.equal((await upload(await picture(1234, 567, "#0a0b0c"))).status, 201);
});

test("a picture file larger than Settings allows is refused with its size, before it is decoded", async () => {
  await save({ restrictSizes: false, sizes: [], maxImageBytes: 1024 * 1024 });
  // Noise does not compress, so this PNG is about 1.5 MB.
  const noisy = await sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(noisy.length > 1024 * 1024 && noisy.length < 2 * 1024 * 1024, String(noisy.length));
  const refused = await upload(noisy);
  assert.equal(refused.status, 413);
  assert.equal(refused.body.code, "MEDIA_TOO_LARGE");
  assert.match(refused.body.message, /^This file is 1\.\d MB\. The largest picture file allowed is 1 MB\. A publisher can change it under Settings, Banner sizes\.$/);
  await save({ restrictSizes: false, sizes: [], maxImageBytes: 2 * 1024 * 1024 });
  assert.equal((await upload(noisy)).status, 201, "taken once the limit is raised");
  await save({ restrictSizes: false, sizes: [] });
});
