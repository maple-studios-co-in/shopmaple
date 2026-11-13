import type { Prisma, PrismaClient } from "@prisma/client";
import type { Express, Request } from "express";
import { z } from "zod";
import { enquiryAdminIdSchema, enquiryAdminQuerySchema } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { keeriLeadSummary } from "../enquiry-delivery-worker.js";
import type { KeeriLeadsConfig } from "../keeri-leads.js";
import { requireStaff } from "./auth.js";

// Website enquiries are handled in Keeri. The store admin only lists what the forms saved and
// whether each one reached Keeri; there is no stage, assignment, note, task or reply here any more.
const detailSelect = { id: true, kind: true, name: true, email: true, phone: true, message: true, context: true, createdAt: true } as const;
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: enquiryAdminIdSchema }).strict();
export async function requireEnquiryAccess(tx: Prisma.TransactionClient, req: Request, secure: boolean, write = false) {
    const session = await requireStaff(tx, req, secure, write, false, true, "any");
    // The staff row remains locked until data reads or audit writes commit.
    const current = await tx.shopAdmin.findUniqueOrThrow({ where: { id: session.user.id } });
    if (!current.canManageEnquiries)
        throw new HttpError(403, "ENQUIRY_ACCESS_REQUIRED", "Your account does not have access to customer enquiries.");
    return session.user;
}
const missing = () => new HttpError(404, "ENQUIRY_NOT_FOUND", "This enquiry could not be found.");
const invalid = () => new HttpError(400, "INVALID_INPUT", "Check the supplied values and try again.");
const encodeCursor = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function decodeCursor(value: string) {
    try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
    catch { throw invalid(); }
}

export function registerEnquiryAdminRoutes(app: Express, db: PrismaClient, secure: boolean, keeri: KeeriLeadsConfig | null = null) {
    const keeriLeadsUrl = keeri ? `${keeri.adminOrigin}/leads` : null;
    app.get("/api/admin/enquiries", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            const query = enquiryAdminQuerySchema.parse(req.query);
            const cursor = query.cursor ? decodeCursor(query.cursor) : null;
            const after = cursor && new Date(cursor.createdAt);
            const rows = await tx.enquiry.findMany({
                where: { ...(query.kind ? { kind: query.kind } : {}), ...(after ? { OR: [{ createdAt: { lt: after } }, { createdAt: after, id: { lt: cursor.id } }] } : {}) },
                select: { id: true, kind: true, createdAt: true, deliveries: { where: { target: "keeri" }, select: { status: true, keeriOutcome: true, keeriLeadPath: true } } },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1,
            });
            const items = rows.slice(0, query.limit).map(({ deliveries, ...row }) => ({ ...row, keeri: deliveries[0] ? keeriLeadSummary(deliveries[0], keeri) : null }));
            const last = items.at(-1);
            return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null, keeriLeadsUrl };
        });
        res.json(result);
    });
    app.get("/api/admin/enquiries/:id", async (req, res) => {
        const result = await db.$transaction(async (tx) => {
            await requireEnquiryAccess(tx, req, secure);
            // Anything that is not an enquiry reference is simply not here, including the retired CRM paths.
            const id = enquiryAdminIdSchema.safeParse(req.params.id);
            const row = id.success ? await tx.enquiry.findUnique({ where: { id: id.data }, select: detailSelect }) : null;
            if (!row)
                throw missing();
            return row;
        });
        res.json(result);
    });
}
