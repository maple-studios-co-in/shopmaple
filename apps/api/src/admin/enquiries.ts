import { Prisma, type PrismaClient } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { enquiryAdminIdSchema, enquiryAdminQuerySchema, enquiryAssignmentInputSchema, enquiryNoteInputSchema, enquiryPageQuerySchema, enquirySearchInputSchema, enquiryStaffIdSchema, enquiryStageInputSchema, enquiryReplyInputSchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { sendEnquiryReply, type EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import { requireStaff } from "./auth.js";
const detailSelect = { id: true, kind: true, status: true, version: true, assignedToId: true, contactId: true, name: true, createdAt: true, email: true, phone: true, message: true, context: true, lostReason: true,
    reviews: { select: { id: true, actorId: true, version: true, action: true, createdAt: true }, orderBy: { version: "asc" as const } },
} as const;
type DetailRow = Prisma.EnquiryGetPayload<{ select: typeof detailSelect }>;
const productOf = (context: unknown) => typeof context === "object" && context !== null && typeof (context as { product?: unknown }).product === "string" ? (context as { product: string }).product : "";
const dateOnly = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;
type SummaryRow = { id: string; kind: string; status: string; version: number; assignedToId: string | null; contactId: string | null; name: string; context: unknown; nextDueOn: Date | null; createdAt: Date };
/** Shared summary shape for lists, boards and contact pages: metadata, name, product and next follow-up. Never email, phone or message. */
export function serializeEnquirySummary(row: SummaryRow) {
    return { id: row.id, kind: row.kind, status: row.status, version: row.version, assignedToId: row.assignedToId, contactId: row.contactId, name: row.name, product: productOf(row.context), nextDueOn: dateOnly(row.nextDueOn), createdAt: row.createdAt };
}
async function nextDueOn(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.followUpTask.findFirst({ where: { enquiryId: id, done: false }, orderBy: { dueOn: "asc" }, select: { dueOn: true } });
    return row?.dueOn ?? null;
}
async function serializeDetail(tx: Prisma.TransactionClient, row: DetailRow) {
    const { reviews, ...rest } = row;
    return { ...rest, product: productOf(row.context), nextDueOn: dateOnly(await nextDueOn(tx, row.id)), reviews };
}
const detail = async (tx: Prisma.TransactionClient, id: string) => serializeDetail(tx, await tx.enquiry.findUniqueOrThrow({ where: { id }, select: detailSelect }));
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: enquiryAdminIdSchema }).strict();
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
/** The store runs on Asia/Kolkata time: calendar-day bounds are converted to the UTC instants stored in TIMESTAMP columns. */
export const storeTimezoneOffset = "+05:30";
export const kolkataDayStart = (day: string) => new Date(`${day}T00:00:00${storeTimezoneOffset}`);
export const kolkataDayAfter = (day: string) => new Date(kolkataDayStart(day).getTime() + 86_400_000);
const storedTimestamp = (value: Date) => Prisma.sql`${value.toISOString()}::timestamp`;

