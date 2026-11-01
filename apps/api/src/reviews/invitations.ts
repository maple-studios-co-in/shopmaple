import { createHash, randomUUID } from "node:crypto";
import type { OrderDelivery, PrismaClient } from "@prisma/client";
import { quoteSnapshotSchema } from "@shopmaple/contracts";
import { sendEnquiryReply, type EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import { confirmedOrderKind } from "./deliveries.js";
import { reviewLink } from "./links.js";

/**
 * The review-invitation email: one per delivered order, with a link per line. A leased batch sends
 * each through Resend under a key derived from the order, so a retry after an uncertain answer can
 * never send twice. The body is rendered at send time from the checkout and is plain text.
 */
interface Options {
  email: EnquiryDeliveryConfig;
  linkSecret: string;
  fetch?: typeof fetch;
  now?: () => Date;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export async function runReviewInvitationEmails(db: PrismaClient, options: Options, size = 10) {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? 60_000;
  const retryDelayMs = options.retryDelayMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 8;

  async function claim(): Promise<OrderDelivery | undefined> {
    const at = now().toISOString();
    const token = randomUUID();
    const rows = await db.$queryRaw<OrderDelivery[]>`
      WITH candidate AS (
        SELECT "attemptId" FROM "OrderDelivery"
        WHERE "emailState" IN ('pending', 'processing') AND "emailNextAttemptAt" <= ${at}::timestamp
          AND ("emailLeaseExpiresAt" IS NULL OR "emailLeaseExpiresAt" <= ${at}::timestamp)
        ORDER BY "createdAt", "attemptId" LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE "OrderDelivery" d SET "emailState" = 'processing', "emailLeaseToken" = ${token},
        "emailLeaseExpiresAt" = ${new Date(now().getTime() + leaseMs).toISOString()}::timestamp,
        "emailAttempts" = d."emailAttempts" + 1
      FROM candidate WHERE d."attemptId" = candidate."attemptId" RETURNING d.*`;
    return rows[0];
  }
  async function finish(row: OrderDelivery, data: Partial<OrderDelivery>) {
    await db.orderDelivery.updateMany({
      where: { attemptId: row.attemptId, emailState: "processing", emailLeaseToken: row.emailLeaseToken },
      data: { ...data, emailLeaseToken: null, emailLeaseExpiresAt: null },
    });
  }
  async function render(row: OrderDelivery) {
    const attempt = await db.checkoutAttempt.findUnique({ where: { id: row.attemptId } });
    const quote = attempt ? quoteSnapshotSchema.safeParse(attempt.snapshot) : null;
    const outbox = await db.orderOutbox.findUnique({ where: { attemptId_kind: { attemptId: row.attemptId, kind: confirmedOrderKind } } });
    const open = await db.productReviewInvitation.findMany({ where: { attemptId: row.attemptId, usedAt: null, expiresAt: { gt: now() } } });
    if (!quote?.success || !outbox?.externalOrderId || !open.length) return null;
    const { customer, items } = quote.data;
    // In the order the buyer chose them.
    const position = (title: string, variantTitle: string) => items.findIndex((i) => i.title === title && i.variantTitle === variantTitle);
    open.sort((a, b) => position(a.productTitle, a.variantTitle) - position(b.productTitle, b.variantTitle));
    const lines = open.map((invite) =>
      `- ${clip(invite.productTitle, 120)}${invite.variantTitle ? `, ${clip(invite.variantTitle, 60)}` : ""}:\n  ${reviewLink(options.email.adminOrigin, options.linkSecret, invite.id)}`);
    return {
      to: customer.email,
      subject: clip(`How is your new ${open[0]!.productTitle}? Tell us in a review`, 150),
      text: [
        `Dear ${clip(customer.name, 120)},`,
        "",
        `We hope your Maple Furnishers order ${outbox.externalOrderId} arrived safely. Once you have lived with it for a few days, we would love to hear what you think.`,
        "",
        open.length === 1 ? "Write your review here:" : "Each piece has its own link:",
        ...lines,
        "",
        "Each link works once and stays open for 90 days. We read every review before it appears on our website, and we show only the name and city you choose.",
        "",
        "Questions about your order? Reply to this email.",
      ].join("\n"),
    };
  }

  const retryAt = (attempts: number) => new Date(now().getTime() + Math.min(3_600_000, retryDelayMs * 2 ** Math.max(0, attempts - 1)));
  const stats = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  for (let i = 0; i < size; i++) {
    const row = await claim();
    if (!row) break;
    stats.claimed++;
    const message = await render(row).catch(() => null);
    if (!message) {
      await finish(row, { emailState: "failed", emailFailureCode: "NOTHING_TO_SEND" });
      stats.failed++;
      continue;
    }
    // Stable for the order across retries, and shaped to the reply sender's key rules.
    const replyId = `review_${createHash("sha256").update(row.attemptId).digest("hex").slice(0, 48)}`;
    const outcome = await sendEnquiryReply(options.email, { replyId, ...message }, options.fetch);
    if (outcome.status === "accepted") {
      await finish(row, { emailState: "sent", emailSentAt: now(), emailProviderId: outcome.providerId, emailFailureCode: null });
      stats.sent++;
    } else if (outcome.code === "idempotency_conflict") {
      // Resend already accepted a message under this key.
      await finish(row, { emailState: "sent", emailSentAt: now(), emailFailureCode: "IDEMPOTENT_REPLAY" });
      stats.sent++;
    } else if (outcome.status === "failed" || row.emailAttempts >= maxAttempts) {
      await finish(row, { emailState: "failed", emailFailureCode: outcome.code });
      stats.failed++;
    } else {
      // Retryable or uncertain: the same idempotency key makes a resend safe.
      await finish(row, { emailState: "pending", emailFailureCode: outcome.code, emailNextAttemptAt: retryAt(row.emailAttempts) });
      stats.retried++;
    }
  }
  return stats;
}
