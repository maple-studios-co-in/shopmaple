import type { Prisma, PrismaClient } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { enquiryAdminIdSchema, enquiryAdminQuerySchema, enquiryReviewInputSchema, enquiryAssignmentInputSchema, enquiryNoteInputSchema, enquiryPageQuerySchema, enquiryStaffIdSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { requireStaff } from "./auth.js";
const summarySelect = { id: true, kind: true, status: true, version: true, assignedToId: true, createdAt: true } as const;
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
const conflict = () => new HttpError(409, "ENQUIRY_VERSION_CONFLICT", "This enquiry changed. Reload the enquiry before trying again.");
const invalid = () => new HttpError(400, "INVALID_INPUT", "Check the supplied values and try again.");
const staffCursorSchema = z.object({ id: enquiryStaffIdSchema }).strict();
const activityCursorSchema = z.object({ enquiryId: enquiryAdminIdSchema, version: z.number().int().positive().max(2147483647) }).strict();
const encodeCursor = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function decodePageCursor<T>(value: string, schema: z.ZodType<T>): T {
    try { return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
    catch { throw invalid(); }
}
async function advanceVersion(tx: Prisma.TransactionClient, id: string, expectedVersion: number, data: { assignedToId?: string | null } = {}) {
    const updated = await tx.enquiry.updateMany({ where: { id, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
    if (updated.count !== 1) {
        if (!await tx.enquiry.findUnique({ where: { id }, select: { id: true } })) throw missing();
        throw conflict();
    }
}
export function registerEnquiryAdminRoutes(app: Express, db: PrismaClient, secure: boolean) {
    app.get("/api/admin/enquiries", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure);
            const query = enquiryAdminQuerySchema.parse(req.query);
            const cursor = query.cursor ? decodeCursor(query.cursor) : null;
            const rows = await tx.enquiry.findMany({
                where: { ...(query.assignment ? { assignedToId: query.assignment === "mine" ? actor.id : null } : {}), ...(query.kind ? { kind: query.kind } : {}), ...(query.status ? { status: query.status } : {}),
                    ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1, select: summarySelect,
            });
            const items = rows.slice(0, query.limit), last = items.at(-1);
            return { items, nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
        });
        res.json(result);
    });
    app.get("/api/admin/enquiries/assignees", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const query = enquiryPageQuerySchema.parse(req.query);
            const cursor = query.cursor ? decodePageCursor(query.cursor, staffCursorSchema) : null;
            const rows = await tx.shopAdmin.findMany({
                where: { active: true, canManageEnquiries: true, ...(cursor ? { id: { gt: cursor.id } } : {}) },
                select: { id: true, email: true }, orderBy: { id: "asc" }, take: query.limit + 1,
            });
            const items = rows.slice(0, query.limit), last = items.at(-1);
            return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ id: last.id }) : null };
        });
        res.json(result);
    });
    app.get("/api/admin/enquiries/:id/activity", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const query = enquiryPageQuerySchema.parse(req.query);
            const cursor = query.cursor ? decodePageCursor(query.cursor, activityCursorSchema) : null;
            if (cursor && cursor.enquiryId !== id) throw invalid();
            if (!await tx.enquiry.findUnique({ where: { id }, select: { id: true } })) throw missing();
            const rows = await tx.enquiryActivity.findMany({
                where: { enquiryId: id, ...(cursor ? { version: { lt: cursor.version } } : {}) },
                select: { id: true, action: true, version: true, actorId: true, createdAt: true, assigneeId: true, body: true },
                orderBy: { version: "desc" }, take: query.limit + 1,
            });
            const items = rows.slice(0, query.limit), last = items.at(-1);
            return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ enquiryId: id, version: last.version }) : null };
        });
        res.json(result);
    });
    app.post("/api/admin/enquiries/:id/assignment", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure, true);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const { expectedVersion, assigneeId } = enquiryAssignmentInputSchema.parse(req.body);
            if (assigneeId !== null) {
                // Serialize assignment against capability revocation and deactivation.
                await tx.$queryRaw`SELECT "id" FROM "ShopAdmin" WHERE "id"=${assigneeId} FOR SHARE`;
                const target = await tx.shopAdmin.findUnique({ where: { id: assigneeId }, select: { active: true, canManageEnquiries: true } });
                if (!target?.active || !target.canManageEnquiries) throw new HttpError(400, "ENQUIRY_ASSIGNEE_UNAVAILABLE", "Choose an active staff member with enquiry access.");
            }
            // Lock no-ops too: a concurrent mutation must not make a stale assignment look successful.
            await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id"=${id} FOR UPDATE`;
            const current = await tx.enquiry.findUnique({ where: { id }, select: { version: true, assignedToId: true } });
            if (!current) throw missing();
            if (current.version !== expectedVersion) throw conflict();
            if (current.assignedToId === assigneeId) return tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect });
            await advanceVersion(tx, id, expectedVersion, { assignedToId: assigneeId });
            await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, assigneeId, version: expectedVersion + 1, action: assigneeId === null ? "unassigned" : "assigned" } });
            return tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect });
        });
        res.json(result);
    });
    app.post("/api/admin/enquiries/:id/notes", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure, true);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const { expectedVersion, body } = enquiryNoteInputSchema.parse(req.body);
            await advanceVersion(tx, id, expectedVersion);
            await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, version: expectedVersion + 1, action: "note", body } });
            return tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect });
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
