import type { CheckoutAttempt } from "@/app/checkout/checkout-client";
import { cx } from "@/lib/cx";
import { money } from "@/lib/format";

// Shared by checkout and the order-status page. Checkout is not in the Figma
// designs, so it keeps the storefront's existing button, field and type tokens.
export const button =
  "inline-flex items-center justify-center gap-2 rounded-[6px] px-[18px] text-ui font-bold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60";
export const solid = cx(button, "h-12 cursor-pointer border-0 bg-brand text-white hover:bg-brand-deep");
export const outline = cx(button, "h-12 cursor-pointer border border-solid border-sand bg-white text-brand hover:bg-cream");
export const field =
  "block h-[52px] w-full rounded-[6px] border border-solid border-sand bg-white px-[14px] font-body text-ui text-espresso transition-colors placeholder:text-taupe placeholder:opacity-100 hover:border-taupe focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
export const label = "grid min-w-0 gap-1.5 text-meta font-bold text-espresso";
export const muted = "text-meta text-taupe";
export const errorText = "text-meta text-danger";
export const heading = "font-serif text-h3 text-espresso";
export const panel = "grid content-start gap-4 rounded-[6px] bg-cream p-6 max-[701px]:p-4";
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
          <span className="shrink-0 tabular-nums">{money(item.lineTotalPaise)}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuoteTotals({ quote, totalPaise, methodLabel }: { quote: Quote; totalPaise: number; methodLabel?: string }) {
  const row = "flex justify-between gap-4";
  return (
    <dl className="m-0 grid gap-2 text-ui text-espresso">
      <div className={row}>
        <dt>Subtotal</dt>
        <dd className="m-0 tabular-nums">{money(quote.subtotalPaise)}</dd>
      </div>
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
        <dd className="m-0 tabular-nums">{money(quote.shippingPaise)}</dd>
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