type ListQuery = z.infer<typeof enquirySearchInputSchema> & { contactId?: string };
/** One list implementation for the GET list, the POST search and the contact page; summary rows only. */
export async function listEnquiries(tx: Prisma.TransactionClient, actorId: string, query: ListQuery) {
    const cursor = query.cursor ? decodePageCursor(query.cursor, cursorSchema) : null;
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.assignment) conditions.push(query.assignment === "mine" ? Prisma.sql`e."assignedToId" = ${actorId}` : Prisma.sql`e."assignedToId" IS NULL`);
    if (query.assigneeId) conditions.push(Prisma.sql`e."assignedToId" = ${query.assigneeId}`);
    if (query.contactId) conditions.push(Prisma.sql`e."contactId" = ${query.contactId}`);
    if (query.kind) conditions.push(Prisma.sql`e."kind" = ${query.kind}`);
    if (query.status) conditions.push(Prisma.sql`e."status" = ${query.status}`);
    if (query.from) conditions.push(Prisma.sql`e."createdAt" >= ${storedTimestamp(kolkataDayStart(query.from))}`);
    if (query.to) conditions.push(Prisma.sql`e."createdAt" < ${storedTimestamp(kolkataDayAfter(query.to))}`);
    if (query.q) {
        const pattern = likePattern(query.q);
        conditions.push(Prisma.sql`(e."name" ILIKE ${pattern} ESCAPE '\\' OR e."email" ILIKE ${pattern} ESCAPE '\\' OR e."phone" ILIKE ${pattern} ESCAPE '\\' OR e."context"->>'product' ILIKE ${pattern} ESCAPE '\\' OR e."context"->>'sku' ILIKE ${pattern} ESCAPE '\\')`);
    }
    // Columns are TIMESTAMP(3) without zone: bind the cursor as an ISO string cast to timestamp, never as a Date (timestamptz).
    if (cursor) conditions.push(Prisma.sql`(e."createdAt" < ${cursor.createdAt}::timestamp OR (e."createdAt" = ${cursor.createdAt}::timestamp AND e."id" < ${cursor.id}))`);
    const rows = await tx.$queryRaw<SummaryRow[]>`
        SELECT e."id", e."kind", e."status", e."version", e."assignedToId", e."contactId", e."name", e."context", e."createdAt",
               (SELECT min(t."dueOn") FROM "FollowUpTask" t WHERE t."enquiryId" = e."id" AND NOT t."done") AS "nextDueOn"
        FROM "Enquiry" e WHERE ${Prisma.join(conditions, " AND ")} ORDER BY e."createdAt" DESC, e."id" DESC LIMIT ${query.limit + 1}`;
    const items = rows.slice(0, query.limit).map(serializeEnquirySummary), last = items.at(-1);
    return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null };
}

/**
 * Fixed-window limit on accepted sends per staff member; process-local by design. A slot is reserved
 * before the send and released if the send does not become an accepted email, so parallel replies
 * across enquiries can never exceed the limit.
 */
export class ActorRateLimit {
    private readonly hits = new Map<string, number[]>();
    constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) { }
    private recent(actorId: string, at: number) {
        const kept = (this.hits.get(actorId) ?? []).filter(stamp => stamp > at - this.windowMs);
        this.hits.set(actorId, kept);
        return kept;
    }
    /** Atomically take a slot; false when the actor is at the limit. */
    reserve(actorId: string) {
        const at = this.now(), kept = this.recent(actorId, at);
        if (kept.length >= this.limit) return false;
        kept.push(at);
        return true;
    }
    /** Give back the most recent reservation (a send that was refused or failed). */
    release(actorId: string) { this.recent(actorId, this.now()).pop(); }
}

type ReplyIntent = { id: string; activityId: string };
/**
 * Record the provider outcome on the intent row and return the fresh detail. If that transaction
 * fails, a last-resort single-row update still flips the row off `email_sending`, and the request
 * fails so the client reloads rather than trusting a detail we could not read.
 */
export async function recordReplyOutcome(db: PrismaClient, intent: ReplyIntent, accepted: boolean) {
    const action = accepted ? "email_sent" : "email_failed";
    try {
        return await db.$transaction(async (tx) => {
            await tx.enquiryActivity.update({ where: { id: intent.activityId }, data: { action } });
            return detail(tx, intent.id);
        });
    } catch {
        try { await db.enquiryActivity.updateMany({ where: { id: intent.activityId, action: "email_sending" }, data: { action } }); }
        catch { /* the row may stay at email_sending; docs/admin-crm.md explains how to find and resolve it */ }
        throw new HttpError(500, "REPLY_OUTCOME_UNRECORDED", `The reply was ${accepted ? "accepted by the provider" : "refused by the provider"} but its outcome could not be recorded. Reload the enquiry and check activity before sending again.`);
    }
}

