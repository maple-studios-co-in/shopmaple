import { randomUUID } from "node:crypto";
import { Prisma, type EnquiryDelivery, type PrismaClient } from "@prisma/client";
import { enquiryDeliveryResponseSchema, type EnquiryDeliveryResponse } from "@shopmaple/contracts/enquiry-delivery";
import { sendEnquiryAlert, type EnquiryDeliveryConfig, type EnquiryAlert, type EnquiryDeliveryOutcome } from "./enquiry-delivery-provider.js";
import { isKeeriLeadKind, sendKeeriLead, type KeeriLead, type KeeriLeadOutcome, type KeeriLeadsConfig } from "./keeri-leads.js";
type Send = (config: EnquiryDeliveryConfig, alert: EnquiryAlert) => Promise<EnquiryDeliveryOutcome>;
type SendLead = (config: KeeriLeadsConfig, lead: KeeriLead) => Promise<KeeriLeadOutcome>;
export type DeliveryTarget = "email" | "keeri";
const retryWindowMs = 23 * 60 * 60_000;
const leaseMs = 60_000;
/** How long a staff email waits for Keeri's first attempt before it goes with the store admin link. */
export const keeriFirstAttemptHoldMs = 2 * 60_000;
function windowOpen(job: EnquiryDelivery, now: Date) {
  return !job.firstAttemptAt || now.getTime() < job.firstAttemptAt.getTime() + retryWindowMs;
}
const canRetry = (job: EnquiryDelivery, fingerprint: string | undefined, now: Date) =>
  !!fingerprint && job.status === "retry_wait" && job.configurationHash === fingerprint && job.attempts < 5 && windowOpen(job, now);
const iso = (value: Date | null) => value?.toISOString() ?? null;
const keeriState = (job: EnquiryDelivery) =>
  job.status === "accepted" ? (job.keeriOutcome === "matched" ? "matched" : "created") : job.status === "failed" || job.status === "uncertain" ? "failed" : "pending";
/**
 * The staff view of one enquiry's outbox. The Keeri section appears only when leads are enabled or
 * this enquiry has a lead row, so a store without Keeri leads answers exactly as before.
 */
export function deliveryResponse(enquiryId: string, job: EnquiryDelivery | null, config: EnquiryDeliveryConfig | null, now = new Date(), keeri?: { job: EnquiryDelivery | null; config: KeeriLeadsConfig | null }): EnquiryDeliveryResponse {
  const lead = keeri?.job ?? null;
  return enquiryDeliveryResponseSchema.parse({ enquiryId, enabled: config !== null, delivery: job && {
    status: job.status, version: job.version, attempts: job.attempts,
    nextAttemptAt: iso(job.nextAttemptAt), acceptedAt: iso(job.acceptedAt),
    errorCode: job.errorCode,
    canRetry: canRetry(job, config?.fingerprint, now),
  }, ...(keeri && (keeri.config || lead) ? { keeri: { enabled: keeri.config !== null, delivery: lead && {
    state: keeriState(lead), status: lead.status, version: lead.version, attempts: lead.attempts,
    nextAttemptAt: iso(lead.nextAttemptAt), acceptedAt: iso(lead.acceptedAt), errorCode: lead.errorCode,
    canRetry: canRetry(lead, keeri.config?.fingerprint, now),
    leadUrl: keeri.config && lead.status === "accepted" && lead.keeriLeadPath ? keeri.config.adminOrigin + lead.keeriLeadPath : null,
  } } } : {}) });
}

type Outcome = EnquiryDeliveryOutcome | KeeriLeadOutcome;
type Claimed = Prisma.EnquiryDeliveryGetPayload<{ include: { enquiry: true } }>;
/**
 * One outbox for every target: claim a due row of this target, attempt it outside the lock, then
 * finalize under the claim's lease. `prepare` runs inside the claim and does no I/O beyond the DB.
 */
