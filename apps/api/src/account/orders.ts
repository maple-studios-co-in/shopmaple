import type { QuoteSnapshot } from "@shopmaple/contracts";
import {
  formatOrderNumber,
  orderJourneyKeys,
  orderStatusLabels,
  type OrderDetail,
  type OrderJourneyStep,
  type OrderStatus,
  type OrderSummary,
} from "@shopmaple/contracts/account";
import type { OrderProgress } from "../orders/keeri-events.js";

/**
 * A customer's view of their paid orders (owner's spec, 10 Nov 2026). Status and journey are derived when read: the
 * store's own records say whether Keeri accepted the order, and Keeri's order updates (orders/keeri-events.ts) say how
 * far it has got since (preparing, dispatched, delivered, cancelled, refunded).
 *
 * Which attempts are orders: `captured` and `paid_hold_lapsed`, the two states that hold a payment Razorpay confirmed.
 * `reconciliation_required` is left out on purpose: in orders/service.ts it never carries a verified payment (it marks an
 * uncertain hold, provider order or release); when Razorpay later confirms a payment for it the worker moves it to
 * `paid_hold_lapsed`, and it appears then.
 */
export const paidOrderStates = ["captured", "paid_hold_lapsed"] as const;

export type OrderOutboxView = { state: string; externalOrderId: string | null; deliveredAt: Date | null };
export type PaidOrder = {
  orderNumber: number;
  state: string;
  capturedAt: Date;
  paymentId: string;
  snapshot: QuoteSnapshot;
  outbox: OrderOutboxView | null;
  /** What Keeri has reported since it accepted the order; null when it has said nothing. */
  progress?: OrderProgress | null;
};

/** Confirmed once Keeri accepted the order (the same test as the order status page); any other paid order is still
 * being confirmed, including one whose hold lapsed and is being confirmed by hand. A confirmed order then follows
 * Keeri's updates. An order Keeri never accepted has no updates to follow, so they are not read for it. */
export function customerOrderStatus(state: string, outbox: OrderOutboxView | null, progress?: OrderProgress | null): OrderStatus {
  if (!(state === "captured" && outbox?.state === "delivered" && Boolean(outbox.externalOrderId))) return "confirming";
  return progress?.stage ?? "confirmed";
}

