import { constants } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Express, Request, Response } from "express";
import {
  canonicalShopifyMediaUrl,
  repoShopifyMediaSources,
  shopifyMediaFilename,
  shopifyMediaKind,
  shopifyMediaName,
  shopifyMediaUrlsInText,
  sniffMediaType,
} from "@shopmaple/contracts/shopify-media";
import { HttpError } from "./cart.js";

/**
 * The store's own copies of the photos, artwork and films first published on Shopify, served as
 * /media/shopify/<name> from SHOPIFY_MEDIA_ROOT (written only by deploy/migrate-shopify-media.ts; see
 * docs/shopify-media-migration.md).
 *
 * - A copied file is served from disk, cached for a year (its name never changes, and the copy never does).
 * - A file not yet copied, but known (the repository's list or the server's manifest), is fetched from Shopify's CDN
 *   for a picture, so the image optimizer and every page keep working, or redirected there for a film; with
 *   SHOPIFY_MEDIA_FALLBACK=off, or once Shopify no longer has it, it is a 404.
 * - Public API answers that still name a Shopify address (published content, the catalogue from the Shopify snapshot)
 *   name the local copy instead once the server has it, so nothing is rewritten in the database or the snapshot.
 */
export type ShopifyMediaConfig = {
  root?: string;
  /** false once Shopify is gone (SHOPIFY_MEDIA_FALLBACK=off); a missing copy is then a 404. */
  fallback?: boolean;
  /** Transport for the fallback; tests inject a local double. */
  fetch?: typeof fetch;
  /** How long a directory listing is trusted before it is read again. */
  refreshMs?: number;
  timeoutMs?: number;
};
const missing = () => new HttpError(404, "MEDIA_NOT_FOUND", "This image is unavailable.");
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"]);
const maxFallbackBytes = 25 * 1024 * 1024;
/** At most this many fallback fetches at once; a page's burst waits its turn (up to 64 waiting, 20 s each) rather than failing. */
const maxActiveFallbacks = 6, maxWaiting = 64, maxWaitMs = 20_000;
/** Only an SVG's own drawing runs if it is opened directly; no script, form or plugin. */
const svgPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

export function createShopifyMediaStore(config: ShopifyMediaConfig = {}) {
  const root = config.root && isAbsolute(config.root) ? config.root : undefined;
  const refreshMs = config.refreshMs ?? 30_000;
  let present = new Set<string>(), listedAt = -Infinity, listing: Promise<void> | null = null;
  let manifest: { mtimeMs: number; files: Map<string, string> } = { mtimeMs: -1, files: new Map() };

  /** Reads the directory again when the last listing is older than refreshMs; one read at a time. */
  async function refresh(now = Date.now()) {
    if (!root || now - listedAt < refreshMs) return;
    listing ??= (async () => {
      try {
        const names = await readdir(root, { withFileTypes: true });
        present = new Set(names.filter(entry => entry.isFile() && shopifyMediaFilename.test(entry.name)).map(entry => entry.name));
      } catch { present = new Set(); }
      listedAt = Date.now();
    })().finally(() => { listing = null; });
    await listing;
  }
  /** The Shopify address a not-yet-copied name was made from: the repository's list, then the server's manifest. */
  async function sourceOf(name: string): Promise<string | null> {
    if (Object.hasOwn(repoShopifyMediaSources, name)) return repoShopifyMediaSources[name]!;
    if (!root) return null;
    try {
      const path = join(root, "manifest.json"), info = await stat(path);
      if (info.mtimeMs !== manifest.mtimeMs && info.size <= 32 * 1024 * 1024) {
        const parsed = JSON.parse(await readFile(path, "utf8")) as { files?: Record<string, { source?: unknown }> };
        const files = new Map<string, string>();
        for (const [key, entry] of Object.entries(parsed.files ?? {}))
          // Only an entry whose name matches its source, and only ever fetched from Shopify's CDN (never shop., which is
          // this store after the move).
          if (shopifyMediaFilename.test(key) && typeof entry?.source === "string" && shopifyMediaName(entry.source) === key) files.set(key, canonicalShopifyMediaUrl(entry.source)!);
        manifest = { mtimeMs: info.mtimeMs, files };
      }
    } catch { /* No manifest yet: only the repository's list is known. */ }
    return manifest.files.get(name) ?? null;
  }
  /** Every Shopify media address in a text replaced by its local copy, where the server has that copy. */
  function mapText(text: string): string {
    if (!present.size) return text;
    return text.replace(shopifyMediaUrlsInText, url => {
      const name = shopifyMediaName(url);
      return name && present.has(name) ? `/media/shopify/${name}` : url;
    });
  }
  return { root, fallback: config.fallback ?? true, fetch: config.fetch ?? fetch, timeoutMs: config.timeoutMs ?? 15_000, refresh, sourceOf, mapText, has: (name: string) => present.has(name) };
}
export type ShopifyMediaStore = ReturnType<typeof createShopifyMediaStore>;

