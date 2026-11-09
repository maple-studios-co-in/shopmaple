import { z } from "zod";

/**
 * A review written on the product page ("Make yourself heard", Figma 180:566). Kept out of the package's main entry so the
 * homepage's first JavaScript does not carry it. The limits are those of Keeri's own review (see productReviewSchema), so
 * what is accepted here can also be shown there.
 */
export const reviewPhotoLimit = 5;
// Controls and direction overrides, which no review needs. Ordinary newlines and tabs stay allowed in the body.
const forbidden = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;
const line = (max: number) => z.string().trim().min(1).max(max).refine((value) => !forbidden.test(value) && !/[\t\n]/.test(value));
const paragraphs = (max: number) => z.string().trim().min(1).max(max).refine((value) => !forbidden.test(value));

export const reviewSubmissionSchema = z.object({
  handle: z.string().min(1).max(200),
  /** The finish the customer was looking at, when the piece has any. */
  variantId: z.string().min(1).max(160).optional(),
  rating: z.number().int().min(1).max(5),
  title: line(120),
  body: paragraphs(2000),
  displayName: line(60),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  /** Each photo as base64, already made small by the browser; the request as a whole has its own limit. */
  photos: z.array(z.string().max(2_600_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)).max(reviewPhotoLimit).default([]),
}).strict();
export type ReviewSubmission = z.input<typeof reviewSubmissionSchema>;
