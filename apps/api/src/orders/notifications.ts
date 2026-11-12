import { randomUUID } from "node:crypto";
import { quoteSnapshotSchema, type QuoteSnapshot } from "@shopmaple/contracts";
import { formatOrderNumber } from "@shopmaple/contracts/account";
import { Prisma, type CheckoutAttempt, type OrderNotification, type PrismaClient } from "@prisma/client";
import {
  sendTransactionalEmail,
  type EnquiryDeliveryConfig,
  type EnquiryDeliveryOutcome,
} from "../enquiry-delivery-provider.js";
import { findOrderPhotos, renderOrderEmail, renderPaymentEmail, type OrderPhotos } from "./order-email.js";

/**
 * Order emails. A sweep decides which emails an attempt now deserves and records
 * each once (unique per attempt and kind); a leased batch then sends them through
 * Resend with the row id as the idempotency key, so a retry after an uncertain
 * answer can never send twice. Bodies are rendered at send time from the attempt,
 * so no customer data is copied into the notification row: the buyer's emails as
 * HTML with a plain-text part (order-email.ts), staff alerts as plain text.
 */
export type NotificationKind =
  | "customer_confirmed" | "customer_received" | "customer_payment_failed" | "customer_payment_pending"
  | "staff_order" | "staff_payment" | "staff_attention";
type PaymentKind = Extract<NotificationKind, "customer_payment_failed" | "customer_payment_pending">;
const isPaymentKind = (kind: string): kind is PaymentKind => kind === "customer_payment_failed" || kind === "customer_payment_pending";
/** The buyer's emails, which show the pieces' photos. */
const buyerKinds = new Set<string>(["customer_confirmed", "customer_received", "customer_payment_failed", "customer_payment_pending"]);

/** A failed payment rests this long before the buyer hears of it: Razorpay's window lets them try again at once, and a
 * retry that works, or a fresh checkout, must win. */
const failedRestMs = 10 * 60_000;
/** A payment Razorpay's window called a success may stay unconfirmed this long before the buyer is told it is pending;
 * Razorpay normally captures within seconds. */
const pendingRestMs = 5 * 60_000;
/** Payment events older than this never start an email: a backlog after an outage, or events from before this shipped. */
const paymentEventWindowMs = 2 * 24 * 3_600_000;

// The checkout's Razorpay order exists and no payment has been captured on it: it is still payable, or was let go
// unpaid. Staff cases (reconciliation) are left to staff.
const payable = Prisma.sql`a."state" IN ('awaiting_payment', 'releasing', 'abandoned') AND a."capturedAt" IS NULL
  AND a."paymentId" IS NULL AND a."providerOrderId" IS NOT NULL`;
// Nothing says a payment on that order worked: no success callback from Razorpay's window, no capture, no authorization.
const noPaymentWorked = Prisma.sql`NOT EXISTS (SELECT 1 FROM "PaymentWebhookInbox" s WHERE s."merchantScope" = a."merchantScope"
  AND s."providerOrderId" = a."providerOrderId" AND s."eventType" IN ('checkout.callback', 'payment.captured', 'order.paid', 'payment.authorized'))`;
// The buyer has not started another checkout since, from the same bag or the same email: that one speaks for them now.
const noNewerCheckout = Prisma.sql`NOT EXISTS (SELECT 1 FROM "CheckoutAttempt" b WHERE b."merchantScope" = a."merchantScope"
  AND b."createdAt" > a."createdAt" AND (b."cartId" = a."cartId" OR b."customerEmailKey" = a."customerEmailKey"))`;
// Razorpay's window reported a success that the payment worker is still confirming (not captured, not handed to staff).
const callbackUnconfirmed = Prisma.sql`EXISTS (SELECT 1 FROM "PaymentWebhookInbox" c WHERE c."merchantScope" = a."merchantScope"
  AND c."providerOrderId" = a."providerOrderId" AND c."eventType" = 'checkout.callback' AND c."state" = 'pending')`;
interface Options {
  merchantScope: string;
  email: EnquiryDeliveryConfig;
  /** Customer accounts are on: the buyer's email links the order in their account (see order-email.ts). */
  accountLinks?: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}