/**
 * Public API answers name the local copy of any Shopify file the server holds. Staff endpoints keep the stored value,
 * so the admin shows and saves exactly what is in the content.
 */
export function mapShopifyMediaInResponses(app: Express, store: ShopifyMediaStore) {
  if (!store.root) return;
  app.use("/api", async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || req.path.startsWith("/admin/") || req.path === "/admin") return next();
    await store.refresh();
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const text = JSON.stringify(body);
      if (text === undefined) return json(body);
      const mapped = store.mapText(text);
      if (mapped === text) return json(body);
      res.set("Content-Type", "application/json; charset=utf-8");
      return res.send(mapped);
    };
    next();
  });
}

/** One byte range ("bytes=0-99", "bytes=100-", "bytes=-500") of a file this size, or null for none or a malformed one. */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start > end || start >= size ? "unsatisfiable" : { start, end };
}

/**
 * Serves a copy from the one media directory: the name was already checked against the fixed pattern, and the file is
 * opened without following links, so nothing outside the directory can be reached. Films get byte ranges.
 */
async function serveCopy(req: Request, res: Response, root: string, filename: string): Promise<boolean> {
  if (!shopifyMediaFilename.test(filename)) return false;
  let file;
  try { file = await open(join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW); } catch { return false; }
  let handedOver = false;
  try {
    const info = await file.stat();
    if (!info.isFile()) return false;
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await file.read(buffer, 0, 4096, 0);
    const type = sniffMediaType(buffer.subarray(0, bytesRead), filename);
    if (!type) { res.set("Cache-Control", "no-store"); throw missing(); }
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    res.set({
      "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes", ETag: etag, "Last-Modified": info.mtime.toUTCString(),
    });
    if (type === "image/svg+xml") res.set("Content-Security-Policy", svgPolicy);
    if (req.get("If-None-Match") === etag) { res.status(304).end(); return true; }
    const range = byteRange(req.get("Range"), info.size);
    if (range === "unsatisfiable") { res.status(416).set("Content-Range", `bytes */${info.size}`).end(); return true; }
    const { start, end } = range ?? { start: 0, end: info.size - 1 };
    if (range) res.status(206).set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    res.set("Content-Length", String(end - start + 1));
    if (req.method === "HEAD" || info.size === 0) { res.end(); return true; }
    const stream = file.createReadStream({ start, end, autoClose: true });
    handedOver = true;
    await new Promise<void>((resolve) => {
      stream.on("error", () => { res.destroy(); resolve(); });
      res.on("close", () => { stream.destroy(); resolve(); });
      stream.pipe(res);
    });
    return true;
  } finally { if (!handedOver) await file.close().catch(() => {}); }
}

export function registerShopifyMedia(app: Express, store: ShopifyMediaStore) {
  let active = 0;
  const waiting: Array<() => void> = [];
  app.get("/media/shopify/:filename", async (req: Request, res: Response) => {
    const filename = String(req.params.filename);
    const kind = shopifyMediaKind(filename);
    if (!kind || Object.keys(req.query).length) { res.set("Cache-Control", "no-store"); throw missing(); }
    if (store.root && await serveCopy(req, res, store.root, filename)) return;
    // Not copied yet. A missing file must never be cached as missing: it may be copied a minute from now.
    res.set("Cache-Control", "no-store");
    const source = store.fallback ? await store.sourceOf(filename) : null;
    if (!source) throw missing();
    if (kind === "video") { res.redirect(302, source); return; }
    if (active >= maxActiveFallbacks) {
      if (waiting.length >= maxWaiting) { res.set("Retry-After", "5"); throw new HttpError(503, "MEDIA_BUSY", "Please try this image again."); }
      await new Promise<void>((resolve, reject) => {
        const turn = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          const index = waiting.indexOf(turn);
          if (index >= 0) waiting.splice(index, 1);
          res.set("Retry-After", "5");
          reject(new HttpError(503, "MEDIA_BUSY", "Please try this image again."));
        }, maxWaitMs);
        waiting.push(turn);
      });
    }
    active++;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), store.timeoutMs);
    try {
      const upstream = await store.fetch(source, { redirect: "error", signal: controller.signal, headers: { Accept: "*/*" } });
      const type = (upstream.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const length = upstream.headers.get("content-length");
      if (upstream.status !== 200 || !imageTypes.has(type) || !upstream.body || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxFallbackBytes))) {
        void upstream.body?.cancel().catch(() => {});
        throw missing();
      }
      const reader = upstream.body.getReader(), parts: Uint8Array[] = [];
      let size = 0;
      for (let part = await reader.read(); !part.done; part = await reader.read()) {
        size += part.value.byteLength;
        if (size > maxFallbackBytes) { void reader.cancel().catch(() => {}); throw missing(); }
        parts.push(part.value);
      }
      res.set({ "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600" });
      if (type === "image/svg+xml") res.set("Content-Security-Policy", svgPolicy);
      res.send(Buffer.concat(parts));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw missing();
    } finally { clearTimeout(timer); controller.abort(); active--; waiting.shift()?.(); }
  });
}
