import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pipeline } from "node:stream/promises";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { Prisma, PrismaClient, ShopMediaAsset } from "@prisma/client";
import sharp from "sharp";
import { defaultMediaUploadRules, imageFileProblem, imageSizeProblem, type MediaUploadRules } from "@shopmaple/contracts/media-upload-rules";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";
import { filmHeadBytes, FilmInvalid, inspectFilm, sniffFilm, type FilmContainer } from "./film-inspect.js";
import { readMediaUploadRules } from "./settings.js";
export type MediaConfig = { webOrigin: string; secureCookies: boolean; mediaRoot?: string };
const shaPattern = /^[a-f0-9]{64}$/;
const imageFilename = /^[a-f0-9]{64}\.webp$/;
const filmFilename = /^[a-f0-9]{64}\.(?:mp4|webm)$/;
const publicFilename = /^[a-f0-9]{64}\.(?:webp|mp4|webm)$/;
const imageReference = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/;
const filmReference = /^\/media\/uploads\/([a-f0-9]{64})\.(mp4|webm)$/;
const maxBytes = 8 * 1024 * 1024, diskQuota = 250 * 1024 * 1024;
/**
 * Image uploads a client may start in a minute. Staff upload a whole folder at once (owner, 23 Nov 2026: bulk upload), so
 * this is above the films' 10; decoding stays bounded by the two active uploads per process.
 */
export const imageUploadsPerMinute = 60;
/** Films (owner, 12 Nov 2026): ready-made MP4 or WebM up to 80 MB each, at most 40 films and 3 GiB in all. */
export const maxFilmBytes = 80 * 1024 * 1024, filmDiskQuota = 3 * 1024 * 1024 * 1024, maxFilms = 40;
const filmTypes: Record<string, FilmContainer> = { "video/mp4": "mp4", "video/webm": "webm" };
const filmMime: Record<FilmContainer, string> = { mp4: "video/mp4", webm: "video/webm" };
const missing = () => new HttpError(404, "MEDIA_NOT_FOUND", "This image is unavailable.");
const invalid = () => new HttpError(400, "MEDIA_INVALID_IMAGE", "Choose a valid, non-animated JPEG, PNG or WebP image up to 24 million pixels.");
const invalidFilm = () => new HttpError(400, "MEDIA_INVALID_FILM", "Choose a complete MP4 or WebM film. Other video formats cannot be played on the website.");
const filmTooLarge = () => new HttpError(413, "MEDIA_FILM_TOO_LARGE", "Choose a film up to 80 MB.");
const unavailable = () => new HttpError(503, "MEDIA_STORAGE_UNAVAILABLE", "Image uploads are temporarily unavailable.");
/** A film's extension, from its stored name (`<sha>.mp4`); an image's is always webp. */
const extension = (row: ShopMediaAsset) => row.kind === "video" ? row.storageKey.slice(65) : "webp";
function serialize(row: ShopMediaAsset) {
 return { id: row.id, sha256: row.sha256, kind: row.kind, label: row.label, width: row.width, height: row.height, bytes: row.bytes, mimeType: row.mimeType, durationMs: row.durationMs, faststart: row.faststart, createdAt: row.createdAt.toISOString(), publicAt: row.publicAt?.toISOString() ?? null, removedAt: row.removedAt?.toISOString() ?? null, url: `/media/uploads/${row.sha256}.${extension(row)}`, previewUrl: `/api/admin/media/${row.sha256}/preview` };
}
/**
 * Decodes an upload and re-encodes it as WebP fitted within 2560 px. The upload rules' sizes (Settings, owner 23 Nov 2026)
 * are checked against the picture as staff made it: its own size, turned upright, before it is fitted; a refused picture
 * is never re-encoded.
 */