type Message = { to: string; subject: string; text: string; html?: string };

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
   * (money was taken and needs a person) and `staff_attention` (no money, a leftover hold).
   * Before any order, the buyer hears of a payment that failed (`customer_payment_failed`)
   * or that Razorpay's window called a success but is still unconfirmed
   * (`customer_payment_pending`), once each per checkout. */
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
    // The buyer's payment emails come last, and a fault in them never holds back the order emails and staff alerts
    // above, nor this cycle's sends: it is logged and retried next cycle.
    await sweepPayments(unsent, isV2).catch((error: unknown) => {
      const code = error && typeof error === "object" && "code" in error ? ` (${String(error.code)})` : "";
      console.error(`Payment email sweep failed${code}; it is retried next cycle.`);
    });
  }
  /** Before any order: the payment emails each checkout now deserves (see `sweep`). Each query starts from Razorpay's
   * recent reports, so the scan stays small however many checkouts were ever left unpaid. */
  async function sweepPayments(unsent: (kind: NotificationKind) => Prisma.Sql, isV2: (snapshot: unknown) => boolean) {
    const at = now().getTime();
    const since = new Date(at - paymentEventWindowMs).toISOString();
    // Only a v2 checkout has the snapshot the buyer's emails are drawn from.
    const v2 = Prisma.sql`a."snapshot"->>'version' = '2'`;
    // Razorpay reported a failed payment on the checkout's order within the window, the latest of them has rested
    // (a buyer still trying is left alone), and nothing since says a payment worked or a new checkout began.
    const failed = await db.$queryRaw<Array<{ id: string; snapshot: unknown }>>`
      SELECT a."id", a."snapshot" FROM "CheckoutAttempt" a
      WHERE a."merchantScope" = ${merchantScope}
        AND a."providerOrderId" IN (SELECT f."providerOrderId" FROM "PaymentWebhookInbox" f WHERE f."merchantScope" = ${merchantScope}
          AND f."eventType" = 'payment.failed' AND f."receivedAt" > ${since}::timestamp)
        AND ${v2} AND ${payable} AND ${noPaymentWorked} AND ${noNewerCheckout}
        AND NOT EXISTS (SELECT 1 FROM "PaymentWebhookInbox" f WHERE f."merchantScope" = a."merchantScope"
          AND f."providerOrderId" = a."providerOrderId" AND f."eventType" = 'payment.failed'
          AND f."receivedAt" > ${new Date(at - failedRestMs).toISOString()}::timestamp)
        AND ${unsent("customer_payment_failed")} LIMIT 200`;
    for (const a of failed) if (isV2(a.snapshot)) await want(a.id, ["customer_payment_failed"]);
    // Razorpay's window reported a success that has stayed unconfirmed past the rest, within the window.
    const pending = await db.$queryRaw<Array<{ id: string; snapshot: unknown }>>`
      SELECT a."id", a."snapshot" FROM "CheckoutAttempt" a
      WHERE a."merchantScope" = ${merchantScope}
        AND a."providerOrderId" IN (SELECT c."providerOrderId" FROM "PaymentWebhookInbox" c WHERE c."merchantScope" = ${merchantScope}
          AND c."eventType" = 'checkout.callback' AND c."state" = 'pending'
          AND c."receivedAt" > ${since}::timestamp AND c."receivedAt" <= ${new Date(at - pendingRestMs).toISOString()}::timestamp)
        AND ${v2} AND ${payable} AND ${unsent("customer_payment_pending")} LIMIT 200`;
    for (const a of pending) if (isV2(a.snapshot)) await want(a.id, ["customer_payment_pending"]);
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

  /** Whether a payment email is still true as it is sent, however long a retry kept it waiting: a payment that went
   * through since, a newer checkout, or a case handed to staff stops it. */
  async function stillTrue(kind: PaymentKind, attemptId: string) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT a."id" FROM "CheckoutAttempt" a
      WHERE a."merchantScope" = ${merchantScope} AND a."id" = ${attemptId} AND ${payable}
        AND ${kind === "customer_payment_failed" ? Prisma.sql`${noPaymentWorked} AND ${noNewerCheckout}` : callbackUnconfirmed}`;
    return rows.length > 0;
  }

  async function render(row: OrderNotification): Promise<Message | null | "superseded"> {
    const attemptId = row.subjectId.startsWith("inbox:") ? null : row.subjectId;
    const attempt = attemptId
      ? await db.checkoutAttempt.findFirst({ where: { id: attemptId, merchantScope } })
      : null;
    if (attempt && isPaymentKind(row.kind) && !(await stillTrue(row.kind, attempt.id))) return "superseded";
    const inbox = !attemptId
      ? await db.paymentWebhookInbox.findFirst({ where: { id: row.subjectId.slice(6), merchantScope } })
      : null;
    // A payment event still names its checkout when it has one, for the order's context.
    const related = inbox?.providerOrderId
      ? await db.checkoutAttempt.findFirst({ where: { merchantScope, providerOrderId: inbox.providerOrderId } })
      : null;
    if (inbox)
      return compose(row.kind as NotificationKind, { attempt: related, quote: null, inbox, reference: null, staffOutcome: null, photos: new Map(), payment: null });
    const parsed = attempt ? quoteSnapshotSchema.safeParse(attempt.snapshot) : null;
    const quote = parsed?.success ? parsed.data : null;
    const outbox = attempt
      ? await db.orderOutbox.findUnique({ where: { attemptId_kind: { attemptId: attempt.id, kind: "keeri.order.captured.v2" } } })
      : null;
    // The Razorpay report a payment email is about: the latest failure, or the success callback still being confirmed.
    const payment = attempt?.providerOrderId && isPaymentKind(row.kind)
      ? await db.paymentWebhookInbox.findFirst({
          where: { merchantScope, providerOrderId: attempt.providerOrderId, eventType: row.kind === "customer_payment_failed" ? "payment.failed" : "checkout.callback" },
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          select: { paymentId: true, receivedAt: true },
        })
      : null;
    // The pieces' photos, for the buyer's emails only. A failed lookup sends the email with plain tiles, never not at all.
    const photos: OrderPhotos = attempt && quote && buyerKinds.has(row.kind)
      ? await findOrderPhotos(db, attempt, quote).catch(() => {
          console.error("Order email photos unavailable; sending without them.");
          return new Map<string, string>();
        })
      : new Map();
    return compose(row.kind as NotificationKind, { attempt, quote, inbox, reference: outbox?.externalOrderId ?? null, staffOutcome: outbox?.failureCode ?? null, photos, payment });
  }
  function compose(
    kind: NotificationKind,
    { attempt, quote, inbox, reference, staffOutcome, photos, payment }: {
      attempt: CheckoutAttempt | null;
      quote: QuoteSnapshot | null;
      inbox: { id: string; paymentId: string | null; providerOrderId: string | null; failureCode: string | null; workerState: string } | null;
      reference: string | null;
      staffOutcome: string | null;
      photos: OrderPhotos;
      payment: { paymentId: string | null; receivedAt: Date } | null;
    },
  ): Message | null {
    // With a code, each line reads at its price before the discount and the discount follows as
    // one line, so the email adds up to what was charged.
    const lines = quote
      ? [
          ...quote.items.map((i) => {
            const making = i.fulfilment?.kind === "made_to_order" ? ` (made to order: allow ${i.fulfilment.leadTimeDays} days for making)` : "";
            return `- ${i.title}, ${i.variantTitle} × ${i.quantity}: ${rupees(i.lineTotalPaise + (i.discountPaise ?? 0))}${making}`;
          }),
          ...(quote.promotion ? [`Discount (${quote.promotion.code}): -${rupees(quote.promotion.discountPaise)}`] : []),
        ]
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
    // Maple's own number ("MF-…") once the capture assigned it. Keeri's SO number is internal: customers see it only
    // on an order confirmed before numbering existed.
    const orderNumber = attempt?.orderNumber ? formatOrderNumber(attempt.orderNumber) : null;
    if (kind === "customer_confirmed" && attempt && quote && reference)
      return {
        to: quote.customer.email,
        ...renderOrderEmail({ kind: "confirmed", attempt, quote, orderNumber: orderNumber ?? reference, photos, origin: email.adminOrigin, accountLinks: options.accountLinks }),
      };
    if (kind === "customer_received" && attempt && quote)
      return {
        to: quote.customer.email,
        ...renderOrderEmail({ kind: "received", attempt, quote, orderNumber, photos, origin: email.adminOrigin, accountLinks: options.accountLinks }),
      };
    if (isPaymentKind(kind) && attempt && quote && payment)
      return {
        to: quote.customer.email,
        ...renderPaymentEmail({
          kind: kind === "customer_payment_failed" ? "failed" : "pending",
          attempt, quote, paymentId: payment.paymentId, at: payment.receivedAt, photos, origin: email.adminOrigin,
        }),
      };
    if (kind === "staff_order" && attempt && reference)
      return {
        to: email.to,
        subject: `New online order ${reference}: ${total}`,
        text: [
          `Keeri order: ${reference}`,
          ...(orderNumber ? [`Maple order (the customer's number): ${orderNumber}`] : []),
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
      ? [...(orderNumber ? [`Maple order (the customer's number): ${orderNumber}`] : []),
         `Checkout: ${attempt.id}`, `State: ${attempt.state}${attempt.failureCode ? ` (${attempt.failureCode})` : ""}`, `Amount: ${total}`,
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
    const stats = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    for (let i = 0; i < size; i++) {
      const row = await claim();
      if (!row) break;
      stats.claimed++;
      const message = await render(row).catch(() => null);
      if (message === "superseded") {
        // No longer true (the payment went through, or a newer checkout took over): never sent, and nothing for staff.
        await finish(row, { state: "skipped", failureCode: "SUPERSEDED" });
        stats.skipped++;
        continue;
      }
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
