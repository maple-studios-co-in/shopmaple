import { z } from "zod";
import { enquiryAdminIdSchema } from "./enquiry-admin";
export const enquiryDeliveryRetryInputSchema = z.object({ expectedVersion: z.number().int().nonnegative().max(2147483646) }).strict();
export const enquiryDeliveryResponseSchema = z.object({
  enquiryId: enquiryAdminIdSchema,
  enabled: z.boolean(),
  delivery: z.object({
    status: z.enum(["queued", "sending", "retry_wait", "accepted", "failed", "uncertain"]),
    version: z.number().int().nonnegative(),
    attempts: z.number().int().min(0).max(5),
    nextAttemptAt: z.iso.datetime().nullable(),
    acceptedAt: z.iso.datetime().nullable(),
    errorCode: z.enum(["rate_limited", "provider_busy", "provider_unavailable", "network_error", "invalid_response", "provider_rejected", "configuration_error", "idempotency_conflict", "configuration_changed", "retry_window_expired", "attempts_exhausted"]).nullable(),
    canRetry: z.boolean(),
  }).strict().nullable(),
}).strict();
export type EnquiryDeliveryResponse = z.infer<typeof enquiryDeliveryResponseSchema>;
