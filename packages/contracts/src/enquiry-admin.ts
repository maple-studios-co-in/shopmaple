import { z } from "zod";
export const enquiryAdminIdSchema = z.string().regex(/^enq_[a-f0-9-]{36}$/);
export const enquiryAdminQuerySchema = z.object({
    kind: z.enum(["contact", "project", "bulk"]).optional(),
    status: z.enum(["new", "reviewed"]).optional(),
    assignment: z.enum(["mine", "unassigned"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const enquiryReviewInputSchema = z.object({ expectedVersion: z.number().int().min(0).max(2147483646) }).strict();
export const enquiryAdminSummarySchema = z.object({
    id: enquiryAdminIdSchema,
    kind: z.enum(["contact", "project", "bulk"]),
    status: z.enum(["new", "reviewed"]),
    version: z.number().int().nonnegative(),
    assignedToId: z.string().max(100).nullable().default(null),
    createdAt: z.iso.datetime(),
}).strict();
export const enquiryAdminListSchema = z.object({ items: z.array(enquiryAdminSummarySchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();
export const enquiryAdminDetailSchema = enquiryAdminSummarySchema.extend({
    name: z.string().max(100), email: z.email().max(254), phone: z.string().max(30), message: z.string().max(5000),
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
export const enquiryActivitySchema = z.object({
    id: z.string().max(100), action: z.enum(["assigned", "unassigned", "note"]), version: z.number().int().positive(),
    actorId: enquiryStaffIdSchema, createdAt: z.iso.datetime(), assigneeId: enquiryStaffIdSchema.nullable(), body: z.string().max(2000).nullable(),
}).strict();
export const enquiryActivityListSchema = z.object({ items: z.array(enquiryActivitySchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();
export type EnquiryAssignee = z.infer<typeof enquiryAssigneeSchema>;
export type EnquiryActivity = z.infer<typeof enquiryActivitySchema>;
