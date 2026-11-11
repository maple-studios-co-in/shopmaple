/**
 * Copies every Shopify-hosted photo, artwork and film the store names onto the server, as /media/shopify/<name>
 * (docs/shopify-media-migration.md). The CLI is deploy/migrate-shopify-media.ts; this module holds the steps so they are
 * tested without a network or a server.
 *
 * Sources: the repository (its recorded list, packages/contracts/data/shopify-media-sources.json, plus any Shopify
 * address its data or code still names), the database (products, variants, published and draft content and its
 * revisions) and the pinned Shopify catalogue snapshot (SHOPIFY_CATALOGUE_FILE).
 *
 * It never deletes or replaces a file: a copy already present is kept, a new one is written beside it under a temporary
 * name and linked into place only when complete and checked. Only Shopify's CDN is contacted, only pictures and films of
 * allowed types and sizes are kept, and a dry run sends HEAD requests at most and writes nothing.
 */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, readdir, rename, statfs, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalShopifyMediaUrl,
  shopifyMediaKind,
  shopifyMediaName,
  shopifyMediaUrlsInText,
  sniffMediaType,
} from "../packages/contracts/src/shopify-media";

export type Source = "repo" | "database" | "snapshot";
export type Found = { url: string; source: Source };
export type PlanEntry = { name: string; canonical: string; kind: "image" | "video"; sources: Set<Source>; hosts: Set<string> };
export type ManifestEntry = { source: string; bytes: number; sha256: string; contentType: string; copiedAt: string };
export type Manifest = { version: 1; files: Record<string, ManifestEntry> };
export type Failure = { url: string; name: string; reason: string };
export type MigrationOptions = {
  repoRoot: string;
  /** SHOPIFY_MEDIA_ROOT; required to download or verify, optional for a dry run (to count what is copied). */
  mediaRoot?: string;
  dryRun: boolean;
  verify: boolean;
  /** Dry run: HEAD requests for a size estimate (0 = none, Infinity = every file). */
  sample: number;
  concurrency: number;
  retries: number;
  retryDelayMs: number;
  timeoutMs: number;
  /** Stop downloading while the disk has less than this free. */
  minFreeBytes: number;
  /** Download at most this many new files (a sample run). */
  limit?: number;
  log: (line: string) => void;
  fetch?: typeof fetch;
  /** Database text to search (rows as JSON); absent when DATABASE_URL is not given. */
  database?: () => Promise<string[]>;
  /** The pinned Shopify catalogue snapshot's path. */
  snapshotFile?: string;
};
export type MigrationReport = {
  files: number;
  bySource: Partial<Record<Source, number>>;
  byKind: Partial<Record<"image" | "video", number>>;
  byHost: Record<string, number>;
  unsupported: string[];
  alreadyCopied: number;
  toDownload: number;
  estimatedBytes: number | null;
  sampled: number;
  downloaded: number;
  downloadedBytes: number;
  failures: Failure[];
  damaged: string[];
  missing: { name: string; url: string; sources: Source[] }[];
};

/** Size and type limits: a photo or artwork up to 60 MB, a film up to 600 MB. */
const maxBytes = { image: 60 * 1024 * 1024, video: 600 * 1024 * 1024 } as const;
const allowedTypes = {
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"]),
  video: new Set(["video/mp4", "video/webm"]),
} as const;
/** The only host fetched from: every Shopify address is canonicalised to Shopify's CDN first. */
const allowedHost = "cdn.shopify.com";
const sourcesFile = "packages/contracts/data/shopify-media-sources.json";
const repoDirectories = ["apps/web/data", "apps/api/data", "packages/contracts/data", "apps/web/lib", "apps/web/components", "apps/web/app"];

export function urlsInText(text: string, source: Source): Found[] {
  return [...text.matchAll(shopifyMediaUrlsInText)].map(match => ({ url: match[0], source }));
}

/** One entry per local name: the canonical address it is fetched from, and every source and host that named it. */
export function planFromFound(found: Found[]) {
  const entries = new Map<string, PlanEntry>(), unsupported: Found[] = [];
  for (const item of found) {
    const canonical = canonicalShopifyMediaUrl(item.url), name = shopifyMediaName(item.url);
    const kind = name ? shopifyMediaKind(name) : null;
    if (!canonical || !name || !kind) { unsupported.push(item); continue; }
    const entry = entries.get(name) ?? { name, canonical, kind, sources: new Set<Source>(), hosts: new Set<string>() };
    entry.sources.add(item.source);
    entry.hosts.add(new URL(item.url.startsWith("//") ? `https:${item.url}` : item.url).hostname);
    entries.set(name, entry);
  }
  return { entries, unsupported };
}

