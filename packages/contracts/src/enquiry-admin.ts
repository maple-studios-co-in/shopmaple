import { z } from "zod";
export const enquiryAdminIdSchema = z.string().regex(/^enq_[a-f0-9-]{36}$/);
export const enquiryAdminQuerySchema = z.object({
    kind: z.enum(["contact", "project", "bulk"]).optional(),
    status: z.enum(["new", "reviewed"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const enquiryReviewInputSchema = z.object({ expectedVersion: z.number().int().min(0).max(2147483646) }).strict();
export const enquiryAdminSummarySchema = z.object({
    id: enquiryAdminIdSchema,
    kind: z.enum(["contact", "project", "bulk"]),
    status: z.enum(["new", "reviewed"]),
    version: z.number().int().nonnegative(),
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
