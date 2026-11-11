import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { shopifyMediaName } from "../packages/contracts/src/shopify-media";
import { collectRepo, planFromFound, runMigration, urlsInText, type MigrationOptions } from "./shopify-media-migration.js";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(100, 1)]);
const chair = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png";
const film = "https://cdn.shopify.com/videos/c/vp/abc/abc.HD-720p.mp4";
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A Shopify CDN double: each address answers with its own status, type and bytes, and every request is recorded. */
function cdn(routes: Record<string, { status?: number; type?: string; body?: Buffer; length?: string; location?: string }[] | { status?: number; type?: string; body?: Buffer; length?: string; location?: string }>) {
  const calls: { url: string; method: string }[] = [];
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method });
    const route = routes[url];
    const answer = Array.isArray(route) ? route.shift() ?? route.at(-1) : route;
    if (!answer) return new Response("missing", { status: 404, headers: { "content-type": "text/plain" } });
    const headers = new Headers({ "content-type": answer.type ?? "image/png" });
    if (answer.location) headers.set("location", answer.location);
    if (answer.length) headers.set("content-length", answer.length);
    else if (answer.body) headers.set("content-length", String(answer.body.length));
    return new Response(method === "HEAD" || !answer.body ? null : new Uint8Array(answer.body), { status: answer.status ?? 200, headers });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
async function repo(sources: Record<string, string>, data: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "shopmaple-repo-"));
  await mkdir(join(root, "packages/contracts/data"), { recursive: true });
  await writeFile(join(root, "packages/contracts/data/shopify-media-sources.json"), JSON.stringify({ about: "test", files: sources }));
  for (const [path, text] of Object.entries(data)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}
const quiet = () => {};
const options = (overrides: Partial<MigrationOptions>): MigrationOptions => ({
  repoRoot: "", mediaRoot: undefined, dryRun: false, verify: false, sample: 0, concurrency: 2, retries: 2,
  retryDelayMs: 1, timeoutMs: 1000, minFreeBytes: 0, log: quiet, ...overrides,
});

test("one file named by both Shopify hosts and any query is planned once, with its sources and hosts", () => {
  const found = [
    ...urlsInText(`{"a":"https://shop.maplefurnishers.com/cdn/shop/files/Chairs_1.png?v=17&width=600"}`, "repo"),
    ...urlsInText(`<img src="${chair}?v=1">`, "database"),
    ...urlsInText(`"//cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png?v=2"`, "snapshot"),
    ...urlsInText(`"${film}?v=0" and "https://example.com/files/x.png" and "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/readme.txt"`, "database"),
  ];
  const { entries, unsupported } = planFromFound(found);
  assert.deepEqual([...entries.keys()].sort(), [shopifyMediaName(chair), shopifyMediaName(film)].sort());
  const entry = entries.get(shopifyMediaName(chair)!)!;
  assert.equal(entry.canonical, chair);
  assert.equal(entry.kind, "image");
  assert.deepEqual([...entry.sources].sort(), ["database", "repo", "snapshot"]);
  assert.deepEqual([...entry.hosts].sort(), ["cdn.shopify.com", "shop.maplefurnishers.com"]);
  assert.equal(entries.get(shopifyMediaName(film)!)!.kind, "video");
  assert.deepEqual(unsupported.map(item => item.url), ["https://cdn.shopify.com/s/files/1/0691/8651/9229/files/readme.txt"]);
});

test("the repository's sources are its recorded list plus any Shopify address its data still names", async () => {
  const other = "https://shop.maplefurnishers.com/cdn/shop/files/New_banner.webp?v=3";
  const root = await repo({ [shopifyMediaName(chair)!]: chair }, { "apps/web/data/new.json": JSON.stringify({ image: other }) });
  const urls = (await collectRepo(root)).map(item => item.url);
  assert.ok(urls.includes(chair));
  assert.ok(urls.includes(other));
});

