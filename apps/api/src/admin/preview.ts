import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { z } from "zod";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";

/**
 * Draft preview tokens let the admin open the unpublished draft in a new tab.
 *
 * A token is `base64url(payload).base64url(hmac)` where the payload names the
 * staff id, the content version it was minted for and an expiry at most
 * fifteen minutes out. The HMAC key is derived from the hash of the staff
 * session that minted it, so the token is only valid together with that
 * session cookie: it carries no secret of its own, cannot be used by another
 * account or session, and cannot outlive a logout. The API checks the
 * expiry, the staff binding and that the draft is still the same version.
 */
export const previewTokenLifetime = 15 * 60_000;
const documentId = "storefront";
const payloadSchema = z.object({ v: z.literal(1), staffId: z.string().min(1).max(100), version: z.number().int().min(0), exp: z.number().int().min(0) }).strict();
const tokenPattern = /^[A-Za-z0-9_-]{1,2000}\.[A-Za-z0-9_-]{43}$/;
const key = (sessionTokenHash: string) => createHash("sha256").update("shop-draft-preview-v1:" + sessionTokenHash).digest();
const sign = (payload: string, sessionTokenHash: string) => createHmac("sha256", key(sessionTokenHash)).update(payload).digest("base64url");

export function signPreviewToken({ staffId, version, sessionTokenHash, now = Date.now() }: { staffId: string; version: number; sessionTokenHash: string; now?: number }) {
  const exp = Math.floor((now + previewTokenLifetime) / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, staffId, version, exp })).toString("base64url");
  return `${payload}.${sign(payload, sessionTokenHash)}`;
}
export function verifyPreviewToken(token: string, { sessionTokenHash, now = Date.now() }: { sessionTokenHash: string; now?: number }):
  { ok: true; staffId: string; version: number; expiresAt: number } | { ok: false; reason: "invalid" | "expired" } {
  if (typeof token !== "string" || !tokenPattern.test(token)) return { ok: false, reason: "invalid" };
  const [payload, signature] = token.split(".") as [string, string];
  const expected = sign(payload, sessionTokenHash);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return { ok: false, reason: "invalid" };
  let parsed;
  try { parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))); } catch { return { ok: false, reason: "invalid" }; }
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const expiresAt = parsed.data.exp * 1000;
  if (expiresAt < now) return { ok: false, reason: "expired" };
  return { ok: true, staffId: parsed.data.staffId, version: parsed.data.version, expiresAt };
}

const mintSchema = z.object({ expectedVersion: z.number().int().min(0).max(2000000000) }).strict();
const querySchema = z.object({ token: z.string().min(1).max(4000) });
export function registerPreviewRoutes(app: Express, db: PrismaClient, secure: boolean) {
  app.use("/api/admin/content/preview", (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
    next();
  });
  app.post("/api/admin/content/preview", async (req, res) => {
    const input = mintSchema.parse(req.body);
    const staff = await requireStaff(db, req, secure, true);
    const row = await db.shopContent.findUnique({ where: { id: documentId }, select: { version: true, draft: true } });
    if (!row) throw new HttpError(409, "CONTENT_DRAFT_REQUIRED", "Save a draft before previewing it.");
    if (row.version !== input.expectedVersion)
      throw new HttpError(409, "CONTENT_VERSION_CONFLICT", "Someone else changed this content. Reload before previewing again.");
    const now = Date.now();
    res.json({ token: signPreviewToken({ staffId: staff.user.id, version: row.version, sessionTokenHash: staff.tokenHash, now }), version: row.version, expiresAt: new Date(now + previewTokenLifetime).toISOString() });
  });
  app.get("/api/admin/content/preview", async (req, res) => {
    const { token } = querySchema.parse(req.query);
    const staff = await requireStaff(db, req, secure);
    const verified = verifyPreviewToken(token, { sessionTokenHash: staff.tokenHash });
    if (!verified.ok)
      throw verified.reason === "expired"
        ? new HttpError(403, "PREVIEW_TOKEN_EXPIRED", "This preview link has expired. Open Preview draft again.")
        : new HttpError(403, "PREVIEW_TOKEN_INVALID", "This preview link is not valid for your session. Open Preview draft again.");
    if (verified.staffId !== staff.user.id) throw new HttpError(403, "PREVIEW_TOKEN_INVALID", "This preview link is not valid for your session. Open Preview draft again.");
    const row = await db.shopContent.findUnique({ where: { id: documentId }, select: { version: true, draft: true } });
    if (!row || row.version !== verified.version)
      throw new HttpError(409, "PREVIEW_STALE", "The draft changed after this preview link was created. Open Preview draft again.");
    res.json({ version: row.version, content: storefrontContentSchema.parse(row.draft) });
  });
}
