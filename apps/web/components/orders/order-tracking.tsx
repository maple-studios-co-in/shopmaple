import Link from "next/link";
import type { OrderShipment, OrderTracking } from "@shopmaple/contracts/account";
import { AccountHeading, OrderPhoto } from "@/components/account/account-parts";
import { formatDate, formatDayRange } from "@/lib/account/format";

const stateWords: Record<OrderShipment["state"], string> = {
  processing: "Being packed",
  booked: "Courier booked",
  shipped: "On its way",
  delivered: "Delivered",
};

/**
 * An order's tracking page (owner, 14 Nov 2026), behind the same private link as the order: where the parcel is, from
 * Keeri's Shiprocket booking (courier, AWB and Shiprocket's own tracking page), the order's journey, and its pieces.
 */
export function OrderTrackingView({ tracking }: { tracking: OrderTracking }) {
  const { order, shipment } = tracking;
  return (
    <>
      <AccountHeading title={`Tracking #${order.number}`} lead={`Placed ${formatDate(order.placedAt)}`} />
      <section className="account-panel" data-tracking="" aria-label="Parcel">
        {shipment && shipment.state !== "processing" ? (
          <>
            <p className="account-section-title">{stateWords[shipment.state]}</p>
            <dl className="account-totals">
              {shipment.courierName ? <div><dt>Courier</dt><dd>{shipment.courierName}</dd></div> : null}
              {shipment.awbCode ? <div><dt>Tracking number (AWB)</dt><dd>{shipment.awbCode}</dd></div> : null}
              {shipment.trackingStatus ? <div><dt>Latest update</dt><dd>{shipment.trackingStatus}</dd></div> : null}
              {shipment.shippedAt ? <div><dt>Shipped</dt><dd>{formatDate(shipment.shippedAt)}</dd></div> : null}
              {shipment.deliveredAt ? <div><dt>Delivered</dt><dd>{formatDate(shipment.deliveredAt)}</dd></div> : null}
            </dl>
            {shipment.trackingUrl ? (
              <a className="account-cta" href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">Follow the parcel on Shiprocket</a>
            ) : null}
          </>
        ) : tracking.shipmentUnavailable ? (
          <p className="account-muted">Tracking isn’t available right now. Please try again in a little while.</p>
        ) : order.status === "cancelled" ? (
          <p className="account-muted">This order was cancelled.</p>
        ) : (
          <p className="account-muted">
            {"We’ll share tracking here once your order is dispatched."}
            {order.estimate ? ` Estimated delivery ${formatDayRange(order.estimate.from, order.estimate.to, { month: "short" })}.` : ""}
          </p>
        )}
      </section>
      <ol className="account-journey" aria-label="Order journey">
        {order.journey.map((step) => (
          <li key={step.key} className="account-journey-step" data-step-state={step.state}>
            <p className="account-journey-title">{step.label}</p>
            <p className="account-journey-note">{step.state === "done" ? (step.at ? formatDate(step.at) : "Done") : step.state === "current" ? "In progress" : "Coming up"}</p>
          </li>
        ))}
      </ol>
      <ul className="account-order-items">
        {order.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="account-item">
            <OrderPhoto src={item.imageUrl} slot={72} />
            <div className="account-item-text">
              <p className="account-item-title">{item.title}</p>
              {item.variant ? <p className="account-item-meta">{item.variant}</p> : null}
              <p className="account-item-meta">{`Quantity ${item.quantity}`}</p>
            </div>
          </li>
        ))}
      </ul>
      {order.links ? (
        <div className="account-buttons">
          <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href={order.links.view}>View your order</Link>
        </div>
      ) : null}
    </>
  );
}
