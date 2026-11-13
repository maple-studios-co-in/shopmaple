import type { CheckoutAttempt } from "@/app/checkout/checkout-client";
import { cx } from "@/lib/cx";
import { money } from "@/lib/format";

// Shared by checkout and the order-status page. These carry the look of the details form (frame 30:492) on to the
// steps the Figma does not draw: review, waiting, confirmation and order status.
const button =
  "inline-flex items-center justify-center gap-2 rounded-[28px] px-6 text-[15px] leading-[22px] font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple disabled:cursor-not-allowed disabled:opacity-60";
export const solid = cx(button, "h-12 cursor-pointer border-0 bg-maple text-white hover:opacity-90");
export const outline = cx(button, "h-12 cursor-pointer border border-solid border-maple bg-white text-maple hover:bg-[#f5ece9]");
export const muted = "text-[12px] leading-[17px] text-[#756d68]";
export const errorText = "text-[13px] font-medium text-maple";
export const heading = "m-0 text-[22px] leading-8 font-medium text-[#1c1c1c]";
export const panel = "grid content-start gap-4 rounded-[16px] bg-[#f8f6f2] p-6 max-[701px]:p-4";
export const buttonRow = "flex flex-wrap gap-3";

type Quote = NonNullable<CheckoutAttempt["quote"]>;

/** "Made to order: allow 28 days for making" for a made-to-order line; nothing for stocked. */
export function makingTime(item: Quote["items"][number]) {
  return item.fulfilment?.kind === "made_to_order" && item.fulfilment.leadTimeDays
    ? `Made to order: allow ${item.fulfilment.leadTimeDays} days for making`
    : null;
}

export function QuoteLines({ items }: { items: Quote["items"] }) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {items.map((item) => (
        <li key={item.variantId} className="flex items-start justify-between gap-4 border-0 border-b border-solid border-sand pb-3 text-ui text-espresso">
          <span className="grid gap-0.5">
            <strong>{item.title}</strong>
            <span className={muted}>
              {item.variantTitle} × {item.quantity}
            </span>
            {makingTime(item) && <span data-lead-time className={muted}>{makingTime(item)}</span>}
          </span>
          {/* Before any code's discount, which QuoteTotals takes off in one line, so the review adds up. */}
          <span className="shrink-0 tabular-nums">{money(item.lineTotalPaise + (item.discountPaise ?? 0))}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuoteTotals({ quote, totalPaise, methodLabel }: { quote: Quote; totalPaise: number; methodLabel?: string }) {
  const row = "flex justify-between gap-4";
  // Keeri's subtotal is already discounted; the lines read before the discount and it follows them as its own line.
  const promotion = quote.promotion;
  return (
    <dl className="m-0 grid gap-2 text-ui text-espresso">
      <div className={row}>
        <dt>Subtotal</dt>
        <dd className="m-0 tabular-nums">{money(quote.subtotalPaise + (promotion?.discountPaise ?? 0))}</dd>
      </div>
      {promotion && (
        <div data-discount-line className={row}>
          <dt>Discount ({promotion.code})</dt>
          <dd className="m-0 tabular-nums text-[#2f6b32]">−{money(promotion.discountPaise)}</dd>
        </div>
      )}
      <div className={row}>
        <dt>
          Delivery{methodLabel ? ` (${methodLabel})` : ""}
          {quote.delivery && (
            <span data-courier className={cx(muted, "block font-normal")}>
              {quote.delivery.courierName}
              {quote.delivery.estimatedDays ? `, about ${quote.delivery.estimatedDays} days in transit` : ""}
            </span>
          )}
        </dt>
        <dd className="m-0 tabular-nums">{quote.shippingPaise ? money(quote.shippingPaise) : "Free"}</dd>
      </div>
      {quote.gstMode === "excluded" ? (
        <div className={row}>
          <dt>GST</dt>
          <dd className="m-0 tabular-nums">{money(quote.taxPaise)}</dd>
        </div>
      ) : (
        <div className={cx(row, muted)}>
          <dt>Includes GST</dt>
          <dd className="m-0 tabular-nums">{money(quote.taxPaise)}</dd>
        </div>
      )}
      <div className={cx(row, "border-0 border-t border-solid border-sand pt-3 text-subhead font-bold")}>
        <dt>Total</dt>
        <dd className="m-0 tabular-nums">{money(totalPaise)}</dd>
      </div>
    </dl>
  );
}
