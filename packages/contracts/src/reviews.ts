import { z } from "zod";

/**
 * Verified buyer reviews. A buyer reaches the form only through the single-use link emailed for one
 * order line after delivery; staff approve or reject each review, and the store shows approved ones only.
 */
const plain = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((v) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v), "Use plain text.");
const oneLine = (min: number, max: number) => plain(min, max).refine((v) => !/[\r\n]/.test(v), "Use one line.");

export const reviewStatuses = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];
export const reviewIdSchema = z.string().regex(/^rev_[a-f0-9-]{36}$/);
export const reviewInvitationIdSchema = z.string().regex(/^rvi_[a-f0-9-]{36}$/);
/** `rvi_<uuid>.<HMAC-SHA256 base64url>`: names one invitation and proves the store issued it. */
export const reviewTokenSchema = z.string().regex(/^rvi_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);

export const reviewInputSchema = z.object({
  token: reviewTokenSchema,
  rating: z.number().int().min(1).max(5),
  title: oneLine(2, 120),
  body: plain(10, 2000),
  displayName: oneLine(2, 60),
  city: z.union([z.literal(""), oneLine(2, 60)]).default(""),
}).strict();
export type ReviewInput = z.input<typeof reviewInputSchema>;

/** What the review form shows about the piece being reviewed; nothing about the order or buyer. */
export const reviewInvitationSchema = z.object({
  productTitle: z.string().min(1).max(500),
  variantTitle: z.string().max(300),
  productHandle: z.string().max(200).nullable(),
}).strict();
export type ReviewInvitation = z.infer<typeof reviewInvitationSchema>;
export const reviewReceiptSchema = z.object({ status: z.literal("pending") }).strict();

export const publicReviewSchema = z.object({
  id: reviewIdSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  displayName: z.string(),
  city: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
}).strict();
export type PublicReview = z.infer<typeof publicReviewSchema>;
/** A product's approved reviews: the average to one decimal over every approved review, and the newest few. */
export const productReviewsSchema = z.object({
  average: z.number().min(1).max(5).nullable(),
  count: z.number().int().min(0),
  reviews: z.array(publicReviewSchema).max(50),
}).strict();
export type ProductReviews = z.infer<typeof productReviewsSchema>;

export const reviewAuditEntrySchema = z.object({
  action: z.enum(["approved", "rejected"]),
  actorEmail: z.string(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
}).strict();
export const adminReviewSchema = z.object({
  id: reviewIdSchema,
  status: z.enum(reviewStatuses),
  version: z.number().int().min(0),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  displayName: z.string(),
  city: z.string().nullable(),
  productTitle: z.string(),
  variantTitle: z.string(),
  productHandle: z.string(),
  orderReference: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  audit: z.array(reviewAuditEntrySchema),
}).strict();
export type AdminReview = z.infer<typeof adminReviewSchema>;
export const adminReviewListSchema = z.object({ items: z.array(adminReviewSchema), nextCursor: z.string().nullable() }).strict();
export const reviewModerationInputSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  expectedVersion: z.number().int().min(0).max(2147483647),
  note: z.union([z.literal(""), oneLine(1, 300)]).default(""),
}).strict();

export const reviewEmailStates = ["pending", "processing", "sent", "failed", "disabled"] as const;
export const reviewOrderSchema = z.object({
  attemptId: z.string(),
  orderReference: z.string(),
  customerName: z.string(),
  placedAt: z.iso.datetime({ offset: true }),
  lines: z.array(z.object({ title: z.string(), variantTitle: z.string(), reviewed: z.boolean() }).strict()),
  delivery: z.object({
    deliveredAt: z.iso.datetime({ offset: true }),
    source: z.enum(["staff", "keeri"]),
    email: z.enum(reviewEmailStates),
  }).strict().nullable(),
}).strict();
export type ReviewOrder = z.infer<typeof reviewOrderSchema>;
export const reviewOrderListSchema = z.object({ items: z.array(reviewOrderSchema), nextCursor: z.string().nullable() }).strict();

/** The body Keeri signs when it reports a delivered order (see docs/reviews.md). */
export const keeriDeliveryEventSchema = z.object({
  event: z.literal("order.delivered"),
  externalOrderId: z.string().min(1).max(200),
  deliveredAt: z.iso.datetime({ offset: true }),
}).strict();
