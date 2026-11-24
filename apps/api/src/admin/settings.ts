import type { Express } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { defaultMediaUploadRules, mediaUploadRulesSchema, type MediaUploadRules } from "@shopmaple/contracts/media-upload-rules";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";

/**
 * Settings (owner, 23 Nov 2026): admin choices that take effect at once, outside the draft-and-publish content. The first
 * is the media library's upload rules, the banner sizes a picture must have. Any staff member with the website's content
 * reads them (the admin checks a picture before sending it); only a publisher changes them.
 */
const mediaUploadsKey = "media-uploads";

type SettingsReader = { shopSetting: Pick<PrismaClient["shopSetting"], "findUnique"> } | Prisma.TransactionClient;

/**
 * The media library's upload rules as saved; the default (every size taken, as before the setting existed) when none
 * are saved or a saved value no longer reads.
 */
export async function readMediaUploadRules(db: SettingsReader): Promise<MediaUploadRules> {
  const row = await db.shopSetting.findUnique({ where: { key: mediaUploadsKey } });
  if (!row) return defaultMediaUploadRules;
  const parsed = mediaUploadRulesSchema.safeParse(row.value);
  return parsed.success ? parsed.data : defaultMediaUploadRules;
}

async function describeMediaUploadRules(db: PrismaClient) {
  const row = await db.shopSetting.findUnique({ where: { key: mediaUploadsKey }, include: { updatedBy: { select: { name: true, email: true } } } });
  const parsed = row ? mediaUploadRulesSchema.safeParse(row.value) : null;
  return {
    rules: parsed?.success ? parsed.data : defaultMediaUploadRules,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedBy: row?.updatedBy ? row.updatedBy.name ?? row.updatedBy.email : null,
  };
}

export function registerSettingsRoutes(app: Express, db: PrismaClient, secureCookies: boolean) {
  app.use("/api/admin/settings", (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  app.get("/api/admin/settings/media-uploads", async (req, res) => {
    await requireStaff(db, req, secureCookies);
    res.json(await describeMediaUploadRules(db));
  });
  app.put("/api/admin/settings/media-uploads", async (req, res) => {
    // A publisher's change, with the session's CSRF token; the Origin is checked for every change under /api.
    const staff = await requireStaff(db, req, secureCookies, true, true);
    const body = req.body && typeof req.body === "object" ? (req.body as { rules?: unknown }) : {};
    const parsed = mediaUploadRulesSchema.safeParse(body.rules);
    if (!parsed.success) throw new HttpError(400, "SETTINGS_INVALID", parsed.error.issues[0]?.message ?? "Check the sizes and try again.");
    const value = parsed.data as Prisma.InputJsonValue;
    await db.shopSetting.upsert({
      where: { key: mediaUploadsKey },
      create: { key: mediaUploadsKey, value, updatedById: staff.user.id },
      update: { value, updatedById: staff.user.id },
    });
    res.json(await describeMediaUploadRules(db));
  });
}