async function normalize(body: Buffer, mime: string, rules: MediaUploadRules = defaultMediaUploadRules) {
 let refusal = "";
 try {
  const decoder = sharp(body, { limitInputPixels: 24_000_000, animated: true, failOn: "warning" });
  const meta = await decoder.metadata();
  const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  if (!meta.format || formats[meta.format] !== mime || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width * meta.height > 24_000_000) throw invalid();
  // EXIF orientations 5 to 8 turn the picture a quarter, so its upright width is the stored height.
  const upright = (meta.orientation ?? 1) >= 5 ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
  refusal = imageSizeProblem(rules, upright);
  if (!refusal) {
   const { data, info } = await decoder.rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
   return { data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
  }
 } catch { throw invalid(); }
 throw new HttpError(422, "MEDIA_SIZE_NOT_ALLOWED", refusal);
}
async function checkedRoot(root: string | undefined) {
 if (!root || !isAbsolute(root)) throw unavailable();
 try { await mkdir(root, { recursive: true, mode: 0o700 }); if (!(await lstat(root)).isDirectory()) throw unavailable(); }
 catch { throw unavailable(); }
 return root;
}
/** Bytes on disk counted against one quota: films count against the film quota, everything else (but films still arriving) against the image quota. */
async function diskUsage(root: string, kind: "image" | "video") {
 let bytes = 0;
 for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isSymbolicLink()) throw unavailable();
  const film = filmFilename.test(entry.name), arriving = entry.name.startsWith(".film-");
  if (entry.isFile() && (kind === "video" ? film : !film && !arriving)) bytes += (await lstat(join(root, entry.name))).size;
 }
 return bytes;
}
async function installFile(root: string, filename: string, bytes: Buffer) {
 const temporary = join(root, `.upload-${randomUUID()}.tmp`), destination = join(root, filename);
 try {
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await link(temporary, destination); }
  catch (error) {
   if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
   const existing = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
   try {
    if (!(await existing.stat()).isFile() || createHash("sha256").update(await existing.readFile()).digest("hex") !== filename.slice(0, 64)) throw unavailable();
   } finally { await existing.close(); }
  }
 } finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); }
}
/** A whole file's SHA-256, streamed rather than read into memory. */
async function fileDigest(file: FileHandle) {
 const hash = createHash("sha256");
 for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk as Buffer);
 return hash.digest("hex");
}
/** Moves a received film into place under its content name; an existing file of that name must already hold those bytes. */
async function installFilm(root: string, temporary: string, filename: string) {
 try { await link(temporary, join(root, filename)); }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  const existing = await open(join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (!(await existing.stat()).isFile() || await fileDigest(existing) !== filename.slice(0, 64)) throw unavailable(); }
  finally { await existing.close(); }
 }
}
/**
 * Receives a film body straight into a private temporary file in the media root while hashing it, so an 80 MB upload
 * is never held in memory. The first bytes must declare the chosen container. A body that is not one is still read to
 * its end (bounded by its declared length) so the browser receives the refusal rather than a broken connection.
 */
/**
 * Writes the arriving film to a private temporary file, hashing it as it goes. `declared` is its Content-Length, or null
 * when it arrives in chunks (Cloudflare's tunnel re-sends uploads chunked by default); then only the 80 MB cap applies,
 * counted as the bytes arrive.
 */
