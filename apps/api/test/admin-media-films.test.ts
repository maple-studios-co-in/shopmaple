import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, open, readdir, readFile, rename, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { HttpError } from "../src/cart.js";
import { registerMediaRoutes, prepareMediaForPublication, sweepAbandonedUploads } from "../src/admin/media.js";
import { mp4Film, webmFilm } from "./fixtures/films.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000", token = randomBytes(32).toString("hex"), digest = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
let root: string, staffId: string;
function app(mediaRoot: string | null = root) {
  const app = express(); registerMediaRoutes(app, db, { webOrigin: origin, secureCookies: false, mediaRoot: mediaRoot ?? undefined });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) res.status(err.status).json({ code: err.code, message: err.message });
    else res.status(500).json({ code: "SERVER_ERROR" });
  }); return app;
}
const film = (bytes: Buffer, type = "video/mp4", http = request(app())) => http.post("/api/admin/media/films").set("Origin", origin).set("Cookie", `shop_admin=${token}`)
  .set("X-CSRF-Token", digest("csrf:" + token)).set("Content-Type", type).set("X-Media-Label", encodeURIComponent("Workshop film")).send(bytes);
const publish = (content: unknown) => db.$transaction(tx => prepareMediaForPublication(tx, content, root));
/** Collects a response body as bytes (supertest's own parsers would read a film as text). */
const binary = ((res: import("http").IncomingMessage, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => done(null, Buffer.concat(chunks)));
}) as unknown as Parameters<ReturnType<ReturnType<typeof request>["get"]>["parse"]>[0];
before(async () => {
  root = await mkdtemp(join(tmpdir(), "shop-film-test-"));
  const admin = await db.shopAdmin.create({ data: { email: `films-${randomBytes(6).toString("hex")}@example.invalid`, passwordHash: "unused-test-password-hash", role: "publisher" } }); staffId = admin.id;
  await db.shopAdminSession.create({ data: { adminId: staffId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 600000) } });
});
after(async () => {
  if (staffId) { await db.shopMediaAsset.deleteMany({ where: { createdById: staffId } }); await db.shopAdminSession.deleteMany({ where: { adminId: staffId } }); await db.shopAdmin.deleteMany({ where: { id: staffId } }); }
  await db.$disconnect(); if (root) await rm(root, { recursive: true, force: true });
});

test("film uploads need a staff session, CSRF token and the store's origin", async () => {
  const bytes = mp4Film({ seed: 90 });
  assert.equal((await request(app()).post("/api/admin/media/films").set("Origin", origin).set("Content-Type", "video/mp4").send(bytes)).status, 401);
  assert.equal((await request(app()).post("/api/admin/media/films").set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("Content-Type", "video/mp4").send(bytes)).status, 403);
  assert.equal((await request(app()).post("/api/admin/media/films").set("Origin", "https://attacker.invalid").set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token)).set("Content-Type", "video/mp4").send(bytes)).status, 403);
  assert.deepEqual(await readdir(root), []);
});

test("an MP4 is stored as uploaded under its hash, described, deduplicated and listed as a film", async () => {
  const bytes = mp4Film({ seed: 1, durationMs: 8000, width: 1920, height: 1080 });
  const response = await film(bytes); assert.equal(response.status, 201, JSON.stringify(response.body));
  const asset = response.body.asset;
  assert.equal(asset.kind, "video"); assert.equal(asset.mimeType, "video/mp4"); assert.equal(asset.sha256, digest(bytes)); assert.equal(asset.bytes, bytes.length);
  assert.equal(asset.durationMs, 8000); assert.equal(asset.width, 1920); assert.equal(asset.height, 1080); assert.equal(asset.faststart, true);
  assert.equal(asset.url, `/media/uploads/${digest(bytes)}.mp4`); assert.equal(asset.publicAt, null); assert.equal(asset.label, "Workshop film");
  assert.deepEqual(await readFile(join(root, `${asset.sha256}.mp4`)), bytes, "the film is kept byte for byte");
  const again = await film(bytes); assert.equal(again.status, 200); assert.equal(again.body.asset.id, asset.id);
  assert.deepEqual((await readdir(root)).sort(), [`${asset.sha256}.mp4`], "no temporary file is left behind");
  const films = await request(app()).get("/api/admin/media?kind=video").set("Cookie", `shop_admin=${token}`);
  assert.equal(films.status, 200); assert.ok(films.body.assets.some((item: { id: string }) => item.id === asset.id));
  assert.ok(films.body.assets.every((item: { kind: string }) => item.kind === "video"));
  const images = await request(app()).get("/api/admin/media?kind=image").set("Cookie", `shop_admin=${token}`);
  assert.ok(images.body.assets.every((item: { kind: string }) => item.kind === "image"));
  assert.equal((await request(app()).get("/api/admin/media?kind=audio").set("Cookie", `shop_admin=${token}`)).status, 400);
});

