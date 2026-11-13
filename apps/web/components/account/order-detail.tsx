import Link from "next/link";
import type { OrderDetail, OrderJourneyStep, OrderStatus } from "@shopmaple/contracts/account";
import { money } from "@/lib/format";
import { formatDate, formatDayRange, itemCount } from "@/lib/account/format";
import { AccountHeading, addressLines, Lines, OrderPhoto } from "./account-parts";
import { OrderActions } from "@/components/orders/order-actions";

const badges: Record<OrderStatus, string> = {
  confirmed: "Order confirmed",
  confirming: "Payment received",
  preparing: "Being prepared",
  dispatched: "Order dispatched",
  delivered: "Order delivered",
  cancelled: "Order cancelled",
};
const stepState = { done: "Done", current: "In progress", upcoming: "Coming up" } as const;

/** The line under a step: when it happened, or what comes next (Figma 392:1432). */
function stepNote(step: OrderJourneyStep, order: OrderDetail) {
  if (step.state === "done") return step.at ? formatDate(step.at) : "Done";
  if (order.status === "cancelled") return "Not reached";
  if (step.key === "delivered" && step.state === "current")
    return order.estimate ? `On its way · Est. ${formatDayRange(order.estimate.from, order.estimate.to, { month: "short", year: false })}` : "On its way";
  switch (step.key) {
    case "confirmed":
      return "We’re confirming it";
    case "preparing":
      return order.journey[0]?.state === "done" ? "We’re on it" : "Up next";
    case "dispatched":
      return "Tracking to follow";
    case "delivered":
      return order.estimate ? `Est. ${formatDayRange(order.estimate.from, order.estimate.to, { month: "short", year: false })}` : "Date to follow";
  }
}

/** One order (Figma 392:1432): its journey, its pieces, where it is going and what was paid. */
export function OrderDetailView({ order }: { order: OrderDetail }) {
  const { totals, delivery } = order;
  const support = `/contact?${new URLSearchParams({ product: `Order ${order.number}` })}`;
  const invoice = `/contact?${new URLSearchParams({ product: `Invoice for order ${order.number}` })}`;
  return (
    <>
      <AccountHeading title={`Order #${order.number}`} lead={`Placed ${formatDate(order.placedAt)} · ${itemCount(order.itemCount)}`} />
      <p className="account-badge" data-status={order.status}>{badges[order.status]}</p>
      {order.cancellation ? (
        // A cancelled order: when, and where its refund stands. The journey below keeps what it had reached.
        <section className="account-panel" data-order-cancelled="" aria-label="Cancellation">
          <p className="account-section-title">{`Cancelled on ${formatDate(order.cancellation.cancelledAt)}`}</p>
          {order.refund ? (
            <p className="account-muted">
              {order.refund.status === "refunded"
                ? `Refund of ${money(order.refund.amountPaise)} issued${order.refund.refundedAt ? ` on ${formatDate(order.refund.refundedAt)}` : ""}. Banks usually take 5 to 7 working days to show it.`
                : `We’re refunding ${money(order.refund.amountPaise)} to your original payment method.`}
            </p>
          ) : null}
        </section>
      ) : null}
      {/* With private links: Track your order, and Cancel while the order can still be cancelled. */}
      <OrderActions order={order} />
      <ol className="account-journey" aria-label="Order journey">
        {order.journey.map((step, index) => (
          <li key={step.key} className="account-journey-step" data-step-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img className="account-journey-icon" src={step.state === "done" ? "/account/check-circle.svg" : "/account/box.svg"} alt="" width={28} height={28} />
            <p className="account-journey-title">
              <span className="account-journey-number">{String(index + 1).padStart(2, "0")}</span> {step.label}
              <span className="sr-only">{`, ${stepState[step.state]}`}</span>
            </p>
            <p className="account-journey-note">{stepNote(step, order)}</p>
          </li>
        ))}
      </ol>
      <ul className="account-order-items">
        {order.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="account-item">
            <OrderPhoto src={item.imageUrl} slot={104} />
            <div className="account-item-text">
              <p className="account-item-title">{item.title}</p>
              {item.variant ? <p className="account-item-meta">{item.variant}</p> : null}
              <p className="account-item-meta">{`Quantity ${item.quantity}`}</p>
            </div>
            <p className="account-item-price">{money(item.linePaise)}</p>
          </li>
        ))}
      </ul>
      <hr className="account-rule" />
      <div className="account-order-columns">
        <section className="account-delivery" aria-labelledby="account-delivery">
          <h2 id="account-delivery" className="account-section-title">Coming home to</h2>
          {/* The API sends the delivery phone already masked ("+91 ••••• •3210"); it is shown as it comes. */}
          <Lines className="account-delivery-address" lines={[delivery.name, ...addressLines(delivery), delivery.phone]} />
          {order.status === "cancelled" || order.status === "delivered" ? null : order.estimate ? (
            <p className="account-delivery-estimate">{`Estimated delivery · ${formatDayRange(order.estimate.from, order.estimate.to, { month: "short" })}`}</p>
          ) : (
            <p className="account-delivery-estimate">We’ll confirm your delivery date with you.</p>
          )}
          {order.status === "cancelled" || order.status === "delivered" ? null : (
            <p className="account-muted">
              {order.status === "dispatched" ? "Your order is with the courier. Our team will contact you to arrange delivery." : "We’ll share tracking when your order is dispatched."}
            </p>
          )}
        </section>
        <section className="account-panel account-payment" aria-labelledby="account-payment">
          <h2 id="account-payment" className="account-section-title">Payment summary</h2>
          <dl className="account-totals">
            <div><dt>Subtotal</dt><dd>{money(totals.subtotalPaise)}</dd></div>
            <div><dt>Delivery</dt><dd>{totals.deliveryPaise ? money(totals.deliveryPaise) : "Free"}</dd></div>
            {totals.taxIncluded ? null : <div><dt>GST</dt><dd>{money(totals.taxPaise)}</dd></div>}
            <div className="account-totals-total"><dt>Total paid</dt><dd>{money(totals.totalPaise)}</dd></div>
          </dl>
          {totals.taxIncluded ? <p className="account-fineprint">Inclusive of applicable taxes</p> : null}
          <p className="account-payment-reference">{`${order.payment.label} · Ref. ${order.payment.reference}`}</p>
        </section>
      </div>
      <div className="account-buttons">
        <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href={invoice}>Request an invoice</Link>
        <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href={support}>Get order support</Link>
      </div>
    </>
  );
}
