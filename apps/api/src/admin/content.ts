import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient, type ShopContent } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { prepareMediaForPublication } from "./media.js";
import { normalizeArticlePublicationDates, validateAuthoredContentLinks } from "./authored-articles.js";
import { requireStaff } from "./auth.js";
const documentId = "storefront";
const version = z.number().int().min(0).max(2000000000);
const expectedSchema = z.object({ expectedVersion: version }).strict();
const saveSchema = z
  .object({ expectedVersion: version, content: storefrontContentSchema })
  .strict();
const rollbackSchema = z
  .object({ expectedVersion: version, revisionId: z.string().min(1).max(100) })
  .strict();
const conflict = () =>
  new HttpError(
    409,
    "CONTENT_VERSION_CONFLICT",
    "Someone else changed this content. Reload before saving again.",
  );
const previewTokenLifetime = 15 * 60_000;
const previewPayloadSchema = z.object({ s: z.string().min(1).max(100), v: version, e: z.number().int().min(0) }).strict();
const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const sign = (secret: string, payload: string) => encode(createHmac("sha256", secret).update(payload).digest());
/** A staff preview token: base64url payload bound to one staff member and draft version, plus an HMAC-SHA256 signature. */
export function signPreviewToken(secret: string, input: { staffId: string; version: number; expiresAt: Date }) {
  const payload = encode(JSON.stringify({ s: input.staffId, v: input.version, e: Math.floor(input.expiresAt.getTime() / 1000) }));
  return `${payload}.${sign(secret, payload)}`;
}
const previewInvalid = () => new HttpError(403, "PREVIEW_TOKEN_INVALID", "This preview link is not valid. Open the preview again from the editor.");
/** Verifies the signature before reading the payload; staff and version binding are checked by the caller. */
export function verifyPreviewToken(secret: string, token: string, now = new Date()) {
  const match = /^([A-Za-z0-9_-]{1,400})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) throw previewInvalid();
  const expected = Buffer.from(sign(secret, match[1]!), "base64url"), supplied = Buffer.from(match[2]!, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw previewInvalid();
  let payload: z.infer<typeof previewPayloadSchema>;
  try { payload = previewPayloadSchema.parse(JSON.parse(Buffer.from(match[1]!, "base64url").toString("utf8"))); }
  catch { throw previewInvalid(); }
  if (payload.e * 1000 <= now.getTime()) throw new HttpError(403, "PREVIEW_TOKEN_EXPIRED", "This preview link has expired. Open the preview again from the editor.");
  return { staffId: payload.s, version: payload.v, expiresAt: new Date(payload.e * 1000) };
}
function serialize(row: ShopContent | null) {
  return row
    ? {
        version: row.version,
        draft: row.draft,
        publishedVersion: row.publishedVersion,
        updatedAt: row.updatedAt.toISOString(),
      }
    : { version: 0, draft: null, publishedVersion: null, updatedAt: null };
}
async function change(
  db: PrismaClient,
  req: Request,
  secure: boolean,
  action: "save" | "publish" | "rollback",
  mediaRoot?: string,
) {
  const input: {
    expectedVersion: number;
    content?: Prisma.InputJsonValue;
    revisionId?: string;
  } =
    action === "save"
      ? saveSchema.parse(req.body)
      : action === "rollback"
        ? rollbackSchema.parse(req.body)
        : expectedSchema.parse(req.body);
  try {
    return await db.$transaction(async (tx) => {
      // Lock the current account/session while checking authority and committing the edit.
      const staff = await requireStaff(
        tx,
        req,
        secure,
        true,
        action === "publish",
        true,
      );
      const row = await tx.shopContent.findUnique({
        where: { id: documentId },
      });
      if ((row?.version ?? 0) !== input.expectedVersion) throw conflict();
      let content: Prisma.InputJsonValue;
      if (input.content !== undefined) content = input.content;
      else if (input.revisionId !== undefined) {
        const revision = await tx.shopContentRevision.findFirst({
          where: { id: input.revisionId, documentId },
        });
        if (!revision)
          throw new HttpError(
            404,
            "CONTENT_REVISION_NOT_FOUND",
            "This revision does not exist.",
          );
        content = storefrontContentSchema.parse(revision.content);
      } else {
        if (!row)
          throw new HttpError(
            409,
            "CONTENT_DRAFT_REQUIRED",
            "Save a draft before publishing.",
          );
        content = storefrontContentSchema.parse(row.draft);
      }
      const parsed = storefrontContentSchema.parse(content);
      if (action === "publish") {
        await validateAuthoredContentLinks(tx, parsed);
        await prepareMediaForPublication(tx, parsed, mediaRoot);
      }
      content = storefrontContentSchema.parse(await normalizeArticlePublicationDates(tx, parsed, action === "publish"));
      const nextVersion = input.expectedVersion + 1;
      if (!row) {
        await tx.shopContent.create({
          data: { id: documentId, version: nextVersion, draft: content },
        });
      } else {
        const updated = await tx.shopContent.updateMany({
          where: { id: documentId, version: input.expectedVersion },
          data: {
            version: nextVersion,
            draft: content,
            ...(action === "publish"
              ? { published: content, publishedVersion: nextVersion }
              : {}),
          },
        });
        if (updated.count !== 1) throw conflict();
      }
      await tx.shopContentRevision.create({
        data: {
          documentId,
          version: nextVersion,
          action,
          content,
          actorId: staff.user.id,
        },
      });
      return serialize(
        await tx.shopContent.findUniqueOrThrow({ where: { id: documentId } }),
      );
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw conflict();
    throw error;
  }
}
export function registerContentRoutes(
  app: Express,
  db: PrismaClient,
  secure: boolean,
  mediaRoot?: string,
  previewSecret?: string,
) {
  // Without a configured secret, tokens are only valid for this process and its lifetime.
  const secret = previewSecret ?? randomBytes(32).toString("hex");
  app.get("/api/content/storefront", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const row = await db.shopContent.findUnique({
      where: { id: documentId },
      select: { published: true, publishedVersion: true },
    });
    if (!row?.published || row.publishedVersion === null)
      throw new HttpError(
        404,
        "CONTENT_NOT_PUBLISHED",
        "Shop content has not been published.",
      );
    res.json({
      version: row.publishedVersion,
      content: storefrontContentSchema.parse(row.published),
    });
  });
  app.get("/api/admin/content", async (_req, res) =>
    res.json(
      serialize(await db.shopContent.findUnique({ where: { id: documentId } })),
    ),
  );
  app.put("/api/admin/content", async (req, res) =>
    res.json(await change(db, req, secure, "save")),
  );
  app.post("/api/admin/content/publish", async (req, res) =>
    res.json(await change(db, req, secure, "publish", mediaRoot)),
  );
  app.post("/api/admin/content/rollback", async (req, res) =>
    res.json(await change(db, req, secure, "rollback")),
  );
  app.post("/api/admin/content/preview", async (req, res) => {
    const input = expectedSchema.parse(req.body);
    const staff = await requireStaff(db, req, secure, true);
    const row = await db.shopContent.findUnique({ where: { id: documentId }, select: { version: true } });
    if (!row) throw new HttpError(409, "CONTENT_DRAFT_REQUIRED", "Save a draft before previewing it.");
    if (row.version !== input.expectedVersion) throw conflict();
    const expiresAt = new Date(Date.now() + previewTokenLifetime);
    res.json({
      token: signPreviewToken(secret, { staffId: staff.user.id, version: row.version, expiresAt }),
      version: row.version,
      expiresAt: expiresAt.toISOString(),
    });
  });
  app.get("/api/admin/content/preview", async (req, res) => {
    const staff = await requireStaff(db, req, secure);
    const token = z.string().min(1).max(512).parse(req.query.token);
    const claims = verifyPreviewToken(secret, token);
    if (claims.staffId !== staff.user.id) throw previewInvalid();
    const row = await db.shopContent.findUnique({ where: { id: documentId } });
    if (!row || row.version !== claims.version)
      throw new HttpError(409, "PREVIEW_VERSION_STALE", "The draft has changed since this preview was opened. Open the preview again from the editor.");
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.json({
      version: row.version,
      publishedVersion: row.publishedVersion,
      expiresAt: claims.expiresAt.toISOString(),
      content: storefrontContentSchema.parse(row.draft),
    });
  });
  app.get("/api/admin/content/revisions", async (_req, res) => {
    const revisions = await db.shopContentRevision.findMany({
      where: { documentId },
      orderBy: { version: "desc" },
      take: 100,
      include: { actor: { select: { email: true } } },
    });
    res.json({
      revisions: revisions.map((r) => ({
        id: r.id,
        version: r.version,
        action: r.action,
        actorEmail: r.actor.email,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}