const indiaOffsetMs = (5 * 60 + 30) * 60_000;
/** The calendar day in India (UTC+5:30, no daylight saving), plus some days. */
export function indiaDay(at: Date, plusDays = 0) {
  return new Date(at.getTime() + indiaOffsetMs + plusDays * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

/** Days added past the earliest day to make the delivery window: the courier's figure is an estimate, and dispatch
 * itself takes a day or two. Four, as the owner's designs draw it ("Est. 24–28 Nov", Figma 392:1432 and 394:1310). */
export const estimateSpreadDays = 4;
/** The delivery window: the longest made-to-order making time plus the courier's estimated days, counted from the day
 * the payment was captured. Null when either is unknown (no courier estimate, or an item frozen before Keeri stated its
 * fulfilment). */
export function deliveryEstimate(snapshot: QuoteSnapshot, capturedAt: Date): { from: string; to: string } | null {
  const transit = snapshot.delivery?.carrier?.estimatedDays;
  if (transit === null || transit === undefined) return null;
  let making = 0;
  for (const item of snapshot.items) {
    if (!item.fulfilment) return null;
    if (item.fulfilment.kind === "made_to_order") {
      if (item.fulfilment.leadTimeDays === null) return null;
      making = Math.max(making, item.fulfilment.leadTimeDays);
    }
  }
  return { from: indiaDay(capturedAt, making + transit), to: indiaDay(capturedAt, making + transit + estimateSpreadDays) };
}

const journeyLabels = { confirmed: "Confirmed", preparing: "Preparing", dispatched: "Dispatched", delivered: "Delivered" } as const;
/**
 * The four steps. Confirmed is done (with when) once Keeri accepted the order, and current while the team confirms.
 * After that the steps follow Keeri's updates: a step is done with the time Keeri gave, the step under way is current
 * (Preparing while it is made or packed, Delivered while it is with the courier), and the rest are upcoming. A step
 * Keeri skipped (dispatched with no production step) is done without a time. A cancelled order keeps what it reached.
 */
export function orderJourney(status: OrderStatus, confirmedAt: Date | null, progress?: OrderProgress | null): OrderJourneyStep[] {
  const reached = status === "cancelled"
    ? (progress?.deliveredAt ? 3 : progress?.dispatchedAt ? 2 : progress?.preparingAt ? 1 : 0)
    : { confirming: -1, confirmed: 0, preparing: 1, dispatched: 2, delivered: 3, cancelled: 0 }[status];
  const times = [confirmedAt, progress?.preparingAt ?? null, progress?.dispatchedAt ?? null, progress?.deliveredAt ?? null];
  return orderJourneyKeys.map((key, index): OrderJourneyStep => {
    const label = journeyLabels[key];
    if (status === "confirming") return { key, label, state: index === 0 ? "current" : "upcoming", at: null };
    // Preparing is under way, not finished, until the order is dispatched.
    const underWay = status !== "cancelled" && ((status === "preparing" && index === 1) || (status === "dispatched" && index === 3));
    if (underWay) return { key, label, state: "current", at: null };
    if (index <= reached) return { key, label, state: "done", at: times[index]?.toISOString() ?? null };
    return { key, label, state: "upcoming", at: null };
  });
}

/**
 * The delivery phone as an order shows it: the last four digits only, e.g. "+91 ••••• •3210" (U+2022 bullets, ordinary
 * spaces, the 5-5 grouping of an Indian mobile). An order is visible to whoever controls the email typed at checkout,
 * which may not be the buyer, so the whole number never leaves the server. Send it as-is; the page must not mask it again.
 */
export function maskPhone(phone: string) {
  const dot = "•";
  if (/^\+91[0-9]{10}$/.test(phone)) return `+91 ${dot.repeat(5)} ${dot}${phone.slice(-4)}`;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? `${dot.repeat(4)} ${digits.slice(-4)}` : dot.repeat(4);
}

/** Photos by the snapshot item's (Keeri) variant id; missing means none. */
export type OrderImages = ReadonlyMap<string, string>;

export function toOrderSummary(order: PaidOrder, images: OrderImages): OrderSummary {
  const status = customerOrderStatus(order.state, order.outbox, order.progress);
  const first = order.snapshot.items[0]!;
  return {
    number: formatOrderNumber(order.orderNumber),
    placedAt: order.capturedAt.toISOString(),
    status,
    statusLabel: orderStatusLabels[status],
    itemCount: order.snapshot.items.reduce((count, item) => count + item.quantity, 0),
    totalPaise: order.snapshot.totalPaise,
    firstItem: { title: first.title, variant: first.variantTitle, imageUrl: images.get(first.variantId) ?? null },
  };
}

export function toOrderDetail(order: PaidOrder, images: OrderImages): OrderDetail {
  const summary = toOrderSummary(order, images);
  const s = order.snapshot;
  const confirmedAt = summary.status === "confirming" ? null : (order.outbox?.deliveredAt ?? order.capturedAt);
  // Keeri's updates count only for an order it accepted.
  const progress = summary.status === "confirming" ? null : (order.progress ?? null);
  return {
    ...summary,
    items: s.items.map((item) => ({
      title: item.title,
      variant: item.variantTitle,
      quantity: item.quantity,
      linePaise: item.lineTotalPaise,
      imageUrl: images.get(item.variantId) ?? null,
    })),
    delivery: {
      name: s.customer.name,
      line1: s.shippingAddress.line1,
      line2: s.shippingAddress.line2,
      city: s.shippingAddress.city,
      state: s.shippingAddress.stateCode,
      pin: s.shippingAddress.pincode,
      phone: maskPhone(s.customer.phone),
    },
    totals: {
      subtotalPaise: s.subtotalPaise,
      deliveryPaise: s.shippingPaise,
      taxPaise: s.taxPaise,
      totalPaise: s.totalPaise,
      taxIncluded: s.gstMode === "included",
    },
    payment: { label: "Paid online", reference: order.paymentId },
    estimate: deliveryEstimate(s, order.capturedAt),
    cancellation: progress?.cancelledAt ? { cancelledAt: progress.cancelledAt.toISOString() } : null,
    refund: progress?.refund
      ? { status: progress.refund.status, amountPaise: progress.refund.amountPaise, refundedAt: progress.refund.refundedAt?.toISOString() ?? null }
      : null,
    journey: orderJourney(summary.status, confirmedAt, progress),
  };
}