test("a WebM is accepted and a film without a fast start is marked", async () => {
  const webm = await film(webmFilm({ seed: 2, durationMs: 5000, width: 720, height: 1280 }), "video/webm");
  assert.equal(webm.status, 201, JSON.stringify(webm.body)); assert.equal(webm.body.asset.mimeType, "video/webm"); assert.match(webm.body.asset.url, /\.webm$/);
  assert.equal(webm.body.asset.durationMs, 5000); assert.equal(webm.body.asset.height, 1280); assert.equal(webm.body.asset.faststart, null);
  const slow = await film(mp4Film({ seed: 3, faststart: false }));
  assert.equal(slow.status, 201); assert.equal(slow.body.asset.faststart, false);
});

test("anything that is not a complete MP4 or WebM of the declared type is refused and leaves nothing behind", async () => {
  const before = (await readdir(root)).sort();
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toBuffer();
  const whole = mp4Film({ seed: 4 });
  const cases: [Buffer, string, number][] = [
    [webmFilm({ seed: 5 }), "video/mp4", 400], [mp4Film({ seed: 6 }), "video/webm", 400], [mp4Film({ seed: 7, brands: ["qt  "] }), "video/mp4", 400],
    [webmFilm({ seed: 8, docType: "matroska" }), "video/webm", 400], [whole.subarray(0, whole.length - 100), "video/mp4", 400],
    [Buffer.from("not a film at all"), "video/mp4", 400], [png, "video/mp4", 400], [whole, "video/quicktime", 415], [png, "image/png", 415],
  ];
  for (const [bytes, type, status] of cases) { const response = await film(bytes, type); assert.equal(response.status, status, `${type}: ${JSON.stringify(response.body)}`); }
  // The image endpoint keeps taking images only.
  const asImage = await request(app()).post("/api/admin/media").set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token)).set("Content-Type", "video/mp4").send(whole);
  assert.equal(asImage.status, 415);
  assert.deepEqual((await readdir(root)).sort(), before);
});

test("films over 80 MB are refused from their declared length, before any of the body is stored", async () => {
  const { request: send } = await import("node:http");
  const server = app().listen(0); const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = send({ host: "127.0.0.1", port: address.port, path: "/api/admin/media/films", method: "POST", headers: { Origin: origin, Cookie: `shop_admin=${token}`, "X-CSRF-Token": digest("csrf:" + token), "Content-Type": "video/mp4", "Content-Length": 80 * 1024 * 1024 + 1 } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.write(mp4Film({ seed: 9 }));
    });
    assert.equal(status, 413);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  assert.ok((await readdir(root)).every(name => !name.startsWith(".film-")));
});

