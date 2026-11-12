import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pipeline } from "node:stream/promises";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { Prisma, PrismaClient, ShopMediaAsset } from "@prisma/client";
import sharp from "sharp";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";
import { filmHeadBytes, FilmInvalid, inspectFilm, sniffFilm, type FilmContainer } from "./film-inspect.js";
export type MediaConfig = { webOrigin: string; secureCookies: boolean; mediaRoot?: string };
const shaPattern = /^[a-f0-9]{64}$/;
const imageFilename = /^[a-f0-9]{64}\.webp$/;
const filmFilename = /^[a-f0-9]{64}\.(?:mp4|webm)$/;
const publicFilename = /^[a-f0-9]{64}\.(?:webp|mp4|webm)$/;
const imageReference = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/;
const filmReference = /^\/media\/uploads\/([a-f0-9]{64})\.(mp4|webm)$/;
const maxBytes = 8 * 1024 * 1024, diskQuota = 250 * 1024 * 1024;
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
 return { id: row.id, sha256: row.sha256, kind: row.kind, label: row.label, width: row.width, height: row.height, bytes: row.bytes, mimeType: row.mimeType, durationMs: row.durationMs, faststart: row.faststart, createdAt: row.createdAt.toISOString(), publicAt: row.publicAt?.toISOString() ?? null, url: `/media/uploads/${row.sha256}.${extension(row)}`, previewUrl: `/api/admin/media/${row.sha256}/preview` };
}
async function normalize(body: Buffer, mime: string) {
 try {
  const decoder = sharp(body, { limitInputPixels: 24_000_000, animated: true, failOn: "warning" });
  const meta = await decoder.metadata();
  const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  if (!meta.format || formats[meta.format] !== mime || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width * meta.height > 24_000_000) throw invalid();
  const { data, info } = await decoder.rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
 } catch { throw invalid(); }
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
 app.post("/api/admin/media", guard, limiter, async (req, res) => {
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
  const image = await normalize(req.body, req.get("Content-Type")!);
  const root = await checkedRoot(config.mediaRoot);
  const result = await db.$transaction(async tx => {
   // Shared with every API worker: enforce quota and content-addressed deduplication atomically.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(684019735)`;
   const staff = await requireStaff(tx, req, config.secureCookies, true, false, true);
   const existing = await tx.shopMediaAsset.findUnique({ where: { sha256: image.sha256 } });
   if (existing) return { asset: existing, created: false };
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
     if (existing) return { asset: existing, created: false };
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
  const limit = req.query.limit === undefined ? 24 : Number(req.query.limit), cursor = req.query.cursor, kind = req.query.kind;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor !== undefined && (typeof cursor !== "string" || !/^[a-z0-9]{1,100}$/.test(cursor))) || (kind !== undefined && kind !== "image" && kind !== "video")) throw new HttpError(400, "MEDIA_INVALID_PAGE", "Choose a valid image page.");
  if (cursor && !await db.shopMediaAsset.findUnique({ where: { id: cursor as string } })) throw new HttpError(400, "MEDIA_INVALID_PAGE", "This image page is unavailable. Reload the library.");
  const rows = await db.shopMediaAsset.findMany({ where: kind ? { kind } : {}, orderBy: { id: "desc" }, take: limit + 1, ...(cursor ? { cursor: { id: cursor as string }, skip: 1 } : {}) });
  const assets = rows.slice(0, limit);
  res.json({ assets: assets.map(serialize), nextCursor: rows.length > limit ? assets.at(-1)!.id : null });
 });
 app.get("/api/admin/media/:sha/preview", async (req, res) => {
  await requireStaff(db, req, config.secureCookies);
  const sha = String(req.params.sha); if (!shaPattern.test(sha)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { sha256: sha } }); if (!asset) throw missing();
  await serveFile(req, res, config.mediaRoot, asset, false);
 });
 app.get("/media/uploads/:filename", async (req, res) => {
  // Missing/private files must not become negatively cached during publication.
  res.set("Cache-Control", "no-store");
  const filename = String(req.params.filename); if (!publicFilename.test(filename)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { storageKey: filename } }); if (!asset?.publicAt) throw missing();
  await serveFile(req, res, config.mediaRoot, asset, true);
 });
}
/**
 * Walks every field of the content document that may reference a library upload and marks
 * those uploads public. Keep this field list in step with `previewMediaContent` in
 * apps/web/lib/draft-preview.ts, which rewrites the same image and film fields (by key name) for
 * the staff preview.
 */
export async function prepareMediaForPublication(tx: Prisma.TransactionClient, content: unknown, mediaRoot?: string) {
 const hashes = new Set<string>(), films = new Map<string, string>();
 const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
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
 /** Every picture in a rich-text document (an editorial tag tree); words are never treated as pictures. */
 function pictures(nodes: unknown): void {
  for (const value of list(nodes)) {
   const node = record(value);
   if (node.tag === "img") image(node.src);
   pictures(node.children);
  }
 }
 const document = record(content);
 const merchandising = record(document.homeMerchandising);
 // Hidden tiles remain part of the published document and use the same private-media gate.
 for (const rail of [merchandising.categories, merchandising.offers])
  for (const item of list(rail)) image(record(item).image);
 // All template slots are published references, including artwork in hidden sections.
 for (const item of list(document.templateMedia)) { image(record(item).image); image(record(item).mobileImage); }
 // The films chosen for the homepage testimonial and the collection pages, shown or not.
 for (const item of list(document.templateFilms)) film(record(item).src);
 // Homepage details: hero slides (a video slide's film and poster), extra Nimbus cards and the editorial block.
 const details = record(document.homeDetails);
 for (const value of list(record(details.hero).slides)) { const slide = record(value); if (slide.kind === "video") film(slide.src); else image(slide.src); image(slide.poster); }
 for (const slide of list(record(details.nimbus).slides)) { image(record(slide).image); image(record(slide).mobileImage); }
 image(record(details.editorial).leftImage); image(record(details.editorial).rightImage);
 for (const item of list(document.authoredArticles)) {
  const article = record(item);
  image(record(article.cover).src);
  for (const block of list(article.blocks)) if (record(block).type === "image") image(record(block).src);
 }
 for (const item of list(document.instagramPosts)) image(record(item).src);
 for (const item of list(document.campaigns)) { const artwork = record(record(item).artwork); image(artwork.desktopImage); image(artwork.mobileImage); }
 for (const item of list(document.pages)) {
  const page = record(item), banner = record(page.banner);
  image(banner.desktopImage); image(banner.mobileImage);
  for (const block of list(page.blocks)) if (record(block).type === "image") image(record(block).src);
  pictures(page.content);
 }
 // Rich-text policies and articles may hold media library pictures too.
 const editorial = record(document.editorialContent);
 for (const item of [...list(editorial.policies), ...list(editorial.articles)]) pictures(record(item).content);
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