export function registerEnquiryAdminRoutes(app: Express, db: PrismaClient, secure: boolean, delivery: EnquiryDeliveryConfig | null = null, outboundFetch: typeof fetch = fetch, replyRateLimit: { limit: number; windowMs: number } = { limit: 20, windowMs: 60 * 60_000 }) {
    const replyLimit = new ActorRateLimit(replyRateLimit.limit, replyRateLimit.windowMs);
    app.get("/api/admin/enquiries", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure);
            return listEnquiries(tx, actor.id, enquiryAdminQuerySchema.parse(req.query));
        });
        res.json(result);
    });
    // Search text may contain a customer's email or phone, so it is posted in the body and never appears in a URL.
    app.post("/api/admin/enquiries/search", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            const actor = await requireEnquiryAccess(tx, req, secure, true);
            return listEnquiries(tx, actor.id, enquirySearchInputSchema.parse(req.body));
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
            if (current.assignedToId === assigneeId) return detail(tx, id);
            await advanceVersion(tx, id, expectedVersion, { assignedToId: assigneeId });
            await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, assigneeId, version: expectedVersion + 1, action: assigneeId === null ? "unassigned" : "assigned" } });
            return detail(tx, id);
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
            return detail(tx, id);
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
            if (current.status === stage && current.lostReason === lostReason) return detail(tx, id);
            const updated = await tx.enquiry.updateMany({ where: { id, version: expectedVersion }, data: { status: stage, lostReason, version: { increment: 1 } } });
            if (updated.count !== 1) throw conflict();
            await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, version: expectedVersion + 1, action: "status_changed", stage, body: lostReason } });
            return detail(tx, id);
        });
        res.json(result);
    });
    app.post("/api/admin/enquiries/:id/reply", async (req, res) => {
        // One transaction consumes the expected version, reserves the actor's rate-limit slot and records
        // the intent to send, so two requests with the same expectedVersion yield exactly one send and one
        // 409, and parallel replies across enquiries cannot exceed the limit. The provider idempotency key
        // is the enquiry plus the version consumed, so a retry of the same intent cannot double-send.
        let reservedFor: string | null = null;
        let intent: ReplyIntent & { actor: { id: string }; to: string; input: { subject: string; body: string }; version: number };
        try {
            intent = await db.$transaction(async (tx) => {
                const actor = await requireEnquiryAccess(tx, req, secure, true);
                const id = enquiryAdminIdSchema.parse(req.params.id);
                const input = enquiryReplyInputSchema.parse(req.body);
                if (!delivery) throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "Email replies are not configured on this server. Contact the customer another way.");
                await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id"=${id} FOR UPDATE`;
                const current = await tx.enquiry.findUnique({ where: { id }, select: { version: true, email: true } });
                if (!current) throw missing();
                if (current.version !== input.expectedVersion) throw conflict();
                if (!replyLimit.reserve(actor.id)) throw new HttpError(429, "REPLY_RATE_LIMITED", "You have sent many replies recently. Wait before sending more.");
                reservedFor = actor.id;
                const version = input.expectedVersion + 1;
                await tx.enquiry.update({ where: { id }, data: { version } });
                const activity = await tx.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, version, action: "email_sending", subject: input.subject, body: input.body }, select: { id: true } });
                return { actor, id, to: current.email, input, version, activityId: activity.id };
            });
        } catch (error) {
            if (reservedFor) replyLimit.release(reservedFor);
            throw error;
        }
        // Transport runs outside any lock; the outcome is recorded on the intent row afterwards.
        const outcome = await sendEnquiryReply(delivery!, { replyId: `${intent.id}/${intent.version}`, to: intent.to, subject: intent.input.subject, text: intent.input.body }, outboundFetch);
        const accepted = outcome.status === "accepted";
        if (!accepted) replyLimit.release(intent.actor.id);
        const result = await recordReplyOutcome(db, intent, accepted);
        if (!accepted) throw new HttpError(502, "EMAIL_SEND_FAILED", "The email provider did not accept the reply. It was recorded as failed; check activity before trying again.");
        res.json(result);
    });
    app.get("/api/admin/enquiries/:id", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const id = enquiryAdminIdSchema.parse(req.params.id);
            const row = await tx.enquiry.findUnique({ where: { id }, select: detailSelect });
            if (!row)
                throw missing();
            return serializeDetail(tx, row);
        });
        res.json(result);
    });
}