test("a film sent in chunks with no length, as Cloudflare's tunnel sends uploads, is taken, and stopped once it passes 80 MB", async () => {
  const { request: send } = await import("node:http");
  const server = app().listen(0); const address = server.address(); assert.ok(address && typeof address !== "string");
  const headers = { Origin: origin, Cookie: `shop_admin=${token}`, "X-CSRF-Token": digest("csrf:" + token), "Content-Type": "video/mp4", "Transfer-Encoding": "chunked" };
  const upload = (write: (req: import("node:http").ClientRequest) => void) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = send({ host: "127.0.0.1", port: address.port, path: "/api/admin/media/films", method: "POST", headers }, res => {
      let body = ""; res.setEncoding("utf8"); res.on("data", chunk => { body += chunk; }); res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", error => (error as NodeJS.ErrnoException).code === "ECONNRESET" || (error as NodeJS.ErrnoException).code === "EPIPE" ? undefined : reject(error));
    write(req);
  });
  try {
    const bytes = mp4Film({ seed: 11, payload: 256 * 1024 });
    const ok = await upload(req => { for (let at = 0; at < bytes.length; at += 32 * 1024) req.write(bytes.subarray(at, at + 32 * 1024)); req.end(); });
    assert.equal(ok.status, 201, ok.body);
    assert.equal(JSON.parse(ok.body).asset.sha256, digest(bytes), "the chunked film is kept byte for byte");
    const big = await upload(req => {
      req.write(mp4Film({ seed: 12 }));
      const block = Buffer.alloc(1024 * 1024); let sent = 0;
      const more = () => { while (sent < 82) { sent++; if (!req.write(block)) { req.once("drain", more); return; } } req.end(); };
      req.on("response", () => { sent = 1e9; }); more();
    });
    assert.equal(big.status, 413, big.body);
    assert.equal(JSON.parse(big.body).code, "MEDIA_FILM_TOO_LARGE");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (let i = 0; i < 100 && (await readdir(root)).some(name => name.startsWith(".film-")); i++) await new Promise(r => setTimeout(r, 10));
  assert.ok((await readdir(root)).every(name => !name.startsWith(".film-")), "the oversized film's temporary file is removed");
});

test("a film that stops arriving part way leaves no temporary file", async () => {
  const { request: send } = await import("node:http");
  const server = app().listen(0); const address = server.address(); assert.ok(address && typeof address !== "string");
  const bytes = mp4Film({ seed: 10, payload: 64 * 1024 });
  try {
    const req = send({ host: "127.0.0.1", port: address.port, path: "/api/admin/media/films", method: "POST", headers: { Origin: origin, Cookie: `shop_admin=${token}`, "X-CSRF-Token": digest("csrf:" + token), "Content-Type": "video/mp4", "Content-Length": bytes.length } });
    req.on("error", () => {}); req.write(bytes.subarray(0, 8192));
    for (let i = 0; i < 100 && !(await readdir(root)).some(name => name.startsWith(".film-")); i++) await new Promise(r => setTimeout(r, 10));
    req.destroy();
    for (let i = 0; i < 100 && (await readdir(root)).some(name => name.startsWith(".film-")); i++) await new Promise(r => setTimeout(r, 10));
    assert.ok((await readdir(root)).every(name => !name.startsWith(".film-")), "an abandoned upload is removed");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  assert.equal(await db.shopMediaAsset.count({ where: { sha256: digest(bytes) } }), 0);
});

test("temporary upload files over an hour old are swept when the API starts; newer ones and films are kept", async () => {
  const { utimes, writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "shop-film-sweep-"));
  try {
    const old = ".film-0b6f5c1e-3a52-4c8e-9d7e-2f1a6b9c4d10.part", oldImage = ".upload-0b6f5c1e-3a52-4c8e-9d7e-2f1a6b9c4d11.tmp", fresh = ".film-0b6f5c1e-3a52-4c8e-9d7e-2f1a6b9c4d12.part", kept = `${"a".repeat(64)}.mp4`;
    for (const name of [old, oldImage, fresh, kept]) await writeFile(join(dir, name), "x");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    for (const name of [old, oldImage, kept]) await utimes(join(dir, name), twoHoursAgo, twoHoursAgo);
    assert.equal(await sweepAbandonedUploads(dir), 2);
    assert.deepEqual((await readdir(dir)).sort(), [fresh, kept].sort());
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("films stay private until published, then stream with byte ranges and long caching", async () => {
  const bytes = mp4Film({ seed: 11, payload: 10_000 }); const uploaded = await film(bytes); assert.equal(uploaded.status, 201); const asset = uploaded.body.asset;
  assert.equal((await request(app()).get(asset.url)).status, 404);
  // Staff preview the unpublished film, with ranges for Safari.
  const preview = await request(app()).get(asset.previewUrl).set("Cookie", `shop_admin=${token}`).set("Range", "bytes=0-99").buffer(true).parse(binary);
  assert.equal(preview.status, 206); assert.equal(preview.headers["content-range"], `bytes 0-99/${bytes.length}`); assert.match(String(preview.headers["cache-control"]), /no-store/);
  assert.deepEqual(preview.body, bytes.subarray(0, 100));
  assert.equal((await request(app()).get(asset.previewUrl)).status, 401);
  await publish({ templateFilms: [{ key: "nimbus-hero", src: asset.url }] });
  const whole = await request(app()).get(asset.url).buffer(true).parse(binary);
  assert.equal(whole.status, 200); assert.deepEqual(whole.body, bytes);
  assert.equal(whole.headers["content-type"], "video/mp4"); assert.equal(whole.headers["accept-ranges"], "bytes"); assert.equal(whole.headers["x-content-type-options"], "nosniff");
  assert.match(String(whole.headers["cache-control"]), /public, max-age=31536000, immutable/); assert.equal(whole.headers["content-length"], String(bytes.length));
  const middle = await request(app()).get(asset.url).set("Range", "bytes=1000-1999").buffer(true).parse(binary);
  assert.equal(middle.status, 206); assert.equal(middle.headers["content-length"], "1000"); assert.deepEqual(middle.body, bytes.subarray(1000, 2000));
  const tail = await request(app()).get(asset.url).set("Range", "bytes=-50").buffer(true).parse(binary);
  assert.equal(tail.status, 206); assert.deepEqual(tail.body, bytes.subarray(bytes.length - 50));
  const outside = await request(app()).get(asset.url).set("Range", `bytes=${bytes.length}-`);
  assert.equal(outside.status, 416); assert.equal(outside.headers["content-range"], `bytes */${bytes.length}`);
  // A stale If-Range gets the whole film rather than a piece of a different one.
  assert.equal((await request(app()).get(asset.url).set("Range", "bytes=0-9").set("If-Range", '"stale"')).status, 200);
  const head = await request(app()).head(asset.url); assert.equal(head.status, 200); assert.equal(head.headers["content-length"], String(bytes.length));
  // The same hash under the other film extension, or as an image, is not this file.
  assert.equal((await request(app()).get(asset.url.replace(".mp4", ".webm"))).status, 404);
  assert.equal((await request(app()).get(asset.url.replace(".mp4", ".webp"))).status, 404);
});

test("publication checks film fields as films and image fields as images", async () => {
  const uploaded = await film(mp4Film({ seed: 12 })); assert.equal(uploaded.status, 201); const asset = uploaded.body.asset;
  const imageBytes = await sharp({ create: { width: 12, height: 9, channels: 3, background: "#abcdef" } }).png().toBuffer();
  const image = await request(app()).post("/api/admin/media").set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token)).set("Content-Type", "image/png").send(imageBytes);
  assert.equal(image.status, 201); const poster = image.body.asset.url as string;
  const code = (e: unknown, expected: string) => e instanceof HttpError && e.code === expected;
  // A film in a picture field, or a picture in a film field, is refused.
  await assert.rejects(publish({ instagramPosts: [{ src: asset.url }] }), (e: unknown) => code(e, "MEDIA_REFERENCE_INVALID"));
  await assert.rejects(publish({ templateFilms: [{ key: "terra-hero", src: poster }] }), (e: unknown) => code(e, "MEDIA_REFERENCE_INVALID"));
  await assert.rejects(publish({ templateFilms: [{ key: "terra-hero", src: `/media/uploads/${asset.sha256}.mp4?x=1` }] }), (e: unknown) => code(e, "MEDIA_REFERENCE_INVALID"));
  // A film named with the wrong container, or one not in the library, is missing.
  await assert.rejects(publish({ templateFilms: [{ key: "terra-hero", src: asset.url.replace(".mp4", ".webm") }] }), (e: unknown) => code(e, "MEDIA_REFERENCE_MISSING"));
  await assert.rejects(publish({ templateFilms: [{ key: "terra-hero", src: `/media/uploads/${"9".repeat(64)}.mp4` }] }), (e: unknown) => code(e, "MEDIA_REFERENCE_MISSING"));
  assert.equal((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicAt, null);
  // A hero video slide publishes its film and its poster together.
  await publish({ homeDetails: { hero: { slides: [{ kind: "video", src: asset.url, poster, alt: "Workshop", headline: "Made here", intro: "Our workshop" }] } } });
  assert.equal((await request(app()).get(asset.url)).status, 200);
  assert.equal((await request(app()).get(poster)).status, 200);
});

test("publication refuses a film whose file is gone or has changed size", async () => {
  const uploaded = await film(mp4Film({ seed: 13 })); assert.equal(uploaded.status, 201); const asset = uploaded.body.asset;
  const path = join(root, `${asset.sha256}.mp4`), saved = await readFile(path);
  await rename(path, `${path}.away`);
  try { await assert.rejects(publish({ templateFilms: [{ key: "home-testimonial", src: asset.url }] }), (e: unknown) => e instanceof HttpError && e.code === "MEDIA_REFERENCE_MISSING"); }
  finally { await rename(`${path}.away`, path); }
  const handle = await open(path, "a"); await handle.write(Buffer.from("x")); await handle.close();
  try { await assert.rejects(publish({ templateFilms: [{ key: "home-testimonial", src: asset.url }] }), (e: unknown) => e instanceof HttpError && e.code === "MEDIA_REFERENCE_MISSING"); }
  finally { const restore = await open(path, "w"); await restore.write(saved); await restore.close(); }
  assert.equal((await request(app()).get(asset.url)).status, 404);
});

test("films have their own quota: 40 films or 3 GiB, and images are not counted against it", async () => {
  // An on-disk film this large (sparse, so it takes no real space) fills the film quota by itself.
  const big = join(root, `${"0".repeat(63)}1.mp4`), file = await open(big, "wx"); await file.truncate(3 * 1024 * 1024 * 1024); await file.close();
  try {
    const full = await film(mp4Film({ seed: 14 })); assert.equal(full.status, 409); assert.equal(full.body.code, "MEDIA_QUOTA_REACHED");
    // Choosing a film already in the library still works, and images keep their own quota.
    assert.equal((await film(mp4Film({ seed: 1, durationMs: 8000, width: 1920, height: 1080 }))).status, 200);
    const imageBytes = await sharp({ create: { width: 14, height: 9, channels: 3, background: "#fedcba" } }).png().toBuffer();
    const image = await request(app()).post("/api/admin/media").set("Origin", origin).set("Cookie", `shop_admin=${token}`).set("X-CSRF-Token", digest("csrf:" + token)).set("Content-Type", "image/png").send(imageBytes);
    assert.equal(image.status, 201);
  } finally { await unlink(big); }
  const count = await db.shopMediaAsset.count({ where: { kind: "video" } }), ids: string[] = [];
  try {
    await db.shopMediaAsset.createMany({ data: Array.from({ length: 40 - count }, (_, i) => { const id = `cfilmquota${i}`, sha256 = (i + 1).toString(16).padStart(64, "f"); ids.push(id); return { id, sha256, storageKey: `${sha256}.mp4`, kind: "video" as const, label: "Quota fixture", bytes: 1, mimeType: "video/mp4", createdById: staffId }; }) });
    const full = await film(mp4Film({ seed: 15 })); assert.equal(full.status, 409);
  } finally { await db.shopMediaAsset.deleteMany({ where: { id: { in: ids } } }); }
});