async function drain<P>(
  db: PrismaClient, target: DeliveryTarget, fingerprint: string,
  prepare: (tx: Prisma.TransactionClient, job: Claimed, at: Date) => Promise<P>, attempt: (prepared: P) => Promise<Outcome>,
  now: () => Date, limit: number, hold: (at: Date) => Prisma.Sql = () => Prisma.empty,
): Promise<number> {
  const batch = Number.isFinite(limit) ? Math.min(25, Math.max(1, Math.floor(limit))) : 10;
  let sent = 0;
  for (let i = 0; i < batch; i++) {
    const claim = await db.$transaction(async tx => {
      const at = now();
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT d."id" FROM "EnquiryDelivery" d
        WHERE d."target" = ${target}
          AND ((d."status" IN ('queued', 'retry_wait') AND d."nextAttemptAt" <= ${at.toISOString()}::timestamp)
            OR (d."status" = 'sending' AND d."leaseExpiresAt" <= ${at.toISOString()}::timestamp))
          ${hold(at)}
        ORDER BY d."createdAt", d."id" FOR UPDATE OF d SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      const job = await tx.enquiryDelivery.findUniqueOrThrow({ where: { id: rows[0].id }, include: { enquiry: true } });
      const terminal = job.configurationHash !== fingerprint ? "configuration_changed" : !windowOpen(job, at) ? "retry_window_expired" : job.attempts >= 5 ? "attempts_exhausted" : null;
      if (terminal) {
        await tx.enquiryDelivery.update({ where: { id: job.id }, data: { status: job.attempts ? "uncertain" : "failed", errorCode: terminal, version: { increment: 1 }, nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null } });
        return { skipped: true as const };
      }
      const prepared = await prepare(tx, job, at);
      const token = randomUUID();
      const updated = await tx.enquiryDelivery.update({ where: { id: job.id }, data: { status: "sending", attempts: { increment: 1 }, version: { increment: 1 }, firstAttemptAt: job.firstAttemptAt ?? at, nextAttemptAt: null, leaseToken: token, leaseExpiresAt: new Date(at.getTime() + leaseMs) } });
      return { skipped: false as const, job: updated, prepared };
    });
    if (!claim) break;
    if (claim.skipped) continue;
    const { job, prepared } = claim;
    let outcome: Outcome;
    try { outcome = await attempt(prepared); }
    catch { outcome = { status: "uncertain", code: "network_error" }; }
    sent++;
    const at = now();
    const exhausted = job.attempts >= 5, expired = !windowOpen(job, at);
    const retry = outcome.status !== "accepted" && outcome.status !== "failed" && outcome.code !== "idempotency_conflict" && !exhausted && !expired;
    const status = outcome.status === "accepted" ? "accepted" : retry ? "retry_wait" : outcome.status === "failed" ? "failed" : "uncertain";
    const errorCode = outcome.status === "accepted" ? null : outcome.status === "failed" || outcome.code === "idempotency_conflict" ? outcome.code : expired ? "retry_window_expired" : exhausted ? "attempts_exhausted" : outcome.code;
    const lead = outcome.status === "accepted" && "leadId" in outcome ? outcome : null;
    // Lease token AND version prevent a delayed process from finalizing another claim.
    await db.enquiryDelivery.updateMany({ where: { id: job.id, status: "sending", version: job.version, leaseToken: job.leaseToken, leaseExpiresAt: { gt: at } }, data: {
      status, errorCode, version: { increment: 1 }, leaseToken: null, leaseExpiresAt: null,
      acceptedAt: outcome.status === "accepted" ? at : null, providerId: outcome.status === "accepted" && "providerId" in outcome ? outcome.providerId : null,
      ...(target === "keeri" ? { keeriLeadId: lead?.leadId ?? null, keeriOutcome: lead?.outcome ?? null, keeriLeadPath: lead?.leadPath ?? null } : {}),
      nextAttemptAt: retry ? new Date(at.getTime() + Math.min(3600000, 30_000 * 2 ** (job.attempts - 1))) : null,
    } });
  }
  return sent;
}

/**
 * Staff email alerts. With `keeriAdminOrigin` (Keeri leads enabled), an alert waits for its lead's
 * first Keeri attempt, at most `keeriFirstAttemptHoldMs`, and links the lead if Keeri took it.
 */
export function processEnquiryDeliveries(db: PrismaClient, config: EnquiryDeliveryConfig, send: Send = sendEnquiryAlert, now: () => Date = () => new Date(), limit = 10, keeriAdminOrigin?: string | null): Promise<number> {
  const hold = (at: Date) => Prisma.sql`AND NOT EXISTS (
    SELECT 1 FROM "EnquiryDelivery" k WHERE k."enquiryId" = d."enquiryId" AND k."target" = 'keeri'
      AND (k."status" = 'queued' OR (k."status" = 'sending' AND k."attempts" = 1))
      AND d."createdAt" > ${new Date(at.getTime() - keeriFirstAttemptHoldMs).toISOString()}::timestamp)`;
  return drain(db, "email", config.fingerprint, async (tx, job, at) => {
    const alert: EnquiryAlert = { jobId: job.id, enquiryId: job.enquiryId, kind: job.enquiry.kind as EnquiryAlert["kind"], createdAt: job.enquiry.createdAt };
    if (!keeriAdminOrigin) return alert;
    const lead = await tx.enquiryDelivery.findUnique({ where: { enquiryId_target: { enquiryId: job.enquiryId, target: "keeri" } }, select: { status: true, acceptedAt: true, keeriLeadPath: true } });
    // Only a lead that existed before this alert's first attempt: retries must send the same text,
    // because the provider's idempotency key is per alert.
    const firstAttemptAt = job.firstAttemptAt ?? at;
    if (lead?.status === "accepted" && lead.keeriLeadPath && lead.acceptedAt && lead.acceptedAt <= firstAttemptAt) alert.keeriLeadUrl = keeriAdminOrigin + lead.keeriLeadPath;
    return alert;
  }, alert => send(config, alert), now, limit, keeriAdminOrigin ? hold : undefined);
}

/** Leads for Keeri: the stored enquiry, unchanged across retries so Keeri's idempotency key holds. */
export function processKeeriLeadDeliveries(db: PrismaClient, config: KeeriLeadsConfig, send: SendLead = sendKeeriLead, now: () => Date = () => new Date(), limit = 10): Promise<number> {
  return drain(db, "keeri", config.fingerprint, async (_tx, job) => {
    const { id, kind, name, email, phone, message, context, createdAt } = job.enquiry;
    if (!isKeeriLeadKind(kind)) return null;
    const fields = typeof context === "object" && context !== null && !Array.isArray(context) ? context as Record<string, unknown> : {};
    const leadContext: KeeriLead["context"] = {};
    for (const key of ["product", "variant", "sku", "pincode"] as const) {
      const value = fields[key];
      if (typeof value === "string") leadContext[key] = value;
    }
    return { enquiryId: id, kind, name, email, phone, message, context: leadContext, submittedAt: createdAt } satisfies KeeriLead;
  }, async lead => lead ? send(config, lead) : { status: "failed", code: "provider_rejected" }, now, limit);
}