async function receiveFilm(req: Request, root: string, declared: number | null, container: FilmContainer) {
 const temporary = join(root, `.film-${randomUUID()}.part`);
 const file = await open(temporary, "wx+", 0o600);
 const hash = createHash("sha256");
 let bytes = 0, head = Buffer.alloc(0), refused = false;
 try {
  for await (const chunk of req as AsyncIterable<Buffer>) {
   bytes += chunk.length;
   if (declared === null ? bytes > maxFilmBytes : bytes > declared) throw declared === null ? filmTooLarge() : invalidFilm();
   if (refused) continue;
   if (head.length < filmHeadBytes) {
    head = Buffer.concat([head, chunk.subarray(0, filmHeadBytes - head.length)]);
    if (head.length >= Math.min(filmHeadBytes, declared ?? filmHeadBytes) && sniffFilm(head) !== container) { refused = true; continue; }
   }
   hash.update(chunk);
   for (let offset = 0; offset < chunk.length;) offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten;
  }
  if (refused || bytes === 0 || (declared !== null && bytes !== declared) || sniffFilm(head) !== container) throw invalidFilm();
  await file.sync();
  const facts = await inspectFilm(file, bytes, container).catch(error => { throw error instanceof FilmInvalid ? invalidFilm() : error; });
  return { temporary, bytes, sha256: hash.digest("hex"), facts };
 } catch (error) {
  await unlink(temporary).catch(() => {});
  throw error;
 } finally { await file.close(); }
}
/** The one `bytes=` range asked of a file this size (RFC 9110): null for the whole file, "unsatisfiable" when outside it. */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | null | "unsatisfiable" {
 const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
 // Absent, multiple or malformed ranges are answered with the whole file, as the standard allows.
 if (!match || (match[1] === "" && match[2] === "")) return null;
 if (match[1] === "") {
  const suffix = Number(match[2]);
  if (!Number.isSafeInteger(suffix)) return null;
  return suffix === 0 || size === 0 ? "unsatisfiable" : { start: Math.max(0, size - suffix), end: size - 1 };
 }
 const start = Number(match[1]), last = match[2] === "" ? Number.MAX_SAFE_INTEGER : Number(match[2]);
 if (!Number.isSafeInteger(start) || !Number.isSafeInteger(last) || last < start) return null;
 return start >= size ? "unsatisfiable" : { start, end: Math.min(last, size - 1) };
}
async function serveFile(req: Request, res: Response, root: string | undefined, asset: ShopMediaAsset, published: boolean) {
 const film = asset.kind === "video";
 if (!root || !isAbsolute(root) || !(film ? filmFilename : imageFilename).test(asset.storageKey) || asset.storageKey !== `${asset.sha256}.${extension(asset)}`) throw missing();
 let file;
 try { file = await open(join(root, asset.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW); }
 catch { throw missing(); }
 let streaming = false;
 try {
  const stat = await file.stat(); if (!stat.isFile() || stat.size !== asset.bytes) throw missing();
  // Names are content hashes, so a published file never changes: browsers and the CDN may keep it for a year.
  res.set({ "Content-Type": film ? filmMime[extension(asset) as FilmContainer] : "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": published ? "public, max-age=31536000, immutable" : "private, no-store" });
  if (!film) { res.set("Content-Length", String(stat.size)); res.send(await file.readFile()); return; }
  // Films stream from disk and answer byte ranges, which Safari needs before it plays a video at all.
  const etag = `"${asset.sha256}"`;
  res.set({ "Accept-Ranges": "bytes", ETag: etag });
  const ifRange = req.get("If-Range");
  const range = ifRange === undefined || ifRange === etag ? byteRange(req.get("Range"), stat.size) : null;
  if (range === "unsatisfiable") { res.status(416).set("Content-Range", `bytes */${stat.size}`).end(); return; }
  const { start, end } = range ?? { start: 0, end: stat.size - 1 };
  if (range) res.status(206).set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  res.set("Content-Length", String(end - start + 1));
  if (req.method === "HEAD") { res.end(); return; }
  streaming = true;
  // A visitor who seeks or leaves mid-film ends the stream early; the file closes with it.
  await pipeline(file.createReadStream({ start, end, autoClose: true }), res).catch(() => {});
 } finally { if (!streaming) await file.close(); }
}
/**
 * Removes temporary upload files over an hour old. A restart mid-upload (a release, a PM2 restart) leaves one behind,
 * nothing else would ever remove it, and it counts against no quota. Runs once as the API starts.
 */
export async function sweepAbandonedUploads(root: string, olderThanMs = 60 * 60_000): Promise<number> {
 let removed = 0;
 for (const name of await readdir(root)) {
  if (!/^\.(?:upload-[0-9a-f-]{36}\.tmp|film-[0-9a-f-]{36}\.part)$/.test(name)) continue;
  const path = join(root, name), stat = await lstat(path).catch(() => null);
  if (stat?.isFile() && Date.now() - stat.mtimeMs > olderThanMs) { await unlink(path).catch(() => {}); removed++; }
 }
 return removed;
}
export function registerMediaRoutes(app: Express, db: PrismaClient, config: MediaConfig) {
 let activeUploads = 0, activeFilmUploads = 0;
 if (config.mediaRoot && isAbsolute(config.mediaRoot)) void sweepAbandonedUploads(config.mediaRoot).catch(() => {});
 app.use("/api/admin/media", (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
 const guard = async (req: Request, _res: Response, next: NextFunction) => {
  if (req.get("Origin") !== config.webOrigin) throw new HttpError(403, "ORIGIN_REJECTED", "Please make this change from the Maple website.");
  await requireStaff(db, req, config.secureCookies, true);
  next();
 };
 const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "MEDIA_UPLOAD_LIMIT", message: "Too many uploads. Please wait a minute and try again." } });
 const imageLimiter = rateLimit({ windowMs: 60_000, limit: imageUploadsPerMinute, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "MEDIA_UPLOAD_LIMIT", message: "Too many uploads. Please wait a minute and try again." } });
 app.post("/api/admin/media", guard, imageLimiter, async (req, res) => {
  if (!config.mediaRoot || !isAbsolute(config.mediaRoot)) throw unavailable();
  if (!["image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type") ?? "")) throw new HttpError(415, "MEDIA_TYPE_REJECTED", "Choose a JPEG, PNG or WebP image.");
  if (activeUploads >= 2) throw new HttpError(429, "MEDIA_UPLOAD_BUSY", "Other images are uploading. Please try again shortly.");
  activeUploads++;
  // A disconnected client must retain its slot until parsing, decoding and its transaction settle.
  try {
  req.setTimeout(15_000, () => req.destroy());
  await new Promise<void>((resolve, reject) => express.raw({ type: () => true, limit: maxBytes, inflate: false })(req, res, error => error ? reject(error) : resolve()));
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw invalid();
  let label: string;
  try { label = decodeURIComponent(req.get("X-Media-Label") ?? "Uploaded image").trim(); } catch { throw invalid(); }
  if (!label || label.length > 160 || /[\u0000-\u001f\u007f]/.test(label)) throw new HttpError(400, "MEDIA_INVALID_LABEL", "Use an image label of up to 160 characters.");
  // The largest picture file Settings allows (5 MB unless a publisher chose otherwise; owner, 23 Nov 2026), within the 8 MB
  // the body parser takes at most.
  const rules = await readMediaUploadRules(db);
  const tooLarge = imageFileProblem(rules, req.body.length);
  if (tooLarge) throw new HttpError(413, "MEDIA_TOO_LARGE", tooLarge);
  const image = await normalize(req.body, req.get("Content-Type")!, rules);
  const root = await checkedRoot(config.mediaRoot);
  const result = await db.$transaction(async tx => {
   // Shared with every API worker: enforce quota and content-addressed deduplication atomically.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(684019735)`;
   const staff = await requireStaff(tx, req, config.secureCookies, true, false, true);
   const existing = await tx.shopMediaAsset.findUnique({ where: { sha256: image.sha256 } });
   // The same picture uploaded again comes back into the library if it had been removed.
   if (existing) return { asset: existing.removedAt ? await tx.shopMediaAsset.update({ where: { id: existing.id }, data: { removedAt: null, removedById: null } }) : existing, created: false };
   const count = await tx.shopMediaAsset.count({ where: { kind: "image" } });
   if (count >= 500 || await diskUsage(root, "image") + image.data.length > diskQuota) throw new HttpError(409, "MEDIA_QUOTA_REACHED", "The image library is full. Contact your administrator.");
   const storageKey = `${image.sha256}.webp`;
   await installFile(root, storageKey, image.data);
   const asset = await tx.shopMediaAsset.create({ data: { sha256: image.sha256, storageKey, label, width: image.width, height: image.height, bytes: image.data.length, mimeType: "image/webp", createdById: staff.user.id } });
   return { asset, created: true };
  }, { timeout: 20_000 });
  res.status(result.created ? 201 : 200).json({ asset: serialize(result.asset) });
  } finally { activeUploads--; if (req.socket) req.setTimeout(0); }
 });
 /**
  * Films are stored exactly as uploaded: the server cannot re-encode, so staff upload a web-ready MP4 or WebM
  * (docs/media-library.md). Browsers reach this through the web app's streaming upload route
  * (apps/web/app/api/admin/media/films/route.ts), never through the buffered rewrite.
  */
 app.post("/api/admin/media/films", guard, limiter, async (req, res) => {
  if (!config.mediaRoot || !isAbsolute(config.mediaRoot)) throw unavailable();
  const container = filmTypes[req.get("Content-Type") ?? ""];
  if (!container) throw new HttpError(415, "MEDIA_TYPE_REJECTED", "Choose an MP4 or WebM film.");
  // A declared length is checked before any of the body is read. Cloudflare's tunnel sends uploads chunked, with no
  // length, so those are taken too and stopped as soon as they pass 80 MB.
  const chunked = req.get("Transfer-Encoding") !== undefined, declared = chunked ? null : Number(req.get("Content-Length"));
  if (declared !== null && (!Number.isSafeInteger(declared) || declared <= 0)) throw new HttpError(411, "MEDIA_LENGTH_REQUIRED", "Choose a film file to upload.");
  if (declared !== null && declared > maxFilmBytes) throw filmTooLarge();
  let label: string;
  try { label = decodeURIComponent(req.get("X-Media-Label") ?? "Uploaded film").trim(); } catch { label = ""; }
  if (!label || label.length > 160 || /[\u0000-\u001f\u007f]/.test(label)) throw new HttpError(400, "MEDIA_INVALID_LABEL", "Use a film label of up to 160 characters.");
  if (activeFilmUploads >= 2) throw new HttpError(429, "MEDIA_UPLOAD_BUSY", "Other films are uploading. Please try again shortly.");
  activeFilmUploads++;
  try {
   // A film can take minutes on a slow connection, which the images' 15 seconds would cut off.
   req.setTimeout(10 * 60_000, () => req.destroy());
   const root = await checkedRoot(config.mediaRoot);
   const film = await receiveFilm(req, root, declared, container);
   try {
    const result = await db.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(684019735)`;
     const staff = await requireStaff(tx, req, config.secureCookies, true, false, true);
     const existing = await tx.shopMediaAsset.findUnique({ where: { sha256: film.sha256 } });
     if (existing) return { asset: existing.removedAt ? await tx.shopMediaAsset.update({ where: { id: existing.id }, data: { removedAt: null, removedById: null } }) : existing, created: false };
     const count = await tx.shopMediaAsset.count({ where: { kind: "video" } });
     if (count >= maxFilms || await diskUsage(root, "video") + film.bytes > filmDiskQuota) throw new HttpError(409, "MEDIA_QUOTA_REACHED", "The film library is full. Contact your administrator.");
     const storageKey = `${film.sha256}.${container}`;
     await installFilm(root, film.temporary, storageKey);
     const { durationMs, width, height, faststart } = film.facts;
     const asset = await tx.shopMediaAsset.create({ data: { sha256: film.sha256, storageKey, kind: "video", label, width, height, durationMs, faststart, bytes: film.bytes, mimeType: filmMime[container], createdById: staff.user.id } });
     return { asset, created: true };
    }, { timeout: 20_000 });
    res.status(result.created ? 201 : 200).json({ asset: serialize(result.asset) });
   } finally { await unlink(film.temporary).catch(() => {}); }
  } finally { activeFilmUploads--; if (req.socket) req.setTimeout(0); } // the socket is gone when an upload was cut off
 });
 app.get("/api/admin/media", async (req, res) => {
  await requireStaff(db, req, config.secureCookies);
  const limit = req.query.limit === undefined ? 24 : Number(req.query.limit), cursor = req.query.cursor, kind = req.query.kind, removed = req.query.removed;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor !== undefined && (typeof cursor !== "string" || !/^[a-z0-9]{1,100}$/.test(cursor))) || (kind !== undefined && kind !== "image" && kind !== "video") || (removed !== undefined && removed !== "1")) throw new HttpError(400, "MEDIA_INVALID_PAGE", "Choose a valid image page.");
  if (cursor && !await db.shopMediaAsset.findUnique({ where: { id: cursor as string } })) throw new HttpError(400, "MEDIA_INVALID_PAGE", "This image page is unavailable. Reload the library.");
  // The library and its pickers list what is in it; `removed=1` lists what was removed from it (owner, 23 Nov 2026).
  const where = { ...(kind ? { kind: kind as ShopMediaAsset["kind"] } : {}), removedAt: removed === "1" ? { not: null } : null };
  const rows = await db.shopMediaAsset.findMany({ where, orderBy: { id: "desc" }, take: limit + 1, ...(cursor ? { cursor: { id: cursor as string }, skip: 1 } : {}) });
  const assets = rows.slice(0, limit);
  res.json({ assets: assets.map(serialize), nextCursor: rows.length > limit ? assets.at(-1)!.id : null });
 });
 app.get("/api/admin/media/:sha/preview", async (req, res) => {
  await requireStaff(db, req, config.secureCookies);
  const sha = String(req.params.sha); if (!shaPattern.test(sha)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { sha256: sha } }); if (!asset) throw missing();
  await serveFile(req, res, config.mediaRoot, asset, false);
 });
 /**
  * Managing the library (owner, 23 Nov 2026: "an option for delete and edit of images in media gallery"): rename, remove
  * (hidden from the library and its pickers, the file kept so pages that use it keep working), restore, where a file is
  * used, and delete permanently (the row and the file; a publisher's step, from the library or from Removed, only for a
  * file that neither the draft nor the live storefront uses).
  */
 const jsonBody = express.json({ limit: "4kb" });
 const findAsset = async (id: unknown) => {
  if (typeof id !== "string" || !/^[a-z0-9]{1,100}$/.test(id)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { id } });
  if (!asset) throw missing();
  return asset;
 };
 const usageOf = async (asset: ShopMediaAsset) => {
  const document = await db.shopContent.findUnique({ where: { id: "storefront" }, select: { draft: true, published: true } });
  const url = `/media/uploads/${asset.sha256}.${extension(asset)}`;
  return { draft: mediaUsage(document?.draft).get(url) ?? [], published: mediaUsage(document?.published).get(url) ?? [] };
 };
 app.patch("/api/admin/media/:id", guard, jsonBody, async (req, res) => {
  const asset = await findAsset(req.params.id);
  const label = typeof (req.body as { label?: unknown } | undefined)?.label === "string" ? ((req.body as { label: string }).label).trim() : "";
  if (!label || label.length > 160 || /[\u0000-\u001f\u007f]/.test(label)) throw new HttpError(400, "MEDIA_INVALID_LABEL", "Use a name of up to 160 characters.");
  res.json({ asset: serialize(await db.shopMediaAsset.update({ where: { id: asset.id }, data: { label } })) });
 });
 app.post("/api/admin/media/:id/remove", guard, async (req, res) => {
  const staff = await requireStaff(db, req, config.secureCookies, true);
  const asset = await findAsset(req.params.id);
  const updated = asset.removedAt ? asset : await db.shopMediaAsset.update({ where: { id: asset.id }, data: { removedAt: new Date(), removedById: staff.user.id } });
  res.json({ asset: serialize(updated) });
 });
 app.post("/api/admin/media/:id/restore", guard, async (req, res) => {
  const asset = await findAsset(req.params.id);
  const updated = asset.removedAt ? await db.shopMediaAsset.update({ where: { id: asset.id }, data: { removedAt: null, removedById: null } }) : asset;
  res.json({ asset: serialize(updated) });
 });
 app.get("/api/admin/media/:id/usage", async (req, res) => {
  await requireStaff(db, req, config.secureCookies);
  res.json(await usageOf(await findAsset(req.params.id)));
 });
 app.delete("/api/admin/media/:id", guard, async (req, res) => {
  await requireStaff(db, req, config.secureCookies, true, true);
  const asset = await db.$transaction(async tx => {
   // The same lock as uploads and publishing, so a publish cannot take this file up while it is deleted.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(684019735)`;
   const row = await tx.shopMediaAsset.findUnique({ where: { id: (await findAsset(req.params.id)).id } });
   if (!row) throw missing();
   // From the library or from Removed alike (owner, 23 Nov 2026: the two kinds of delete side by side).
   const document = await tx.shopContent.findUnique({ where: { id: "storefront" }, select: { draft: true, published: true } });
   const url = `/media/uploads/${row.sha256}.${extension(row)}`;
   const places = [...new Set([...(mediaUsage(document?.published).get(url) ?? []).map(place => `${place} (live)`), ...(mediaUsage(document?.draft).get(url) ?? []).map(place => `${place} (draft)`)])];
   if (places.length) throw new HttpError(409, "MEDIA_IN_USE", `It is still used: ${places.slice(0, 6).join("; ")}${places.length > 6 ? `; and ${places.length - 6} more` : ""}. Choose another ${row.kind === "video" ? "film" : "picture"} there and save${document?.published ? " and publish" : ""} first.`);
   await tx.shopMediaAsset.delete({ where: { id: row.id } });
   return row;
  }, { timeout: 20_000 });
  // The row is gone, so nothing serves the file any more; a file that cannot be unlinked is left unreachable, as a crash
  // between writing and recording an upload leaves one (docs/media-library.md).
  if (config.mediaRoot && isAbsolute(config.mediaRoot) && (asset.kind === "video" ? filmFilename : imageFilename).test(asset.storageKey)) await unlink(join(config.mediaRoot, asset.storageKey)).catch(() => {});
  res.json({ deleted: asset.id });
 });
 app.get("/media/uploads/:filename", async (req, res) => {
  // Missing/private files must not become negatively cached during publication.
  res.set("Cache-Control", "no-store");
  const filename = String(req.params.filename); if (!publicFilename.test(filename)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { storageKey: filename } }); if (!asset?.publicAt) throw missing();
  await serveFile(req, res, config.mediaRoot, asset, true);
 });
}
type MediaVisit = (kind: "image" | "film", value: unknown, place: string) => void;
/**
 * Every field of a content document that may name a library file, each with where it sits in words staff know. Shared by
 * publication (which files to check and make public) and the library (where a file is used, before it is deleted). Keep
 * this field list in step with `previewMediaContent` in apps/web/lib/draft-preview.ts.
 */
