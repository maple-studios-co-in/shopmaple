import { z } from "zod";
// Website enquiries are handled in Keeri (leads, replies, follow-ups). The store admin keeps a
// read-only list of what the forms saved and whether each one reached Keeri.
export const enquiryAdminIdSchema = z.string().regex(/^enq_[a-f0-9-]{36}$/);
/** What the inbox holds: enquiries from the store's forms, newsletter signups, and reviews Keeri could not take. */
export const enquiryKinds = ["contact", "project", "bulk", "newsletter", "review"] as const;
/** What staff see of a lead: still being sent, a new Keeri lead, an existing one Keeri matched, or stopped. */
export const keeriLeadStates = ["pending", "created", "matched", "failed"] as const;
/** A lead in the Keeri admin: an HTTPS origin and a lead path only. */
export const keeriLeadUrlSchema = z.string().max(600).regex(/^https:\/\/[a-z0-9.-]{1,253}(?::[0-9]{1,5})?\/leads\/[A-Za-z0-9_:-]{1,200}$/);
export const enquiryAdminQuerySchema = z.object({
    kind: z.enum(enquiryKinds).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
/** A list row: reference, kind, time and the Keeri lead. Never the customer's name, email, phone or message. */
export const enquiryAdminSummarySchema = z.object({
    id: enquiryAdminIdSchema,
    kind: z.enum(enquiryKinds),
    createdAt: z.iso.datetime(),
    /** Null when the enquiry has no lead row: newsletter signups, reviews, or saved while Keeri leads were off. */
    keeri: z.object({ state: z.enum(keeriLeadStates), leadUrl: keeriLeadUrlSchema.nullable() }).strict().nullable(),
}).strict();
export const enquiryAdminListSchema = z.object({
    items: z.array(enquiryAdminSummarySchema).max(50),
    nextCursor: z.string().max(300).nullable(),
    /** `{KEERI_ADMIN_ORIGIN}/leads` while Keeri leads are enabled. */
    keeriLeadsUrl: z.string().max(300).regex(/^https:\/\/[a-z0-9.-]{1,253}(?::[0-9]{1,5})?\/leads$/).nullable(),
}).strict();
export const enquiryAdminDetailSchema = z.object({
    id: enquiryAdminIdSchema,
    kind: z.enum(enquiryKinds),
    name: z.string().max(100),
    email: z.email().max(254),
    phone: z.string().max(30),
    message: z.string().max(5000),
    context: z.object({ product: z.string().max(500), variant: z.string().max(300), sku: z.string().max(160), pincode: z.string().max(6) }).strict(),
    createdAt: z.iso.datetime(),
}).strict();
export type EnquiryAdminSummary = z.infer<typeof enquiryAdminSummarySchema>;
export type EnquiryAdminDetail = z.infer<typeof enquiryAdminDetailSchema>;
