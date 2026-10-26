import { randomUUID } from "node:crypto";
import type { EnquiryDelivery, PrismaClient } from "@prisma/client";
import { enquiryDeliveryResponseSchema, type EnquiryDeliveryResponse } from "@shopmaple/contracts";
import { sendEnquiryAlert, type EnquiryDeliveryConfig, type EnquiryAlert, type EnquiryDeliveryOutcome } from "./enquiry-delivery-provider.js";
type Send = (config: EnquiryDeliveryConfig, alert: EnquiryAlert) => Promise<EnquiryDeliveryOutcome>;
const retryWindowMs = 23 * 60 * 60_000;
const leaseMs = 60_000;
function windowOpen(job: EnquiryDelivery, now: Date) {
  return !job.firstAttemptAt || now.getTime() < job.firstAttemptAt.getTime() + retryWindowMs;
}
export function deliveryResponse(enquiryId: string, job: EnquiryDelivery | null, config: EnquiryDeliveryConfig | null, now = new Date()): EnquiryDeliveryResponse {
  return enquiryDeliveryResponseSchema.parse({ enquiryId, enabled: config !== null, delivery: job && {
    status: job.status, version: job.version, attempts: job.attempts,
    nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null, acceptedAt: job.acceptedAt?.toISOString() ?? null,
    errorCode: job.errorCode,
    canRetry: !!config && job.status === "retry_wait" && job.configurationHash === config.fingerprint && job.attempts < 5 && windowOpen(job, now),
  } });
}
// Claim one row at a time, keeping transactions short and transport outside the lock.
export async function processEnquiryDeliveries(db: PrismaClient, config: EnquiryDeliveryConfig, send: Send = sendEnquiryAlert, now: () => Date = () => new Date(), limit = 10): Promise<number> {
  const batch = Number.isFinite(limit) ? Math.min(25, Math.max(1, Math.floor(limit))) : 10;
  let sent = 0;
  for (let i = 0; i < batch; i++) {
    const claim = await db.$transaction(async tx => {
      const at = now();
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "EnquiryDelivery"
        WHERE (("status" IN ('queued', 'retry_wait') AND "nextAttemptAt" <= ${at.toISOString()}::timestamp)
          OR ("status" = 'sending' AND "leaseExpiresAt" <= ${at.toISOString()}::timestamp))
        ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      const job = await tx.enquiryDelivery.findUniqueOrThrow({ where: { id: rows[0].id }, include: { enquiry: { select: { id: true, kind: true, createdAt: true } } } });
      const terminal = job.configurationHash !== config.fingerprint ? "configuration_changed" : !windowOpen(job, at) ? "retry_window_expired" : job.attempts >= 5 ? "attempts_exhausted" : null;
      if (terminal) {
        await tx.enquiryDelivery.update({ where: { id: job.id }, data: { status: job.attempts ? "uncertain" : "failed", errorCode: terminal, version: { increment: 1 }, nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null } });
        return { skipped: true as const };
      }
      const token = randomUUID();
      const updated = await tx.enquiryDelivery.update({ where: { id: job.id }, data: { status: "sending", attempts: { increment: 1 }, version: { increment: 1 }, firstAttemptAt: job.firstAttemptAt ?? at, nextAttemptAt: null, leaseToken: token, leaseExpiresAt: new Date(at.getTime() + leaseMs) } });
      return { skipped: false as const, job: updated, alert: { jobId: job.id, enquiryId: job.enquiryId, kind: job.enquiry.kind as EnquiryAlert["kind"], createdAt: job.enquiry.createdAt } };
    });
    if (!claim) break;
    if (claim.skipped) continue;
    const { job, alert } = claim;
    let outcome: EnquiryDeliveryOutcome;
    try { outcome = await send(config, alert); }
    catch { outcome = { status: "uncertain", code: "network_error" }; }
    sent++;
    const at = now();
    const exhausted = job.attempts >= 5, expired = !windowOpen(job, at);
    const retry = outcome.status !== "accepted" && outcome.status !== "failed" && outcome.code !== "idempotency_conflict" && !exhausted && !expired;
    const status = outcome.status === "accepted" ? "accepted" : retry ? "retry_wait" : outcome.status === "failed" ? "failed" : "uncertain";
    const errorCode = outcome.status === "accepted" ? null : outcome.status === "failed" || outcome.code === "idempotency_conflict" ? outcome.code : expired ? "retry_window_expired" : exhausted ? "attempts_exhausted" : outcome.code;
    // Lease token AND version prevent a delayed process from finalizing another claim.
    await db.enquiryDelivery.updateMany({ where: { id: job.id, status: "sending", version: job.version, leaseToken: job.leaseToken, leaseExpiresAt: { gt: at } }, data: {
      status, errorCode, version: { increment: 1 }, leaseToken: null, leaseExpiresAt: null,
      acceptedAt: outcome.status === "accepted" ? at : null, providerId: outcome.status === "accepted" ? outcome.providerId : null,
      nextAttemptAt: retry ? new Date(at.getTime() + Math.min(3600000, 30_000 * 2 ** (job.attempts - 1))) : null,
    } });
  }
  return sent;
}
