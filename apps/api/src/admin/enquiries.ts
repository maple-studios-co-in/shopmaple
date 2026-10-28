import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { enquiryAdminIdSchema, enquiryAdminQuerySchema, enquiryAssignmentInputSchema, enquiryNoteInputSchema, enquiryPageQuerySchema, enquiryStaffIdSchema, enquiryStageInputSchema, enquiryReplyInputSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { sendEnquiryReply, type EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import { requireStaff } from "./auth.js";
const detailSelect = { id: true, kind: true, status: true, version: true, assignedToId: true, contactId: true, name: true, createdAt: true, email: true, phone: true, message: true, context: true, lostReason: true,
    reviews: { select: { id: true, actorId: true, version: true, action: true, createdAt: true }, orderBy: { version: "asc" as const } },
} as const;
type DetailRow = Prisma.EnquiryGetPayload<{ select: typeof detailSelect }>;
const productOf = (context: unknown) => typeof context === "object" && context !== null && typeof (context as { product?: unknown }).product === "string" ? (context as { product: string }).product : "";
/** Shared summary shape for lists, boards and contact pages: metadata, name and product only. */
export function serializeEnquirySummary(row: { id: string; kind: string; status: string; version: number; assignedToId: string | null; contactId: string | null; name: string; context: unknown; createdAt: Date }) {
    return { id: row.id, kind: row.kind, status: row.status, version: row.version, assignedToId: row.assignedToId, contactId: row.contactId, name: row.name, product: productOf(row.context), createdAt: row.createdAt };
}
function serializeDetail(row: DetailRow) {
    const { reviews, ...rest } = row;
    return { ...rest, product: productOf(row.context), reviews };
}
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: enquiryAdminIdSchema }).strict();
function decodeCursor(value: string) {
    try {
        return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    }
    catch {
        throw new HttpError(400, "INVALID_INPUT", "Check the supplied values and try again.");
    }
}
export async function requireEnquiryAccess(tx: Prisma.TransactionClient, req: Request, secure: boolean, write = false) {
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
export const encodeCursor = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function decodePageCursor<T>(value: string, schema: z.ZodType<T>): T {
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
/** Escape ILIKE wildcards so a search term matches literally. */
const likePattern = (term: string) => "%" + term.replace(/[\\%_]/g, (match) => "\\" + match) + "%";

/** Fixed-window count per staff member for outbound replies; process-local by design. */
export class ActorRateLimit {
    private readonly hits = new Map<string, number[]>();
    constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) { }
    allow(actorId: string) {
        const at = this.now(), floor = at - this.windowMs;
        const recent = (this.hits.get(actorId) ?? []).filter(stamp => stamp > floor);
        if (recent.length >= this.limit) { this.hits.set(actorId, recent); return false; }
        recent.push(at); this.hits.set(actorId, recent); return true;
    }
}

export function registerEnquiryAdminRoutes(app: Express, db: PrismaClient, secure: boolean, delivery: EnquiryDeliveryConfig | null = null, outboundFetch: typeof fetch = fetch) {
    const replyLimit = new ActorRateLimit(20, 60 * 60_000);
    app.get("/api/admin/enquiries", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure);
            const query = enquiryAdminQuerySchema.parse(req.query);
            const cursor = query.cursor ? decodeCursor(query.cursor) : null;
            const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
            if (query.assignment) conditions.push(query.assignment === "mine" ? Prisma.sql`"assignedToId" = ${actor.id}` : Prisma.sql`"assignedToId" IS NULL`);
            if (query.assigneeId) conditions.push(Prisma.sql`"assignedToId" = ${query.assigneeId}`);
            if (query.kind) conditions.push(Prisma.sql`"kind" = ${query.kind}`);
            if (query.status) conditions.push(Prisma.sql`"status" = ${query.status}`);
            if (query.from) conditions.push(Prisma.sql`"createdAt" >= ${query.from}::date`);
            if (query.to) conditions.push(Prisma.sql`"createdAt" < (${query.to}::date + 1)`);
            if (query.q) {
                const pattern = likePattern(query.q);
                conditions.push(Prisma.sql`("name" ILIKE ${pattern} ESCAPE '\\' OR "email" ILIKE ${pattern} ESCAPE '\\' OR "phone" ILIKE ${pattern} ESCAPE '\\' OR "context"->>'product' ILIKE ${pattern} ESCAPE '\\' OR "context"->>'sku' ILIKE ${pattern} ESCAPE '\\')`);
            }
            // Columns are TIMESTAMP(3) without zone: bind the cursor as an ISO string cast to timestamp, never as a Date (timestamptz).
            if (cursor) conditions.push(Prisma.sql`("createdAt" < ${cursor.createdAt}::timestamp OR ("createdAt" = ${cursor.createdAt}::timestamp AND "id" < ${cursor.id}))`);
            const rows = await tx.$queryRaw<Array<{ id: string; kind: string; status: string; version: number; assignedToId: string | null; contactId: string | null; name: string; context: unknown; createdAt: Date }>>`
                SELECT "id", "kind", "status", "version", "assignedToId", "contactId", "name", "context", "createdAt" FROM "Enquiry"
                WHERE ${Prisma.join(conditions, " AND ")} ORDER BY "createdAt" DESC, "id" DESC LIMIT ${query.limit + 1}`;
            const items = rows.slice(0, query.limit).map(serializeEnquirySummary), last = items.at(-1);
            return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null };
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
                select: { id: true, action: true, version: true, actorId: true, createdAt: true, assigneeId: true, body: true, stage: true, taskId: true, subject: true },
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
            if (current.assignedToId === assigneeId) return serializeDetail(await tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect }));
            await advanceVersion(tx, id, expectedVersion, { assignedToId: assigneeId });
            await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, assigneeId, version: expectedVersion + 1, action: assigneeId === null ? "unassigned" : "assigned" } });
            return serializeDetail(await tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect }));
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
            return serializeDetail(await tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect }));
        });
        res.json(result);
    });
    app.post("/api/admin/enquiries/:id/stage", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure, true);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const { expectedVersion, stage, reason } = enquiryStageInputSchema.parse(req.body);
            await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id"=${id} FOR UPDATE`;
            const current = await tx.enquiry.findUnique({ where: { id }, select: { version: true, status: true, lostReason: true } });
            if (!current) throw missing();
            if (current.version !== expectedVersion) throw conflict();
            const lostReason = stage === "lost" ? reason ?? null : null;
            if (current.status === stage && current.lostReason === lostReason) return serializeDetail(await tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect }));
            const updated = await tx.enquiry.updateMany({ where: { id, version: expectedVersion }, data: { status: stage, lostReason, version: { increment: 1 } } });
            if (updated.count !== 1) throw conflict();
            await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, version: expectedVersion + 1, action: "status_changed", stage, body: lostReason } });
            return serializeDetail(await tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect }));
        });
        res.json(result);
    });
    app.post("/api/admin/enquiries/:id/reply", async (req, res) => {
        const prepared = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure, true);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const input = enquiryReplyInputSchema.parse(req.body);
            if (!delivery) throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "Email replies are not configured on this server. Contact the customer another way.");
            const current = await tx.enquiry.findUnique({ where: { id }, select: { version: true, email: true } });
            if (!current) throw missing();
            if (current.version !== input.expectedVersion) throw conflict();
            if (!replyLimit.allow(actor.id)) throw new HttpError(429, "REPLY_RATE_LIMITED", "You have sent many replies recently. Wait before sending more.");
            return { actor, id, to: current.email, input };
        });
        // Transport runs outside any lock; the outcome is recorded unconditionally afterwards.
        const outcome = await sendEnquiryReply(delivery!, { replyId: randomUUID(), to: prepared.to, subject: prepared.input.subject, text: prepared.input.body }, outboundFetch);
        const result = await db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id"=${prepared.id} FOR UPDATE`;
            const current = await tx.enquiry.findUniqueOrThrow({ where: { id: prepared.id }, select: { version: true } });
            await tx.enquiry.update({ where: { id: prepared.id }, data: { version: { increment: 1 } } });
            await tx.enquiryActivity.create({ data: { enquiryId: prepared.id, actorId: prepared.actor.id, version: current.version + 1, action: outcome.status === "accepted" ? "email_sent" : "email_failed", subject: prepared.input.subject, body: prepared.input.body } });
            return serializeDetail(await tx.enquiry.findUniqueOrThrow({ where: { id: prepared.id }, select: detailSelect }));
        });
        if (outcome.status !== "accepted") throw new HttpError(502, "EMAIL_SEND_FAILED", "The email provider did not accept the reply. It was recorded as failed; check activity before trying again.");
        res.json(result);
    });
    app.get("/api/admin/enquiries/:id", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const row = await tx.enquiry.findUnique({ where: { id }, select: detailSelect });
            if (!row)
                throw missing();
            return serializeDetail(row);
        });
        res.json(result);
    });
}
