import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import request from "supertest";
import { repoShopifyMediaSources, shopifyMediaName } from "@shopmaple/contracts/shopify-media";
import { createShopifyMediaStore, mapShopifyMediaInResponses, registerShopifyMedia, type ShopifyMediaConfig } from "../src/shopify-media.js";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(2000, 1)]);
const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
const chair = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png";
const chairName = shopifyMediaName(chair)!;

function app(config: ShopifyMediaConfig, routes?: (app: express.Express) => void) {
  const store = createShopifyMediaStore(config);
  const a = express();
  mapShopifyMediaInResponses(a, store);
  registerShopifyMedia(a, store);
  routes?.(a);
  a.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: true }));
  return a;
}
async function root(files: Record<string, Buffer> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "shopify-media-"));
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(directory, name), bytes);
  return directory;
}

test("a copied file is served from disk with its own type, a year's cache and byte ranges", async () => {
  const film = "a".repeat(32) + ".mp4", art = "b".repeat(32) + ".svg";
  const a = app({ root: await root({ [chairName]: png, [film]: mp4, [art]: svg }), fallback: false });
  const picture = await request(a).get(`/media/shopify/${chairName}`).buffer(true).parse((res, done) => { const parts: Buffer[] = []; res.on("data", (c: Buffer) => parts.push(c)); res.on("end", () => done(null, Buffer.concat(parts))); });
  assert.equal(picture.status, 200);
  assert.equal(picture.headers["content-type"], "image/png");
  assert.equal(picture.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(picture.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(picture.body, png);
  const part = await request(a).get(`/media/shopify/${film}`).set("Range", "bytes=0-99");
  assert.equal(part.status, 206);
  assert.equal(part.headers["content-type"], "video/mp4");
  assert.equal(part.headers["content-range"], `bytes 0-99/${mp4.length}`);
  const drawing = await request(a).get(`/media/shopify/${art}`);
  assert.equal(drawing.headers["content-type"], "image/svg+xml");
  assert.match(drawing.headers["content-security-policy"] ?? "", /sandbox/);
  const tail = await request(a).get(`/media/shopify/${film}`).set("Range", "bytes=-10");
  assert.equal(tail.headers["content-range"], `bytes ${mp4.length - 10}-${mp4.length - 1}/${mp4.length}`);
  const beyond = await request(a).get(`/media/shopify/${film}`).set("Range", `bytes=${mp4.length}-`);
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers["content-range"], `bytes */${mp4.length}`);
  const again = await request(a).get(`/media/shopify/${chairName}`).set("If-None-Match", picture.headers.etag!);
  assert.equal(again.status, 304);
  const head = await request(a).head(`/media/shopify/${film}`);
  assert.equal(head.headers["content-length"], String(mp4.length));
});

test("only fixed names are served: no traversal, no other files, no links, no queries, no mislabelled bytes", async () => {
  const directory = await root({ [chairName]: png, ["c".repeat(32) + ".png"]: Buffer.from("<html>not a picture</html>") });
  await writeFile(join(directory, "manifest.json"), "{}");
  await mkdir(join(directory, "d".repeat(32) + ".png"));
  await symlink(join(directory, chairName), join(directory, "e".repeat(32) + ".png"));
  const a = app({ root: directory, fallback: false });
  for (const path of ["manifest.json", "..%2Fsecret.png", "%2e%2e%2f" + chairName, chairName.toUpperCase(), chairName.replace(".png", ".exe"),
    "c".repeat(32) + ".png", "d".repeat(32) + ".png", "e".repeat(32) + ".png", `${chairName}?width=100`]) {
    const response = await request(a).get(`/media/shopify/${path}`);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers["cache-control"], "no-store", path);
  }
});