export function walkMediaFields(content: unknown, visit: MediaVisit) {
 const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
 const named = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : fallback;
 /** Every picture in a rich-text document (an editorial tag tree); words are never treated as pictures. */
 function pictures(nodes: unknown, place: string): void {
  for (const value of list(nodes)) {
   const node = record(value);
   if (node.tag === "img") visit("image", node.src, place);
   pictures(node.children, place);
  }
 }
 const document = record(content);
 const merchandising = record(document.homeMerchandising);
 // Hidden tiles remain part of the published document and use the same private-media gate.
 list(merchandising.categories).forEach((item, index) => visit("image", record(item).image, `Merchandising, category tile ${index + 1}`));
 list(merchandising.offers).forEach((item, index) => visit("image", record(item).image, `Merchandising, offer card ${index + 1}`));
 // All template slots are published references, including artwork in hidden sections.
 for (const value of list(document.templateMedia)) {
  const item = record(value), key = named(item.key, "artwork");
  visit("image", item.image, `Artwork, ${key}`); visit("image", item.mobileImage, `Artwork, ${key} (phones)`);
 }
 // The films chosen for the homepage testimonial and the collection pages, shown or not, each with its phone film.
 for (const value of list(document.templateFilms)) {
  const item = record(value), key = named(item.key, "film");
  visit("film", item.src, `Films, ${key}`); visit("film", item.mobileSrc, `Films, ${key} (phones)`);
 }
 // Homepage details: hero slides (a video slide's film, phone film and poster; an image slide's picture and phone picture),
 // extra Nimbus cards and the editorial block.
 const details = record(document.homeDetails);
 list(record(details.hero).slides).forEach((value, index) => {
  const slide = record(value), place = `Homepage hero, slide ${index + 1}`;
  if (slide.kind === "video") visit("film", slide.src, place); else visit("image", slide.src, place);
  visit("film", slide.mobileSrc, `${place} (phone film)`); visit("image", slide.poster, `${place} (cover)`); visit("image", slide.mobileImage, `${place} (phones)`);
 });
 list(record(details.nimbus).slides).forEach((value, index) => {
  const slide = record(value);
  visit("image", slide.image, `Nimbus cards, card ${index + 1}`); visit("image", slide.mobileImage, `Nimbus cards, card ${index + 1} (phones)`);
 });
 visit("image", record(details.editorial).leftImage, "Homepage editorial, left picture"); visit("image", record(details.editorial).rightImage, "Homepage editorial, right picture");
 for (const value of list(document.authoredArticles)) {
  const article = record(value), place = `Blog post “${named(article.title, named(article.slug, "untitled"))}”`;
  visit("image", record(article.cover).src, place);
  for (const block of list(article.blocks)) if (record(block).type === "image") visit("image", record(block).src, place);
 }
 list(document.instagramPosts).forEach((item, index) => visit("image", record(item).src, `Instagram, post ${index + 1}`));
 for (const value of list(document.campaigns)) {
  const campaign = record(value), artwork = record(campaign.artwork), place = `Campaign “${named(campaign.key, "campaign")}”`;
  visit("image", artwork.desktopImage, `${place}, wide picture`); visit("image", artwork.mobileImage, `${place}, phone picture`);
 }
 for (const value of list(document.pages)) {
  const page = record(value), banner = record(page.banner), place = `Page “${named(page.title, named(page.slug, "untitled"))}”`;
  visit("image", banner.desktopImage, `${place}, banner`); visit("image", banner.mobileImage, `${place}, phone banner`);
  for (const block of list(page.blocks)) if (record(block).type === "image") visit("image", record(block).src, place);
  pictures(page.content, place);
 }
 // Rich-text policies and articles may hold media library pictures too.
 const editorial = record(document.editorialContent);
 for (const item of list(editorial.policies)) pictures(record(item).content, `Policy “${named(record(item).title, "untitled")}”`);
 for (const item of list(editorial.articles)) pictures(record(item).content, `Article “${named(record(item).title, "untitled")}”`);
}
/** Where each library file is used in a content document: its address, and the places that name it. */
export function mediaUsage(content: unknown): Map<string, string[]> {
 const usage = new Map<string, string[]>();
 walkMediaFields(content, (_kind, value, place) => {
  if (typeof value !== "string" || !value.startsWith("/media/uploads/")) return;
  const places = usage.get(value) ?? [];
  if (!places.includes(place)) places.push(place);
  usage.set(value, places);
 });
 return usage;
}
/**
 * Checks every library file the content names (walkMediaFields) and marks those files public, in the publishing
 * transaction. The staff preview rewrites the same image and film fields (by key name) in apps/web/lib/draft-preview.ts.
 */
