import { z } from "zod";
/** Pipeline stages in display order. Legacy `reviewed` rows were migrated to `contacted`. */
export const enquiryStages = ["new", "contacted", "quoted", "won", "lost"] as const;
export const enquiryStageSchema = z.enum(enquiryStages);
export type EnquiryStage = z.infer<typeof enquiryStageSchema>;
export const enquiryStageLabels: Record<EnquiryStage, string> = {
    new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost",
};
export const contactIdSchema = z.string().regex(/^ct_[a-f0-9-]{36}$/);
/** A real calendar date in YYYY-MM-DD form; 2026-02-31 is rejected. */
export const isoDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine(value => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Not a calendar date");
// Control characters (C0 and C1) and Unicode bidirectional overrides and isolates never belong in staff-entered text:
// the overrides can disguise what a subject or name reads as, and CR/LF would inject mail headers.
const forbiddenAnywhere = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
/** One line of plain text: no control characters at all, including tab, CR and LF. */
export const singleLineText = (max: number) => z.string().max(max).refine(value => !forbiddenAnywhere.test(value) && !/[\t\r\n]/.test(value), "Control characters are not allowed").trim();
/** Plain text that may contain ordinary newlines and tabs, but no CR, other controls or bidi overrides. */
export const multiLineText = (max: number) => z.string().max(max).refine(value => !forbiddenAnywhere.test(value) && !/\r/.test(value), "Control characters are not allowed").trim();
export const enquiryAdminIdSchema = z.string().regex(/^enq_[a-f0-9-]{36}$/);
export const enquiryAdminQuerySchema = z.object({
    kind: z.enum(["contact", "project", "bulk"]).optional(),
    status: enquiryStageSchema.optional(),
    assignment: z.enum(["mine", "unassigned"]).optional(),
    assigneeId: z.string().regex(/^c[a-z0-9]{24}$/).optional(),
    /** Inclusive calendar bounds on creation date, as Asia/Kolkata days (the store's timezone). */
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
/**
 * POST body for the searchable list. Free text can contain a customer's email or phone, so it never
 * travels in a URL; the same filters as the GET list are accepted here.
 */
export const enquirySearchInputSchema = enquiryAdminQuerySchema.omit({ limit: true }).extend({
    /** Matches name, email, phone, product and SKU text, case-insensitively; wildcards are literal. */
    q: singleLineText(100).optional(),
    limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const enquiryReviewInputSchema = z.object({ expectedVersion: z.number().int().min(0).max(2147483646) }).strict();
export const enquiryAdminSummarySchema = z.object({
    id: enquiryAdminIdSchema,
    kind: z.enum(["contact", "project", "bulk"]),
    status: enquiryStageSchema,
    version: z.number().int().nonnegative(),
    assignedToId: z.string().max(100).nullable().default(null),
    contactId: contactIdSchema.nullable().default(null),
    name: z.string().max(100),
    product: z.string().max(500),
    /** Due date of the earliest open follow-up on this enquiry, if any. */
    nextDueOn: isoDateSchema.nullable().default(null),
    createdAt: z.iso.datetime(),
}).strict();
export const enquiryAdminListSchema = z.object({ items: z.array(enquiryAdminSummarySchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();
export const enquiryAdminDetailSchema = enquiryAdminSummarySchema.extend({
    email: z.email().max(254), phone: z.string().max(30), message: z.string().max(5000),
    lostReason: z.string().max(500).nullable().default(null),
    context: z.object({ product: z.string().max(500), variant: z.string().max(300), sku: z.string().max(160), pincode: z.string().max(6) }).strict(),
    reviews: z.array(z.object({ id: z.string().max(100), actorId: z.string().max(100), version: z.number().int().positive(), action: z.literal("reviewed"), createdAt: z.iso.datetime() }).strict()).max(1),
}).strict();
export type EnquiryAdminSummary = z.infer<typeof enquiryAdminSummarySchema>;
export type EnquiryAdminDetail = z.infer<typeof enquiryAdminDetailSchema>;

export const enquiryStaffIdSchema = z.string().regex(/^c[a-z0-9]{24}$/);
export const enquiryPageQuerySchema = enquiryAdminQuerySchema.pick({ limit: true, cursor: true });
export const enquiryAssignmentInputSchema = enquiryReviewInputSchema.extend({ assigneeId: enquiryStaffIdSchema.nullable() });
export const enquiryNoteInputSchema = enquiryReviewInputSchema.extend({
    body: z.string().max(2000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]*$/).trim().min(1),
});
export const enquiryAssigneeSchema = z.object({ id: enquiryStaffIdSchema, email: z.email().max(254) }).strict();
export const enquiryAssigneeListSchema = z.object({ items: z.array(enquiryAssigneeSchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();
export const enquiryActivityActions = ["assigned", "unassigned", "note", "status_changed", "task_created", "task_completed", "task_reopened", "email_sending", "email_sent", "email_failed"] as const;
export const enquiryActivitySchema = z.object({
    id: z.string().max(100), action: z.enum(enquiryActivityActions), version: z.number().int().positive(),
    actorId: enquiryStaffIdSchema, createdAt: z.iso.datetime(), assigneeId: enquiryStaffIdSchema.nullable(), body: z.string().max(5000).nullable(),
    stage: enquiryStageSchema.nullable().default(null), taskId: z.string().max(100).nullable().default(null), subject: z.string().max(150).nullable().default(null),
}).strict();
export const enquiryActivityListSchema = z.object({ items: z.array(enquiryActivitySchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();
export type EnquiryAssignee = z.infer<typeof enquiryAssigneeSchema>;
export type EnquiryActivity = z.infer<typeof enquiryActivitySchema>;
