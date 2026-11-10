import { z } from "zod";
import { enquiryAdminIdSchema } from "./enquiry-admin";
/** Which outbox row a staff retry is for; the staff email unless it names the Keeri lead. */
export const enquiryDeliveryTargets = ["email", "keeri"] as const;
export const enquiryDeliveryRetryInputSchema = z.object({
  expectedVersion: z.number().int().nonnegative().max(2147483646),
  target: z.enum(enquiryDeliveryTargets).default("email"),
}).strict();
const deliveryStatusSchema = z.enum(["queued", "sending", "retry_wait", "accepted", "failed", "uncertain"]);
const deliveryErrorCodeSchema = z.enum(["rate_limited", "provider_busy", "provider_unavailable", "network_error", "invalid_response", "provider_rejected", "configuration_error", "idempotency_conflict", "configuration_changed", "retry_window_expired", "attempts_exhausted"]);
/** What staff see of a lead: still being sent, a new Keeri lead, an existing one Keeri matched, or stopped. */
export const keeriLeadStates = ["pending", "created", "matched", "failed"] as const;
export const enquiryDeliveryResponseSchema = z.object({
  enquiryId: enquiryAdminIdSchema,
  enabled: z.boolean(),
  delivery: z.object({
    status: deliveryStatusSchema,
    version: z.number().int().nonnegative(),
    attempts: z.number().int().min(0).max(5),
    nextAttemptAt: z.iso.datetime().nullable(),
    acceptedAt: z.iso.datetime().nullable(),
    errorCode: deliveryErrorCodeSchema.nullable(),
    canRetry: z.boolean(),
  }).strict().nullable(),
  /** Present only while Keeri leads are enabled or this enquiry has a lead row. */
  keeri: z.object({
    enabled: z.boolean(),
    delivery: z.object({
      state: z.enum(keeriLeadStates),
      status: deliveryStatusSchema,
      version: z.number().int().nonnegative(),
      attempts: z.number().int().min(0).max(5),
      nextAttemptAt: z.iso.datetime().nullable(),
      acceptedAt: z.iso.datetime().nullable(),
      errorCode: deliveryErrorCodeSchema.nullable(),
      canRetry: z.boolean(),
      /** The lead in the Keeri admin, once Keeri has it. */
      leadUrl: z.string().max(600).regex(/^https:\/\/[a-z0-9.-]{1,253}(?::[0-9]{1,5})?\/leads\/[A-Za-z0-9_:-]{1,200}$/).nullable(),
    }).strict().nullable(),
  }).strict().optional(),
}).strict();
export type EnquiryDeliveryResponse = z.infer<typeof enquiryDeliveryResponseSchema>;
export type EnquiryDeliveryTarget = (typeof enquiryDeliveryTargets)[number];