export async function prepareMediaForPublication(tx: Prisma.TransactionClient, content: unknown, mediaRoot?: string) {
 const hashes = new Set<string>(), films = new Map<string, string>();
 function image(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/media/uploads/")) return;
  const match = imageReference.exec(value);
  if (!match) throw new HttpError(400, "MEDIA_REFERENCE_INVALID", "Choose a valid image from the media library.");
  hashes.add(match[1]!);
 }
 /** A film field: an uploaded film is `/media/uploads/<sha>.mp4|webm`; a file bundled with the store is not an upload. */
 function film(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/media/uploads/")) return;
  const match = filmReference.exec(value);
  if (!match) throw new HttpError(400, "MEDIA_REFERENCE_INVALID", "Choose a valid film from the media library.");
  films.set(match[1]!, match[2]!);
 }
 walkMediaFields(content, (kind, value) => kind === "image" ? image(value) : film(value));
 if (!hashes.size && !films.size) return;
 const absent = () => new HttpError(400, "MEDIA_REFERENCE_MISSING", "An image is missing from the media library. Choose it again before publishing.");
 const absentFilm = () => new HttpError(400, "MEDIA_REFERENCE_MISSING", "A film is missing from the media library. Choose it again before publishing.");
 const wanted = [...new Set([...hashes, ...films.keys()])];
 if (!mediaRoot || !isAbsolute(mediaRoot)) throw hashes.size ? absent() : absentFilm();
 const rows = await tx.shopMediaAsset.findMany({ where: { sha256: { in: wanted } } });
 const found = new Set(rows.map(row => row.sha256)), lost = wanted.find(sha => !found.has(sha));
 if (lost) throw films.has(lost) ? absentFilm() : absent();
 for (const row of rows) {
  let handle;
  if (films.has(row.sha256)) {
   // A film is checked by its size: hashing 80 MB inside the publishing transaction would hold it for seconds.
   if (hashes.has(row.sha256) || row.kind !== "video" || row.storageKey !== `${row.sha256}.${films.get(row.sha256)}`) throw absentFilm();
   try { handle = await open(join(mediaRoot, row.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW); const stat = await handle.stat(); if (!stat.isFile() || stat.size !== row.bytes || stat.size > maxFilmBytes) throw absentFilm(); }
   catch { throw absentFilm(); }
   finally { await handle?.close(); }
   continue;
  }
  if (row.kind !== "image" || row.storageKey !== `${row.sha256}.webp`) throw absent();
  try { handle = await open(join(mediaRoot, row.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW); const stat = await handle.stat(); if (!stat.isFile() || stat.size !== row.bytes || stat.size > maxBytes) throw absent();
   if (createHash("sha256").update(await handle.readFile()).digest("hex") !== row.sha256) throw absent(); }
  catch { throw absent(); }
  finally { await handle?.close(); }
 }
 await tx.shopMediaAsset.updateMany({ where: { sha256: { in: wanted }, publicAt: null }, data: { publicAt: new Date() } });
}
