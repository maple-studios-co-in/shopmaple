import { randomUUID } from "node:crypto";
import { quoteSnapshotSchema, type QuoteSnapshot } from "@shopmaple/contracts";
import { Prisma, type CheckoutAttempt, type OrderNotification, type PrismaClient } from "@prisma/client";
import {
  sendTransactionalEmail,
  type EnquiryDeliveryConfig,
  type EnquiryDeliveryOutcome,
} from "../enquiry-delivery-provider.js";

/**
 * Order emails. A sweep decides which emails an attempt now deserves and records
 * each once (unique per attempt and kind); a leased batch then sends them through
 * Resend with the row id as the idempotency key, so a retry after an uncertain
 * answer can never send twice. Bodies are rendered at send time from the attempt
 * and are plain text: no customer data is copied into the notification row.
 */
export type NotificationKind = "customer_confirmed" | "customer_received" | "staff_order" | "staff_payment" | "staff_attention";
interface Options {
  merchantScope: string;
  email: EnquiryDeliveryConfig;
  fetch?: typeof fetch;
  now?: () => Date;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}

const rupees = (paise: number) =>
  "Rs. " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100);

export function createOrderNotifications(db: PrismaClient, options: Options) {
  const { merchantScope, email } = options;
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? 60_000;
  const retryDelayMs = options.retryDelayMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 8;

  async function want(subjectId: string, kinds: NotificationKind[]) {
    await db.orderNotification.createMany({
      data: kinds.map((kind) => ({ merchantScope, subjectId, kind })),
      skipDuplicates: true,
    });
  }
  /** Record the emails each attempt and payment now deserves. Idempotent: each query
   * skips subjects that already have the email of its kind, so the scan stays small.
   * Three staff kinds keep the cases apart: `staff_order` (confirmed), `staff_payment`
   * (money was taken and needs a person) and `staff_attention` (no money, a leftover hold). */
  async function sweep() {
    const unsent = (kind: NotificationKind) => Prisma.sql`NOT EXISTS (SELECT 1 FROM "OrderNotification" n
      WHERE n."merchantScope" = a."merchantScope" AND n."subjectId" = a."id" AND n."kind" = ${kind})`;
    const isV2 = (snapshot: unknown) => quoteSnapshotSchema.safeParse(snapshot).success;
    const confirmed = await db.$queryRaw<Array<{ id: string; snapshot: unknown }>>`
      SELECT a."id", a."snapshot" FROM "CheckoutAttempt" a
      JOIN "OrderOutbox" o ON o."attemptId" = a."id" AND o."kind" = 'keeri.order.captured.v2'
      WHERE a."merchantScope" = ${merchantScope} AND a."state" = 'captured' AND o."state" = 'delivered'
        AND o."externalOrderId" IS NOT NULL AND ${unsent("staff_order")} LIMIT 200`;
    for (const a of confirmed) await want(a.id, isV2(a.snapshot) ? ["customer_confirmed", "staff_order"] : ["staff_order"]);
    const paidProblems = await db.$queryRaw<Array<{ id: string; snapshot: unknown }>>`
      SELECT a."id", a."snapshot" FROM "CheckoutAttempt" a
      LEFT JOIN "OrderOutbox" o ON o."attemptId" = a."id" AND o."kind" LIKE 'keeri.order.captured.%'
      WHERE a."merchantScope" = ${merchantScope}
        AND (a."state" = 'paid_hold_lapsed' OR (a."state" = 'captured' AND o."state" = 'failed'))
        AND ${unsent("staff_payment")} LIMIT 200`;
    for (const a of paidProblems) await want(a.id, isV2(a.snapshot) ? ["customer_received", "staff_payment"] : ["staff_payment"]);
    const unpaid = await db.$queryRaw<Array<{ id: string }>>`
      SELECT a."id" FROM "CheckoutAttempt" a
      WHERE a."merchantScope" = ${merchantScope} AND a."state" = 'reconciliation_required' AND ${unsent("staff_attention")} LIMIT 200`;
    for (const a of unpaid) await want(a.id, ["staff_attention"]);
    // A payment that matched no payable attempt (unknown order, a second payment) or
    // that the worker gave up on: keyed to the payment event, so every one is told
    // apart and its own payment id reaches staff. A lapsed hold is told per attempt above.
    const payments = await db.$queryRaw<Array<{ id: string }>>`
      SELECT p."id" FROM "PaymentWebhookInbox" p
      WHERE p."merchantScope" = ${merchantScope}
        AND ((p."state" = 'reconciliation_required' AND p."failureCode" IS DISTINCT FROM 'PAID_HOLD_LAPSED') OR p."workerState" = 'failed')
        AND NOT EXISTS (SELECT 1 FROM "OrderNotification" n WHERE n."merchantScope" = p."merchantScope"
          AND n."kind" = 'staff_payment' AND n."subjectId" = 'inbox:' || p."id")
      LIMIT 200`;
    for (const payment of payments) await want(`inbox:${payment.id}`, ["staff_payment"]);
  }

  async function claim(): Promise<OrderNotification | undefined> {
    const at = now();
    const token = randomUUID();
    const rows = await db.$queryRaw<OrderNotification[]>`
      WITH candidate AS (
        SELECT "id" FROM "OrderNotification"
        WHERE "merchantScope" = ${merchantScope} AND "state" IN ('pending', 'processing')
          AND "nextAttemptAt" <= ${at.toISOString()}::timestamp
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${at.toISOString()}::timestamp)
        ORDER BY "createdAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE "OrderNotification" n SET "state" = 'processing', "leaseToken" = ${token},
        "leaseExpiresAt" = ${new Date(at.getTime() + leaseMs).toISOString()}::timestamp,
        "deliveryAttempts" = n."deliveryAttempts" + 1
      FROM candidate WHERE n."id" = candidate."id" RETURNING n.*`;
    return rows[0];
  }
  async function finish(row: OrderNotification, data: Partial<OrderNotification>) {
    await db.orderNotification.updateMany({
      where: { id: row.id, state: "processing", leaseToken: row.leaseToken },
      data: { ...data, leaseToken: null, leaseExpiresAt: null },
    });
  }

  async function render(row: OrderNotification) {
    const attemptId = row.subjectId.startsWith("inbox:") ? null : row.subjectId;
    const attempt = attemptId
      ? await db.checkoutAttempt.findFirst({ where: { id: attemptId, merchantScope } })
      : null;
    const inbox = !attemptId
      ? await db.paymentWebhookInbox.findFirst({ where: { id: row.subjectId.slice(6), merchantScope } })
      : null;
    // A payment event still names its checkout when it has one, for the order's context.
    const related = inbox?.providerOrderId
      ? await db.checkoutAttempt.findFirst({ where: { merchantScope, providerOrderId: inbox.providerOrderId } })
      : null;
    if (inbox)
      return compose(row.kind as NotificationKind, { attempt: related, quote: null, inbox, reference: null, staffOutcome: null });
    const parsed = attempt ? quoteSnapshotSchema.safeParse(attempt.snapshot) : null;
    const quote = parsed?.success ? parsed.data : null;
    const outbox = attempt
      ? await db.orderOutbox.findUnique({ where: { attemptId_kind: { attemptId: attempt.id, kind: "keeri.order.captured.v2" } } })
      : null;
    return compose(row.kind as NotificationKind, { attempt, quote, inbox, reference: outbox?.externalOrderId ?? null, staffOutcome: outbox?.failureCode ?? null });
  }
  function compose(
    kind: NotificationKind,
    { attempt, quote, inbox, reference, staffOutcome }: {
      attempt: CheckoutAttempt | null;
      quote: QuoteSnapshot | null;
      inbox: { id: string; paymentId: string | null; providerOrderId: string | null; failureCode: string | null; workerState: string } | null;
      reference: string | null;
      staffOutcome: string | null;
    },
  ): { to: string; subject: string; text: string } | null {
    const lines = quote
      ? quote.items.map((i) => {
          const making = i.fulfilment?.kind === "made_to_order" ? ` (made to order: allow ${i.fulfilment.leadTimeDays} days for making)` : "";
          return `- ${i.title}, ${i.variantTitle} × ${i.quantity}: ${rupees(i.lineTotalPaise)}${making}`;
        })
      : [];
    const courier = quote?.delivery?.carrier;
    const deliveryLine = courier
      ? `Delivery: ${rupees(quote!.shippingPaise)} by ${courier.courierName}${courier.estimatedDays ? `, about ${courier.estimatedDays} days in transit` : ""}`
      : quote
        ? `Delivery: ${rupees(quote.shippingPaise)}`
        : "";
    const address = quote
      ? [quote.shippingAddress.line1, quote.shippingAddress.line2, `${quote.shippingAddress.city} ${quote.shippingAddress.pincode}`].filter(Boolean).join(", ")
      : "";
    const total = attempt ? rupees(attempt.amountPaise) : "";
    const contact = `Questions? Reply to this email or contact us at ${email.adminOrigin}/pages/contact.`;
    if (kind === "customer_confirmed" && attempt && quote && reference)
      return {
        to: quote.customer.email,
        subject: `Your Maple Furnishers order ${reference} is confirmed`,
        text: [
          `Dear ${quote.customer.name},`,
          "",
          `Thank you for your order. Your payment of ${total} has been received and your order is confirmed.`,
          `Order reference: ${reference}`,
          "",
          ...lines,
          deliveryLine,
          `Total paid: ${total}${quote.gstMode === "included" ? " (including GST)" : ""}`,
          "",
          `Delivering to: ${address}`,
          "",
          "Our team will contact you to arrange delivery.",
          contact,
        ].join("\n"),
      };
    if (kind === "customer_received" && attempt && quote)
      return {
        to: quote.customer.email,
        subject: "We've received your payment",
        text: [
          `Dear ${quote.customer.name},`,
          "",
          `We've received your payment of ${total}. Our team is confirming your order by hand and will contact you within one business day.`,
          "If we can't confirm it, we'll refund in full to your original payment method. You don't need to pay again.",
          `Checkout reference: ${attempt.id}`,
          "",
          ...lines,
          "",
          contact,
        ].join("\n"),
      };
    if (kind === "staff_order" && attempt && reference)
      return {
        to: email.to,
        subject: `New online order ${reference}: ${total}`,
        text: [
          `Keeri order: ${reference}`,
          `Checkout: ${attempt.id}`,
          `Payment: ${attempt.paymentId} (Razorpay order ${attempt.providerOrderId})`,
          `Total: ${total}`,
          "",
          ...lines,
          deliveryLine,
          "",
          ...(quote ? [`Customer: ${quote.customer.name}, ${quote.customer.phone}, ${quote.customer.email}`, `Deliver to: ${address}`] : []),
        ].join("\n"),
      };
    const footer = [
      "",
      "Follow the refund and reconciliation procedure in docs/checkout-recovery.md. Never refund from this email alone: check the payment in the Razorpay dashboard first.",
    ];
    const customerLines = quote ? ["", ...lines, "", `Customer: ${quote.customer.name}, ${quote.customer.phone}, ${quote.customer.email}`] : [];
    const attemptLines = attempt
      ? [`Checkout: ${attempt.id}`, `State: ${attempt.state}${attempt.failureCode ? ` (${attempt.failureCode})` : ""}`, `Amount: ${total}`,
         `Payment recorded on the checkout: ${attempt.paymentId ?? "none"}`, `Razorpay order: ${attempt.providerOrderId ?? "none"}`]
      : [];
    if (kind === "staff_payment" && inbox) {
      const reason = inbox.failureCode ?? "WORKER_GAVE_UP";
      return {
        to: email.to,
        subject: `Online order needs attention: payment ${inbox.paymentId ?? inbox.id}`,
        text: [
          reason === "PAYMENT_ID_CONFLICT"
            ? `The customer PAID TWICE for one order. Keep the payment recorded on the checkout and refund payment ${inbox.paymentId} in full.`
            : `A payment (${inbox.paymentId}) needs a person: ${reason}. Check it in Razorpay; if it is captured and not fulfilled, refund it in full.`,
          "",
          `Payment: ${inbox.paymentId}`,
          `Razorpay order: ${inbox.providerOrderId ?? "unknown"}`,
          `Reason: ${reason}`,
          `Payment event: ${inbox.id}`,
          ...(attempt ? ["", ...attemptLines] : ["No checkout matches this Razorpay order."]),
          ...footer,
        ].join("\n"),
      };
    }
    if (kind === "staff_payment" && attempt)
      return {
        to: email.to,
        subject: `Online order needs attention: ${attempt.id}`,
        text: [
          attempt.state === "paid_hold_lapsed"
            ? `The customer PAID (${attempt.paymentId}), but the Keeri stock hold had lapsed or been released, so no Keeri order was placed. Confirm stock and raise the order by hand, or refund in full.`
            : `The customer PAID (${attempt.paymentId}), but Keeri did not accept the order (${staffOutcome ?? "unknown"}). Raise it by hand or refund in full.`,
          "",
          ...attemptLines,
          ...customerLines,
          ...footer,
        ].join("\n"),
      };
    if (kind === "staff_attention" && attempt)
      return {
        to: email.to,
        subject: `Online order needs attention: ${attempt.id}`,
        text: [
          "No payment is recorded for this checkout, but a Keeri stock hold or a Razorpay order may be left over and needs a manual check.",
          "",
          ...attemptLines,
          ...customerLines,
          ...footer,
        ].join("\n"),
      };
    return null;
  }

  const retryAt = (attempts: number) =>
    new Date(now().getTime() + Math.min(3_600_000, retryDelayMs * 2 ** Math.max(0, attempts - 1)));
  /** Send up to `size` due emails. A provider outage never affects the order itself. */
  async function runBatch(size = 10) {
    const stats = { claimed: 0, sent: 0, retried: 0, failed: 0 };
    for (let i = 0; i < size; i++) {
      const row = await claim();
      if (!row) break;
      stats.claimed++;
      const message = await render(row).catch(() => null);
      if (!message) {
        await finish(row, { state: "failed", failureCode: "NOTHING_TO_SEND" });
        stats.failed++;
        continue;
      }
      const outcome: EnquiryDeliveryOutcome = await sendTransactionalEmail(
        email,
        `order/${row.id}`,
        message,
        options.fetch,
      );
      if (outcome.status === "accepted") {
        await finish(row, { state: "sent", sentAt: now(), providerId: outcome.providerId, failureCode: null });
        stats.sent++;
      } else if (outcome.code === "idempotency_conflict") {
        // Resend already accepted a message under this key (a retry re-rendered it differently).
        await finish(row, { state: "sent", sentAt: now(), failureCode: "IDEMPOTENT_REPLAY" });
        stats.sent++;
      } else if (outcome.status === "failed" || row.deliveryAttempts >= maxAttempts) {
        await finish(row, { state: "failed", failureCode: outcome.code });
        stats.failed++;
      } else {
        // Retryable or uncertain: the same idempotency key makes a resend safe.
        await finish(row, { state: "pending", failureCode: outcome.code, nextAttemptAt: retryAt(row.deliveryAttempts) });
        stats.retried++;
      }
    }
    return stats;
  }
  return { sweep, runBatch };
}
