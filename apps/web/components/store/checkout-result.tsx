"use client";
import Link from "next/link";
import { useId } from "react";
import { linePhoto, type CheckoutAttempt } from "@/app/checkout/checkout-client";
import { estimatedArrival } from "@/app/checkout/delivery-estimate";
import { firstName, formatDayRange } from "@/lib/account/format";
import { money } from "@/lib/format";
import { ProductImage } from "./product-image";

// The screens after Razorpay's window (Figma 392:1752 "Payment Success", 392:1806 "Payment Failure" and 459:1337 "Payment
// Pending"): the message beside the order card, inside the checkout shell. Styles: styles/checkout-result.css.

/** Why the failure screen shows: a try failed in Razorpay's window, or the window was closed without one. */
export type PaymentShortfall = "failed" | "dismissed";
/** Photos by the cart's variant ids (the store's own). Capture empties the cart, so the flow remembers them when payment starts. */
export type ResultPhotos = Record<string, string>;

/**
 * The reference a buyer quotes about a payment that did not go through: "PAY-10482" for order MF-10482 and, before the
 * order has a number, the first eight characters of the checkout attempt ("PAY-0B8E1C3A").
 */
export function paymentReference(attempt: Pick<CheckoutAttempt, "id" | "orderNumber">) {
  const digits = attempt.orderNumber?.replace(/\D/g, "") ?? "";
  return `PAY-${digits || attempt.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

const variantOf = (variant: string) => (variant && variant !== "Default Title" ? variant : "");
const pieceNote = (variant: string, quantity: number) => [variantOf(variant), `Quantity ${quantity}`].filter(Boolean).join(" · ");

/**
 * The order beside the message (Figma "Order summary"): one line pictured large, several as a list of small photos,
 * then the totals as the quote gave them.
 */
function OrderCard({ title, attempt, photos, photoSizes, totalLabel }: {
  title: string; attempt: CheckoutAttempt; photos: ResultPhotos; photoSizes: string; totalLabel: string;
}) {
  const id = useId();
  const quote = attempt.quote ?? null;
  const items = quote?.items ?? [];
  const only = items.length === 1 ? items[0] : undefined;
  return (
    <aside className="checkout-result-card" aria-labelledby={`${id}-card`}>
      <h2 id={`${id}-card`} className="checkout-result-card-title">{title}</h2>
      {only ? (
        <>
          <div className="checkout-result-photo">
            {/* The card's one large picture, shown whole (the frame's 300px "Product photography"). */}
            <ProductImage src={linePhoto(only, (id) => photos[id])} alt="" fill sizes={photoSizes} loading="eager" fetchPriority="high" />
          </div>
          <p className="checkout-result-piece">{only.title}</p>
          <p className="checkout-result-meta">{pieceNote(only.variantTitle, only.quantity)}</p>
        </>
      ) : items.length > 1 ? (
        <ul className="checkout-result-lines">
          {items.map((item) => (
            <li key={item.variantId} className="checkout-result-line">
              <span className="checkout-result-thumb">
                <ProductImage src={linePhoto(item, (id) => photos[id])} alt="" fill sizes="(max-width: 1440px) 68px, 5vw" />
              </span>
              <span className="checkout-result-line-text">
                <span className="checkout-result-line-title">{item.title}</span>
                <span className="checkout-result-meta">{pieceNote(item.variantTitle, item.quantity)}</span>
              </span>
              {/* Before any code's discount, which the totals take off as one line. */}
              <span className="checkout-result-line-price">{money(item.lineTotalPaise + (item.discountPaise ?? 0))}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="checkout-result-totals">
        {quote ? (
          <>
            <div><dt>Subtotal</dt><dd>{money(quote.subtotalPaise + (quote.promotion?.discountPaise ?? 0))}</dd></div>
            {quote.promotion ? (
              <div data-discount-line=""><dt>Discount ({quote.promotion.code})</dt><dd>−{money(quote.promotion.discountPaise)}</dd></div>
            ) : null}
            <div><dt>Delivery</dt><dd>{quote.shippingPaise ? money(quote.shippingPaise) : "Free"}</dd></div>
            {quote.gstMode === "excluded" ? <div><dt>GST</dt><dd>{money(quote.taxPaise)}</dd></div> : null}
          </>
        ) : null}
        <div className="checkout-result-total"><dt>{totalLabel}</dt><dd>{money(attempt.amountPaise)}</dd></div>
      </dl>
      {/* Worded as the checkout's own summary words GST (checkout-details.tsx). */}
      {quote ? <p className="checkout-result-fine">{quote.gstMode === "included" ? "Inclusive of applicable taxes" : "GST is added as shown"}</p> : null}
    </aside>
  );
}

/**
 * Payment received and the order confirmed (Figma 392:1752). "View order details" opens the order in a signed-in
 * customer's account once it has Maple's number, and the order status page for anyone else.
 */
export function PaymentSuccess({ attempt, customer, photos, signedIn, now }: {
  attempt: CheckoutAttempt;
  /** Who ordered, from the checkout's details. */
  customer: { name: string; email: string } | null;
  photos: ResultPhotos;
  signedIn: boolean;
  /** When the estimate is counted from; today. */
  now?: Date;
}) {
  const id = useId();
  const quote = attempt.quote ?? null;
  const arrival = quote ? estimatedArrival(quote, now ?? new Date()) : null;
  const number = attempt.orderNumber ?? attempt.orderReference;
  const pieces = quote?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const name = firstName(customer?.name ?? null);
  const orderHref = signedIn && attempt.orderNumber ? `/account/orders/${attempt.orderNumber}` : `/orders/${attempt.id}`;
  return (
    <section className="checkout-result" data-payment-result="success" aria-labelledby={`${id}-title`}>
      <div className="checkout-result-message">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img className="checkout-result-icon" src="/account/payment-success.svg" alt="" width={64} height={64} />
        <p className="checkout-result-eyebrow">Payment received</p>
        <h1 id={`${id}-title`} className="checkout-result-title" tabIndex={-1} data-checkout-result-heading="">
          <span>Something beautiful</span> <span>is on its way.</span>
        </h1>
        <p className="checkout-result-lead">
          {name ? `Thank you, ${name}.` : "Thank you."} Your order is confirmed.
          {customer ? ` We’ve sent the details to ${customer.email}.` : null}
        </p>
        {number ? <p className="checkout-result-pill">Order #{number}</p> : null}
        <p className="checkout-result-label">Estimated delivery</p>
        {arrival ? (
          <p className="checkout-result-figure" data-estimate="">{formatDayRange(arrival.from, arrival.to, { month: "long" })}</p>
        ) : (
          <p className="checkout-result-lead" data-estimate="">We’ll confirm the delivery date with you.</p>
        )}
        <div className="checkout-result-actions">
          <Link className="account-cta" data-fill-button="" href={orderHref}>View order details</Link>
          <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href="/collections/all">Continue shopping</Link>
        </div>
      </div>
      <OrderCard title={`Your ${pieces > 1 ? "pieces" : "piece"}, thoughtfully chosen.`} attempt={attempt} photos={photos} totalLabel="Total paid"
        photoSizes="(max-width: 999px) 90vw, 35vw" />
    </section>
  );
}

/**
 * Payment not taken (Figma 392:1806): a try failed in Razorpay's window ("Payment failed"), or the buyer closed the window
 * without one ("Payment not completed"). The attempt, its stock hold and the details stay; both buttons open Razorpay's
 * window again for the same attempt, where the buyer may also pick another way to pay. Nothing here says money was taken.
 */
export function PaymentFailure({ attempt, reason, photos, busy, notice, onRetry, onChooseMethod }: {
  attempt: CheckoutAttempt;
  reason: PaymentShortfall;
  photos: ResultPhotos;
  /** True while a payment window is being opened or is open. */
  busy: boolean;
  /** A problem reopening payment, in the checkout's words. */
  notice?: string;
  onRetry: () => void;
  onChooseMethod: () => void;
}) {
  const id = useId();
  const failed = reason === "failed";
  return (
    <section className="checkout-result" data-payment-result="failed" data-payment-reason={reason} aria-labelledby={`${id}-title`}>
      <div className="checkout-result-message">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img className="checkout-result-icon" src="/account/payment-failed.svg" alt="" width={64} height={64} />
        <p className="checkout-result-eyebrow">Payment incomplete</p>
        <h1 id={`${id}-title`} className="checkout-result-title" tabIndex={-1} data-checkout-result-heading="">
          {failed ? "Payment didn’t go through." : "Payment wasn’t completed."}
        </h1>
        <p className="checkout-result-lead">
          {failed ? "We couldn’t confirm your payment." : "The secure payment window was closed."} Your bag and delivery details are saved.
        </p>
        <p className="checkout-result-pill">{failed ? "Payment failed" : "Payment not completed"}</p>
        <p className="checkout-result-figure">{`Amount to pay · ${money(attempt.amountPaise)}`}</p>
        <p className="checkout-result-help">
          {failed ? "If money was debited, check the payment status before trying again. " : "You can try again whenever you’re ready. "}
          Contact us with reference <span className="checkout-result-reference">{paymentReference(attempt)}</span> if you need help.
        </p>
        {notice ? <p className="account-field-error" role="alert">{notice}</p> : null}
        <div className="checkout-result-actions">
          <button type="button" className="account-cta" data-fill-button="" disabled={busy} onClick={onRetry}>Try payment again</button>
          <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" disabled={busy} onClick={onChooseMethod}>
            Choose another method
          </button>
        </div>
        <p className="checkout-result-links">
          <Link href={`/orders/${attempt.id}`}>Check payment status</Link>
          <span aria-hidden="true">·</span>
          <Link href="/contact">Get help</Link>
        </p>
      </div>
      <OrderCard title="Your bag is saved." attempt={attempt} photos={photos} totalLabel="Total to pay" photoSizes="(max-width: 999px) 60vw, 20vw" />
    </section>
  );
}

/** "Contact support" opens the contact form at the enquiry, about this payment. */
export const paymentSupportHref = (reference: string) => `/contact?${new URLSearchParams({ product: `Payment ${reference}` })}#contact-enquiry`;

/** What the buyer's last "Check payment status" found: the store answered that the payment is still unconfirmed, or the
 * store could not be reached. */
export type PaymentCheck = { at: Date; outcome: "pending" | "error" };

const clock = (at: Date) => at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * Payment made but not yet confirmed (Figma 459:1337): Razorpay's window reported a payment that the store has not
 * confirmed yet, or confirmation took longer than the checkout waits. The attempt, its stock hold and the details stay,
 * and the buyer is asked not to pay twice. "Check payment status" asks the store again at once (`onCheck`); "View order
 * status" and the full checkout reference lead back to the order after the page is left. The store emails the buyer when
 * the payment is confirmed.
 */
export function PaymentPending({ attempt, photos, checking, lastCheck, watching, onCheck }: {
  attempt: CheckoutAttempt;
  photos: ResultPhotos;
  /** True while a check the buyer asked for is under way. */
  checking: boolean;
  /** What the buyer's last check found; null before any. */
  lastCheck: PaymentCheck | null;
  /** True while the checkout still asks the store on its own; once its watch ends, nothing promises more checks. */
  watching: boolean;
  onCheck: () => void;
}) {
  const id = useId();
  const reference = paymentReference(attempt);
  const answer = !lastCheck || checking
    ? ""
    : lastCheck.outcome === "error"
      ? "We couldn’t check just now. Please try again in a moment."
      : `Still awaiting confirmation at ${clock(lastCheck.at)}. ${watching ? "We’ll keep checking." : "Check again any time."}`;
  return (
    <section className="checkout-result" data-payment-result="pending" aria-labelledby={`${id}-title`}>
      <div className="checkout-result-message">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img className="checkout-result-icon" src="/account/payment-pending.svg" alt="" width={64} height={64} />
        <p className="checkout-result-eyebrow">Payment in progress</p>
        <h1 id={`${id}-title`} className="checkout-result-title" tabIndex={-1} data-checkout-result-heading="">
          We’re checking your payment.
        </h1>
        <p className="checkout-result-lead">Our store is confirming your payment. Your order details are saved.</p>
        <p className="checkout-result-pill">Awaiting confirmation</p>
        <p className="checkout-result-figure">{`Payment amount · ${money(attempt.amountPaise)}`}</p>
        <p className="checkout-result-help">
          Please don’t pay again while we verify this transaction. We’ll email you as soon as the payment status is confirmed.
        </p>
        <div className="checkout-result-actions">
          <button type="button" className="account-cta" data-fill-button="" disabled={checking} aria-busy={checking || undefined} onClick={onCheck}>
            {checking ? "Checking…" : "Check payment status"}
          </button>
          <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href={paymentSupportHref(reference)}>Contact support</Link>
        </div>
        {/* The answer to the buyer's own check. Always mounted, so screen readers hear it when it fills in. */}
        <p className="checkout-result-checked" role="status">{answer}</p>
        <p className="checkout-result-links">
          <Link href={`/orders/${attempt.id}`}>View order status</Link>
        </p>
        <p className="checkout-result-ref">
          Payment reference · <span className="checkout-result-reference">{reference}</span>
        </p>
        <p className="checkout-result-ref">
          Checkout reference · <span className="checkout-result-checkout-id">{attempt.id}</span>
        </p>
      </div>
      <OrderCard title="Your order is on hold." attempt={attempt} photos={photos} totalLabel="Payment pending" photoSizes="(max-width: 999px) 60vw, 20vw" />
    </section>
  );
}
