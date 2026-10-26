import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import express, { type Express, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { Prisma, PrismaClient, ShopMediaAsset } from "@prisma/client";
import sharp from "sharp";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";
export type MediaConfig = { webOrigin: string; secureCookies: boolean; mediaRoot?: string };
const shaPattern = /^[a-f0-9]{64}$/;
const filenamePattern = /^[a-f0-9]{64}\.webp$/;
const referencePattern = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/;
const maxBytes = 8 * 1024 * 1024, diskQuota = 250 * 1024 * 1024;
const missing = () => new HttpError(404, "MEDIA_NOT_FOUND", "This image is unavailable.");
const invalid = () => new HttpError(400, "MEDIA_INVALID_IMAGE", "Choose a valid, non-animated JPEG, PNG or WebP image up to 24 million pixels.");
const unavailable = () => new HttpError(503, "MEDIA_STORAGE_UNAVAILABLE", "Image uploads are temporarily unavailable.");
function serialize(row: ShopMediaAsset) {
 return { id: row.id, sha256: row.sha256, label: row.label, width: row.width, height: row.height, bytes: row.bytes, mimeType: row.mimeType, createdAt: row.createdAt.toISOString(), publicAt: row.publicAt?.toISOString() ?? null, url: `/media/uploads/${row.sha256}.webp`, previewUrl: `/api/admin/media/${row.sha256}/preview` };
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
async function diskUsage(root: string) {
 let bytes = 0;
 for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isSymbolicLink()) throw unavailable();
  if (entry.isFile()) bytes += (await lstat(join(root, entry.name))).size;
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
async function serveImage(res: Response, root: string | undefined, asset: ShopMediaAsset, published: boolean) {
 if (!root || !isAbsolute(root) || !filenamePattern.test(asset.storageKey) || asset.storageKey !== `${asset.sha256}.webp`) throw missing();
 let file;
 try { file = await open(join(root, asset.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW); }
 catch { throw missing(); }
 try {
  const stat = await file.stat(); if (!stat.isFile() || stat.size !== asset.bytes) throw missing();
  res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": published ? "public, max-age=31536000, immutable" : "private, no-store", "Content-Length": String(stat.size) });
  res.send(await file.readFile());
 } finally { await file.close(); }
}
export function registerMediaRoutes(app: Express, db: PrismaClient, config: MediaConfig) {
 let activeUploads = 0;
 app.use("/api/admin/media", (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
 app.post("/api/admin/media", async (req, _res, next) => {
  if (req.get("Origin") !== config.webOrigin) throw new HttpError(403, "ORIGIN_REJECTED", "Please make this change from the Maple website.");
  await requireStaff(db, req, config.secureCookies, true);
  next();
 }, rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "MEDIA_UPLOAD_LIMIT", message: "Too many uploads. Please wait a minute and try again." } }), async (req, res) => {
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
   const count = await tx.shopMediaAsset.count();
   if (count >= 500 || await diskUsage(root) + image.data.length > diskQuota) throw new HttpError(409, "MEDIA_QUOTA_REACHED", "The image library is full. Contact your administrator.");
   const storageKey = `${image.sha256}.webp`;
   await installFile(root, storageKey, image.data);
   const asset = await tx.shopMediaAsset.create({ data: { sha256: image.sha256, storageKey, label, width: image.width, height: image.height, bytes: image.data.length, mimeType: "image/webp", createdById: staff.user.id } });
   return { asset, created: true };
  }, { timeout: 20_000 });
  res.status(result.created ? 201 : 200).json({ asset: serialize(result.asset) });
  } finally { activeUploads--; req.setTimeout(0); }
 });
 app.get("/api/admin/media", async (req, res) => {
  await requireStaff(db, req, config.secureCookies);
  const limit = req.query.limit === undefined ? 24 : Number(req.query.limit), cursor = req.query.cursor;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor !== undefined && (typeof cursor !== "string" || !/^[a-z0-9]{1,100}$/.test(cursor)))) throw new HttpError(400, "MEDIA_INVALID_PAGE", "Choose a valid image page.");
  if (cursor && !await db.shopMediaAsset.findUnique({ where: { id: cursor as string } })) throw new HttpError(400, "MEDIA_INVALID_PAGE", "This image page is unavailable. Reload the library.");
  const rows = await db.shopMediaAsset.findMany({ orderBy: { id: "desc" }, take: limit + 1, ...(cursor ? { cursor: { id: cursor as string }, skip: 1 } : {}) });
  const assets = rows.slice(0, limit);
  res.json({ assets: assets.map(serialize), nextCursor: rows.length > limit ? assets.at(-1)!.id : null });
 });
 app.get("/api/admin/media/:sha/preview", async (req, res) => {
  await requireStaff(db, req, config.secureCookies);
  const sha = String(req.params.sha); if (!shaPattern.test(sha)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { sha256: sha } }); if (!asset) throw missing();
  await serveImage(res, config.mediaRoot, asset, false);
 });
 app.get("/media/uploads/:filename", async (req, res) => {
  // Missing/private images must not become negatively cached during publication.
  res.set("Cache-Control", "no-store");
  const filename = String(req.params.filename); if (!filenamePattern.test(filename)) throw missing();
  const asset = await db.shopMediaAsset.findUnique({ where: { storageKey: filename } }); if (!asset?.publicAt) throw missing();
  await serveImage(res, config.mediaRoot, asset, true);
 });
}
export async function prepareMediaForPublication(tx: Prisma.TransactionClient, content: unknown, mediaRoot?: string) {
 const hashes = new Set<string>();
 const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
 function image(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/media/uploads/")) return;
  const match = referencePattern.exec(value);
  if (!match) throw new HttpError(400, "MEDIA_REFERENCE_INVALID", "Choose a valid image from the media library.");
  hashes.add(match[1]!);
 }
 const document = record(content);
 const merchandising = record(document.homeMerchandising);
 // Hidden tiles remain part of the published document and use the same private-media gate.
 for (const rail of [merchandising.categories, merchandising.offers])
  for (const item of list(rail)) image(record(item).image);
 // All template slots are published references, including artwork in hidden sections.
 for (const item of list(document.templateMedia)) { image(record(item).image); image(record(item).mobileImage); }
 for (const item of list(document.authoredArticles)) {
  const article = record(item);
  image(record(article.cover).src);
  for (const block of list(article.blocks)) if (record(block).type === "image") image(record(block).src);
 }
 for (const item of list(document.instagramPosts)) image(record(item).src);
 for (const item of list(document.campaigns)) { const artwork = record(record(item).artwork); image(artwork.desktopImage); image(artwork.mobileImage); }
 for (const item of list(document.pages)) { const banner = record(record(item).banner); image(banner.desktopImage); image(banner.mobileImage); }
 if (!hashes.size) return;
 const absent = () => new HttpError(400, "MEDIA_REFERENCE_MISSING", "An image is missing from the media library. Choose it again before publishing.");
 if (!mediaRoot || !isAbsolute(mediaRoot)) throw absent();
 const rows = await tx.shopMediaAsset.findMany({ where: { sha256: { in: [...hashes] } } });
 if (rows.length !== hashes.size) throw absent();
 for (const row of rows) {
  if (row.storageKey !== `${row.sha256}.webp`) throw absent();
  let handle;
  try { handle = await open(join(mediaRoot, row.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW); const stat = await handle.stat(); if (!stat.isFile() || stat.size !== row.bytes || stat.size > maxBytes) throw absent();
   if (createHash("sha256").update(await handle.readFile()).digest("hex") !== row.sha256) throw absent(); }
  catch { throw absent(); }
  finally { await handle?.close(); }
 }
 await tx.shopMediaAsset.updateMany({ where: { sha256: { in: [...hashes] }, publicAt: null }, data: { publicAt: new Date() } });
}