test("a known file not yet copied is fetched from Shopify's CDN for a picture and redirected there for a film", async () => {
  const film = Object.entries(repoShopifyMediaSources).find(([name]) => name.endsWith(".mp4"))!;
  const picture = Object.entries(repoShopifyMediaSources).find(([name]) => name.endsWith(".png"))!;
  const calls: string[] = [];
  const a = app({ root: await root(), fetch: (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "content-length": String(png.length) } });
  }) as typeof fetch });
  const image = await request(a).get(`/media/shopify/${picture[0]}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers["content-type"], "image/png");
  assert.equal(image.headers["cache-control"], "public, max-age=3600");
  assert.deepEqual(calls, [picture[1]]);
  assert.match(picture[1], /^https:\/\/cdn\.shopify\.com\//);
  const video = await request(a).get(`/media/shopify/${film[0]}`);
  assert.equal(video.status, 302);
  assert.equal(video.headers.location, film[1]);
  assert.equal(video.headers["cache-control"], "no-store");
  // An unknown name is never fetched from anywhere.
  assert.equal((await request(a).get(`/media/shopify/${"f".repeat(32)}.png`)).status, 404);
  assert.equal(calls.length, 1);
});

test("the server's manifest names files the repository does not, and its entries must match their names", async () => {
  const extra = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/From_the_database.png";
  const directory = await root();
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ version: 1, files: {
    [shopifyMediaName(extra)!]: { source: extra }, ["0".repeat(32) + ".png"]: { source: "https://evil.example/x.png" },
  } }));
  const calls: string[] = [];
  const a = app({ root: directory, fetch: (async (url: string | URL) => { calls.push(String(url)); return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } }); }) as typeof fetch });
  assert.equal((await request(a).get(`/media/shopify/${shopifyMediaName(extra)}`)).status, 200);
  assert.equal((await request(a).get(`/media/shopify/${"0".repeat(32)}.png`)).status, 404);
  assert.deepEqual(calls, [extra]);
});

test("the fallback refuses what is not a picture and goes quiet when switched off", async () => {
  const picture = Object.keys(repoShopifyMediaSources).find(name => name.endsWith(".png"))!;
  const page = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
  assert.equal((await request(app({ root: await root(), fetch: page })).get(`/media/shopify/${picture}`)).status, 404);
  let called = false;
  const off = app({ root: await root(), fallback: false, fetch: (async () => { called = true; return new Response(""); }) as typeof fetch });
  assert.equal((await request(off).get(`/media/shopify/${picture}`)).status, 404);
  assert.equal(called, false);
});

test("public answers name the local copy of a Shopify file the server holds; staff answers keep the stored address", async () => {
  const held = `https://shop.maplefurnishers.com/cdn/shop/files/Chairs_1.png?v=17&width=600`;
  const absent = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Not_copied.png?v=1";
  const body = { images: [held, absent, "//cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png?v=2"], html: `<p><img src="${chair}?v=3"></p>` };
  const a = app({ root: await root({ [chairName]: png }), refreshMs: 0 }, routes => {
    routes.get("/api/products", (_req, res) => { res.json(body); });
    routes.get("/api/admin/content", (_req, res) => { res.json(body); });
  });
  const local = `/media/shopify/${chairName}`;
  assert.deepEqual((await request(a).get("/api/products")).body, { images: [local, absent, local], html: `<p><img src="${local}"></p>` });
  assert.deepEqual((await request(a).get("/api/admin/content")).body, body);
});

test("a page's burst of pictures not copied yet waits its turn instead of failing", async () => {
  const pictures = Object.keys(repoShopifyMediaSources).filter(name => name.endsWith(".png")).slice(0, 12);
  let active = 0, most = 0;
  const a = app({ root: await root(), fetch: (async () => {
    active++; most = Math.max(most, active);
    await new Promise(resolve => setTimeout(resolve, 30));
    active--;
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
  }) as typeof fetch });
  const answers = await Promise.all(pictures.map(name => request(a).get(`/media/shopify/${name}`)));
  assert.deepEqual(answers.map(answer => answer.status), pictures.map(() => 200));
  assert.ok(most <= 6, `at most six fetches at once (saw ${most})`);
});
