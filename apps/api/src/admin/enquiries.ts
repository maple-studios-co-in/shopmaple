import type { Prisma, PrismaClient } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { enquiryAdminIdSchema, enquiryAdminQuerySchema, enquiryReviewInputSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";
const summarySelect = { id: true, kind: true, status: true, version: true, createdAt: true } as const;
const detailSelect = { ...summarySelect, name: true, email: true, phone: true, message: true, context: true,
    reviews: { select: { id: true, actorId: true, version: true, action: true, createdAt: true }, orderBy: { version: "asc" as const } },
} as const;
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: enquiryAdminIdSchema }).strict();
function decodeCursor(value: string) {
    try {
        return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    }
    catch {
        throw new HttpError(400, "INVALID_INPUT", "Check the supplied values and try again.");
    }
}
async function requireEnquiryAccess(tx: Prisma.TransactionClient, req: Request, secure: boolean, write = false) {
    const session = await requireStaff(tx, req, secure, write, false, true);
    // The staff row remains locked until data reads or review/audit writes commit.
    const current = await tx.shopAdmin.findUniqueOrThrow({ where: { id: session.user.id } });
    if (!current.canManageEnquiries)
        throw new HttpError(403, "ENQUIRY_ACCESS_REQUIRED", "Your account does not have access to customer enquiries.");
    return session.user;
}
const missing = () => new HttpError(404, "ENQUIRY_NOT_FOUND", "This enquiry could not be found.");
const conflict = () => new HttpError(409, "ENQUIRY_VERSION_CONFLICT", "This enquiry changed. Reload the inbox before reviewing it again.");
export function registerEnquiryAdminRoutes(app: Express, db: PrismaClient, secure: boolean) {
    app.get("/api/admin/enquiries", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const query = enquiryAdminQuerySchema.parse(req.query);
            const cursor = query.cursor ? decodeCursor(query.cursor) : null;
            const rows = await tx.enquiry.findMany({
                where: { ...(query.kind ? { kind: query.kind } : {}), ...(query.status ? { status: query.status } : {}),
                    ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1, select: summarySelect,
            });
            const items = rows.slice(0, query.limit), last = items.at(-1);
            return { items, nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
        });
        res.json(result);
    });
    app.get("/api/admin/enquiries/:id", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const row = await tx.enquiry.findUnique({ where: { id }, select: detailSelect });
            if (!row)
                throw missing();
            return row;
        });
        res.json(result);
    });
    app.post("/api/admin/enquiries/:id/review", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure, true);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const { expectedVersion } = enquiryReviewInputSchema.parse(req.body);
            const updated = await tx.enquiry.updateMany({ where: { id, version: expectedVersion, status: "new" }, data: { status: "reviewed", version: { increment: 1 } } });
            if (updated.count !== 1) {
                if (!await tx.enquiry.findUnique({ where: { id }, select: { id: true } }))
                    throw missing();
                throw conflict();
            }
            await tx.enquiryReviewAudit.create({ data: { enquiryId: id, actorId: actor.id, version: expectedVersion + 1, action: "reviewed" } });
            return tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect });
        });
        res.json(result);
    });
}