async function textFiles(root: string, directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(join(root, directory), { withFileTypes: true }); } catch { return []; }
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await textFiles(root, path));
    else if (/\.(?:json|ts|tsx)$/.test(entry.name) && path !== sourcesFile) found.push(path);
  }
  return found;
}

/** The repository's recorded list, and any Shopify address its data or code still names. */
export async function collectRepo(root: string): Promise<Found[]> {
  const recorded = JSON.parse(await readFile(join(root, sourcesFile), "utf8")) as { files: Record<string, string> };
  const found: Found[] = Object.values(recorded.files).map(url => ({ url, source: "repo" }));
  for (const directory of repoDirectories)
    for (const file of await textFiles(root, directory)) found.push(...urlsInText(await readFile(join(root, file), "utf8"), "repo"));
  return found;
}

export async function collectSnapshot(file: string): Promise<Found[]> {
  const handle = await open(file, constants.O_RDONLY);
  try {
    if ((await handle.stat()).size > 64 * 1024 * 1024) throw new Error("The catalogue snapshot is larger than 64 MB.");
    return urlsInText(await handle.readFile("utf8"), "snapshot");
  } finally { await handle.close(); }
}

export async function readManifest(root: string): Promise<Manifest> {
  try {
    const parsed = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as Manifest;
    if (parsed?.version === 1 && parsed.files && typeof parsed.files === "object") return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("manifest.json is unreadable; fix it or move it aside first.");
  }
  return { version: 1, files: {} };
}
/** Written beside the old one and renamed over it, so a crash leaves the previous manifest whole. Entries only grow. */
async function writeManifest(root: string, manifest: Manifest) {
  const temporary = join(root, `.manifest-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, join(root, "manifest.json"));
}

async function isFile(path: string) {
  try { return (await lstat(path)).isFile(); } catch { return false; }
}
async function hashFile(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { hash.update(chunk as Buffer); bytes += (chunk as Buffer).length; }
    return { sha256: hash.digest("hex"), bytes };
  } finally { await handle.close().catch(() => {}); }
}
async function headOf(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const buffer = Buffer.alloc(4096); const { bytesRead } = await handle.read(buffer, 0, 4096, 0); return buffer.subarray(0, bytesRead); }
  finally { await handle.close(); }
}
const contentType = (response: Response) => (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();

/** A failure that a retry cannot fix (a refusal, a 404). */
class Permanent extends Error {}
/** GET or HEAD on Shopify's CDN only; a redirect is followed only while it stays on the CDN. */
async function request(fetcher: typeof fetch, url: string, method: "GET" | "HEAD", signal: AbortSignal) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const target = new URL(current);
    if (target.hostname !== allowedHost || target.protocol !== "https:" || target.port || target.username) throw new Permanent(`refused an address outside ${allowedHost}`);
    const response = await fetcher(current, { method, redirect: "manual", signal, headers: { Accept: "*/*", "User-Agent": "MapleMediaCopy/1.0" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      void response.body?.cancel().catch(() => {});
      if (!location) throw new Permanent(`redirect ${response.status} without a location`);
      current = new URL(location, current).href;
      continue;
    }
    return response;
  }
  throw new Permanent("too many redirects");
}

/** Downloads one file to a temporary name, checks it, and links it into place; never replaces an existing file. */
async function downloadOne(entry: PlanEntry, root: string, options: MigrationOptions): Promise<ManifestEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), entry.kind === "video" ? options.timeoutMs * 5 : options.timeoutMs);
  const temporary = join(root, `.${entry.name}.${randomUUID()}.part`);
  try {
    const response = await request(options.fetch ?? fetch, entry.canonical, "GET", controller.signal);
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      const message = `Shopify answered ${response.status}`;
      throw response.status === 429 || response.status >= 500 ? new Error(message) : new Permanent(message);
    }
    const type = contentType(response), length = response.headers.get("content-length");
    if (!allowedTypes[entry.kind].has(type)) {
      void response.body?.cancel().catch(() => {});
      throw new Permanent(`refused content type "${type}" for a ${entry.kind}`);
    }
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes[entry.kind])) {
      void response.body?.cancel().catch(() => {});
      throw new Permanent(`refused ${length} bytes (limit ${maxBytes[entry.kind]})`);
    }
    if (!response.body) throw new Error("empty answer");
    const hash = createHash("sha256"), head: Buffer[] = [];
    let bytes = 0, headBytes = 0;
    const handle = await open(temporary, "wx", 0o600);
    try {
      const reader = response.body.getReader();
      for (let part = await reader.read(); !part.done; part = await reader.read()) {
        bytes += part.value.byteLength;
        if (bytes > maxBytes[entry.kind]) { void reader.cancel().catch(() => {}); throw new Permanent(`refused more than ${maxBytes[entry.kind]} bytes`); }
        const chunk = Buffer.from(part.value);
        if (headBytes < 4096) { head.push(chunk); headBytes += chunk.length; }
        hash.update(chunk);
        await handle.write(chunk);
      }
      await handle.sync();
    } finally { await handle.close(); }
    if (!bytes) throw new Error("empty answer");
    const sniffed = sniffMediaType(Buffer.concat(head).subarray(0, 4096), entry.name);
    if (!sniffed) throw new Permanent(`the bytes are not a ${entry.kind} (labelled "${type}")`);
    try { await link(temporary, join(root, entry.name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return { source: entry.canonical, bytes, sha256: hash.digest("hex"), contentType: sniffed, copiedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
    // Only this run's own temporary file is ever removed.
    await unlink(temporary).catch(() => {});
  }
}

async function withRetries<T>(work: () => Promise<T>, options: MigrationOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await work(); }
    catch (error) {
      if (error instanceof Permanent || attempt >= options.retries) throw error;
      await new Promise(resolve => setTimeout(resolve, options.retryDelayMs * (attempt + 1) ** 2));
    }
  }
}

async function pool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

function count<K extends string>(keys: K[]): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}
export const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const listCounts = (counts: Record<string, number | undefined>) => Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ") || "none";
const describe = (failure: Failure) => failure.url ? `${failure.url} (${failure.reason})` : failure.reason;

export async function runMigration(options: MigrationOptions): Promise<MigrationReport> {
  const { log } = options;
  const failures: Failure[] = [];
  const found: Found[] = [...await collectRepo(options.repoRoot)];
  if (options.database) {
    try { for (const text of await options.database()) found.push(...urlsInText(text, "database")); }
    catch (error) { failures.push({ url: "", name: "", reason: `database could not be read: ${(error as Error).message}` }); }
  }
  if (options.snapshotFile) {
    try { found.push(...await collectSnapshot(options.snapshotFile)); }
    catch (error) { failures.push({ url: "", name: "", reason: `snapshot could not be read: ${(error as Error).message}` }); }
  }
  const { entries, unsupported } = planFromFound(found);
  const list = [...entries.values()].sort((a, b) => a.canonical.localeCompare(b.canonical));
  const root = options.mediaRoot;
  let manifest: Manifest = { version: 1, files: {} };
  const present = new Set<string>();
  if (root) {
    manifest = await readManifest(root);
    for (const entry of list) if (await isFile(join(root, entry.name))) present.add(entry.name);
  }
  const report: MigrationReport = {
    files: list.length,
    bySource: count(list.flatMap(entry => [...entry.sources])),
    byKind: count(list.map(entry => entry.kind)),
    byHost: count(list.flatMap(entry => [...entry.hosts])) as Record<string, number>,
    unsupported: [...new Set(unsupported.map(item => item.url))],
    alreadyCopied: present.size, toDownload: list.length - present.size,
    estimatedBytes: null, sampled: 0, downloaded: 0, downloadedBytes: 0, failures, damaged: [], missing: [],
  };
  log(`Shopify media named by the store: ${report.files} files (${report.byKind.image ?? 0} pictures, ${report.byKind.video ?? 0} films).`);
  log(`  by source (a file may have several): ${listCounts(report.bySource)}`);
  log(`  by host as named (a file may be named both ways): ${listCounts(report.byHost)}`);
  log(`  already copied: ${report.alreadyCopied}; still to copy: ${report.toDownload}`);
  for (const url of report.unsupported) log(`  left as is (not a picture or film the store keeps): ${url}`);

  if (options.verify) {
    if (!root) throw new Error("SHOPIFY_MEDIA_ROOT is required to verify.");
    for (const [name, entry] of Object.entries(manifest.files)) {
      const path = join(root, name);
      if (!await isFile(path)) { report.damaged.push(name); continue; }
      const actual = await hashFile(path);
      if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) report.damaged.push(name);
    }
    report.missing = list.filter(entry => !present.has(entry.name)).map(entry => ({ name: entry.name, url: entry.canonical, sources: [...entry.sources] }));
    const repoMissing = report.missing.filter(item => item.sources.includes("repo"));
    log(`Verified ${Object.keys(manifest.files).length} copies against the manifest: ${report.damaged.length} damaged or gone.`);
    for (const name of report.damaged) log(`  damaged: ${name} (${manifest.files[name]?.source ?? "unknown"})`);
    log(`Not copied yet: ${report.missing.length} (${repoMissing.length} named by this release's data or code).`);
    for (const item of report.missing) log(`  missing: ${item.name} ← ${item.url} [${item.sources.join(", ")}]`);
    for (const failure of failures) log(`  failed: ${describe(failure)}`);
    return report;
  }

  if (options.dryRun) {
    const pending = list.filter(entry => !present.has(entry.name));
    const step = Math.max(1, Math.floor(pending.length / Math.max(1, options.sample)));
    const sample = options.sample <= 0 ? [] : options.sample >= pending.length ? pending : pending.filter((_, index) => index % step === 0).slice(0, options.sample);
    const sizes: Record<"image" | "video", number[]> = { image: [], video: [] };
    await pool(sample, options.concurrency, async entry => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await request(options.fetch ?? fetch, entry.canonical, "HEAD", controller.signal);
        const length = Number(response.headers.get("content-length"));
        if (response.status === 200 && Number.isFinite(length) && length > 0) sizes[entry.kind].push(length);
        else failures.push({ url: entry.canonical, name: entry.name, reason: `HEAD answered ${response.status}` });
      } catch (error) { failures.push({ url: entry.canonical, name: entry.name, reason: (error as Error).message }); }
      finally { clearTimeout(timer); }
    });
    report.sampled = sizes.image.length + sizes.video.length;
    if (report.sampled) {
      const all = [...sizes.image, ...sizes.video];
      const estimate = (kind: "image" | "video") => {
        const known = sizes[kind].length ? sizes[kind] : all;
        const average = known.reduce((sum, value) => sum + value, 0) / known.length;
        return Math.round(average * pending.filter(entry => entry.kind === kind).length);
      };
      report.estimatedBytes = estimate("image") + estimate("video");
      log(`Estimated download: ${formatBytes(report.estimatedBytes)} for ${pending.length} files, from ${report.sampled} HEAD requests (pictures ~${formatBytes(estimate("image"))}, films ~${formatBytes(estimate("video"))}).`);
    }
    for (const failure of failures) log(`  failed: ${describe(failure)}`);
    log("Dry run: nothing was written.");
    return report;
  }

  if (!root) throw new Error("SHOPIFY_MEDIA_ROOT is required to download.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (!(await lstat(root)).isDirectory()) throw new Error("SHOPIFY_MEDIA_ROOT is not a directory.");
  // A copy left by an earlier, interrupted run is recorded rather than fetched again.
  for (const name of present) {
    if (manifest.files[name]) continue;
    const actual = await hashFile(join(root, name));
    manifest.files[name] = { source: entries.get(name)!.canonical, ...actual, contentType: sniffMediaType(await headOf(join(root, name)), name) ?? "unknown", copiedAt: new Date().toISOString() };
  }
  const pending = list.filter(entry => !present.has(entry.name)).slice(0, options.limit ?? Infinity);
  let sinceWrite = 0, stopped = false;
  await pool(pending, options.concurrency, async entry => {
    if (stopped) return;
    const free = await statfs(root).then(info => info.bavail * info.bsize, () => Infinity);
    if (free < options.minFreeBytes) {
      if (!stopped) failures.push({ url: "", name: "", reason: `stopped: only ${formatBytes(free)} free on the media disk` });
      stopped = true;
      return;
    }
    try {
      const copied = await withRetries(() => downloadOne(entry, root, options), options);
      manifest.files[entry.name] = copied;
      report.downloaded++;
      report.downloadedBytes += copied.bytes;
      log(`copied ${entry.name} ${formatBytes(copied.bytes)} ← ${entry.canonical}`);
      if (++sinceWrite >= 25) { sinceWrite = 0; await writeManifest(root, manifest); }
    } catch (error) {
      failures.push({ url: entry.canonical, name: entry.name, reason: (error as Error).message });
      log(`FAILED ${entry.name} ← ${entry.canonical}: ${(error as Error).message}`);
    }
  });
  await writeManifest(root, manifest);
  log(`Copied ${report.downloaded} files (${formatBytes(report.downloadedBytes)}); ${report.alreadyCopied} were already here; ${failures.length} failed.`);
  for (const failure of failures) log(`  failed: ${describe(failure)}`);
  log(`Manifest: ${join(root, "manifest.json")}`);
  return report;
}