test("a download stores each file under its fixed name with a manifest, and a rerun fetches nothing and deletes nothing", async () => {
  const repoRoot = await repo({ [shopifyMediaName(chair)!]: chair, [shopifyMediaName(film)!]: film });
  const mediaRoot = join(await mkdtemp(join(tmpdir(), "shopmaple-media-")), "shopify");
  await mkdir(mediaRoot);
  await writeFile(join(mediaRoot, "kept-by-someone-else.txt"), "untouched");
  const double = cdn({ [chair]: { body: png }, [film]: { type: "video/mp4", body: mp4 } });
  const first = await runMigration(options({ repoRoot, mediaRoot, fetch: double.fetch }));
  assert.equal(first.downloaded, 2);
  assert.deepEqual(first.failures, []);
  assert.deepEqual(await readFile(join(mediaRoot, shopifyMediaName(chair)!)), png);
  const manifest = JSON.parse(await readFile(join(mediaRoot, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.files[shopifyMediaName(chair)!], { ...manifest.files[shopifyMediaName(chair)!], source: chair, bytes: png.length, sha256: sha256(png) });
  assert.equal(manifest.files[shopifyMediaName(film)!].contentType, "video/mp4");

  const calls = double.calls.length;
  const second = await runMigration(options({ repoRoot, mediaRoot, fetch: double.fetch }));
  assert.equal(second.downloaded, 0);
  assert.equal(second.alreadyCopied, 2);
  assert.equal(double.calls.length, calls);
  assert.equal(await readFile(join(mediaRoot, "kept-by-someone-else.txt"), "utf8"), "untouched");
  assert.deepEqual((await readdir(mediaRoot)).filter(name => name.endsWith(".part")), []);
});

test("a dry run reports counts and a size estimate from HEAD requests, and writes nothing", async () => {
  const repoRoot = await repo({ [shopifyMediaName(chair)!]: chair, [shopifyMediaName(film)!]: film });
  const mediaRoot = join(await mkdtemp(join(tmpdir(), "shopmaple-media-")), "not-created");
  const double = cdn({ [chair]: { body: png }, [film]: { type: "video/mp4", body: mp4 } });
  const report = await runMigration(options({ repoRoot, mediaRoot, dryRun: true, sample: 10, fetch: double.fetch }));
  assert.equal(report.files, 2);
  assert.deepEqual(report.bySource, { repo: 2 });
  assert.deepEqual(report.byKind, { image: 1, video: 1 });
  assert.equal(report.estimatedBytes, png.length + mp4.length);
  assert.deepEqual(double.calls.map(call => call.method), ["HEAD", "HEAD"]);
  await assert.rejects(readdir(mediaRoot), { code: "ENOENT" });
});

test("only allowed hosts and types are kept: a foreign redirect, a web page, a mislabelled or oversized file fail and leave nothing", async () => {
  const names = ["A.png", "B.png", "C.png", "D.png"].map(name => `https://cdn.shopify.com/s/files/1/0691/8651/9229/files/${name}`);
  const repoRoot = await repo(Object.fromEntries(names.map(url => [shopifyMediaName(url)!, url])));
  const mediaRoot = await mkdtemp(join(tmpdir(), "shopmaple-media-"));
  const double = cdn({
    [names[0]!]: { status: 302, location: "https://evil.example/a.png" },
    [names[1]!]: { type: "text/html", body: Buffer.from("<html>") },
    [names[2]!]: { type: "image/png", body: Buffer.from("<html>not a picture</html>") },
    [names[3]!]: { type: "image/png", body: png, length: String(500 * 1024 * 1024) },
  });
  const report = await runMigration(options({ repoRoot, mediaRoot, fetch: double.fetch }));
  assert.equal(report.downloaded, 0);
  assert.equal(report.failures.length, 4);
  assert.deepEqual((await readdir(mediaRoot)).filter(name => name !== "manifest.json"), []);
  assert.ok(!double.calls.some(call => call.url.startsWith("https://evil.example")));
});

test("a busy CDN is retried, and a file Shopify no longer has is reported, not retried forever", async () => {
  const gone = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Gone.png";
  const repoRoot = await repo({ [shopifyMediaName(chair)!]: chair, [shopifyMediaName(gone)!]: gone });
  const mediaRoot = await mkdtemp(join(tmpdir(), "shopmaple-media-"));
  const double = cdn({ [chair]: [{ status: 503, type: "text/plain" }, { body: png }], [gone]: { status: 404, type: "text/plain" } });
  const report = await runMigration(options({ repoRoot, mediaRoot, fetch: double.fetch }));
  assert.equal(report.downloaded, 1);
  assert.deepEqual(report.failures.map(failure => failure.url), [gone]);
  assert.equal(double.calls.filter(call => call.url === gone).length, 1);
});

test("verify finds a damaged copy and a repository file that was never copied", async () => {
  const gone = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Never.png";
  const repoRoot = await repo({ [shopifyMediaName(chair)!]: chair, [shopifyMediaName(gone)!]: gone });
  const mediaRoot = await mkdtemp(join(tmpdir(), "shopmaple-media-"));
  await runMigration(options({ repoRoot, mediaRoot, fetch: cdn({ [chair]: { body: png } }).fetch }));
  await writeFile(join(mediaRoot, shopifyMediaName(chair)!), Buffer.concat([png, Buffer.from("x")]));
  const report = await runMigration(options({ repoRoot, mediaRoot, verify: true }));
  assert.deepEqual(report.damaged, [shopifyMediaName(chair)]);
  assert.deepEqual(report.missing.map(item => item.url), [gone]);
});
