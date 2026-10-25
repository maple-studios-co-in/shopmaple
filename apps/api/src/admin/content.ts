import { Prisma, type PrismaClient, type ShopContent } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { prepareMediaForPublication } from "./media.js";
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
      if (action === "publish")
        await prepareMediaForPublication(tx, content, mediaRoot);
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
) {
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
