"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckoutClientError, createCheckoutClient, type CheckoutAttempt } from "@/app/checkout/checkout-client";
import { buttonRow, heading, muted, outline, panel, QuoteLines, QuoteTotals, solid } from "./checkout-parts";

type View = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; attempt: CheckoutAttempt };

/** What the buyer is told about one checkout. Never claims an order Keeri has not confirmed,
 * and never tells a buyer whose payment Razorpay confirmed that nothing was paid. */
function headline(attempt: CheckoutAttempt): { title: string; body: string } {
  if (attempt.fulfillmentStatus === "confirmed" && attempt.orderReference)
    return { title: "Order confirmed", body: "Your payment has been received and your order is confirmed. Our team will contact you to arrange delivery." };
  if (attempt.state === "paid_hold_lapsed")
    return {
      title: "Your payment has been received",
      body: "We couldn't hold your piece in time, so our team is confirming your order by hand. We'll contact you within one business day, and if we can't confirm it we'll refund in full. You don't need to pay again.",
    };
  if (attempt.paid && attempt.fulfillmentStatus === "review_required")
    return { title: "Your payment has been received", body: "Our team is reviewing this order before confirming it. You don't need to pay again." };
  if (attempt.paid) return { title: "Payment received", body: "We're confirming your order with our team. This usually takes a moment." };
  if (attempt.state === "awaiting_payment")
    return { title: "Waiting for payment", body: "We haven't received a payment confirmation for this checkout yet. If you paid, it will appear here shortly." };
  if (attempt.state === "reconciliation_required")
    return { title: "This checkout needs a check", body: "Our team is reviewing this checkout. Contact us with the reference below if you have questions." };
  return { title: "No payment was taken", body: "No payment was taken for this checkout and no order was placed." };
}

export function OrderStatus({ attemptId, pollIntervalMs = 5000 }: { attemptId: string; pollIntervalMs?: number }) {
  const client = useMemo(() => createCheckoutClient(), []);
  const [view, setView] = useState<View>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const attempt = await client.status(attemptId);
        if (cancelled) return;
        setView({ kind: "ready", attempt });
        // Keep following a paid order until Keeri confirms it or staff take over.
        if (attempt.paid && attempt.fulfillmentStatus === "pending") timer = setTimeout(() => void tick(), pollIntervalMs);
      } catch (error) {
        if (cancelled) return;
        setView({ kind: error instanceof CheckoutClientError && error.kind === "lost" ? "missing" : "error" });
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attemptId, client, pollIntervalMs]);

  const contact = (
    <Link className={outline} href="/pages/contact">
      Contact our team
    </Link>
  );
  let content;
  if (view.kind === "loading") content = <p role="status" className="text-ui text-espresso">Checking your order…</p>;
  else if (view.kind === "missing")
    content = (
      <>
        <h2 className={heading}>We couldn't find this order in this browser</h2>
        <p className="text-ui text-espresso">Order status is shown in the browser that placed the order. Your confirmation email has your order reference.</p>
        <div className={buttonRow}>{contact}</div>
      </>
    );
  else if (view.kind === "error")
    content = (
      <>
        <h2 className={heading}>We couldn't load your order</h2>
        <p className="text-ui text-espresso">Please refresh in a moment. You don't need to pay again.</p>
        <div className={buttonRow}>{contact}</div>
      </>
    );
  else {
    const { attempt } = view;
    const { title, body } = headline(attempt);
    content = (
      <>
        <h2 className={heading}>{title}</h2>
        <p className="text-ui text-espresso">{body}</p>
        <p className="text-ui text-espresso">
          {attempt.orderReference ? (
            <>Order reference <strong>{attempt.orderReference}</strong></>
          ) : (
            <>Checkout reference <strong>{attempt.id}</strong></>
          )}
        </p>
        {attempt.quote && (
          <div className="grid gap-4 rounded-[6px] bg-white p-5">
            <QuoteLines items={attempt.quote.items} />
            <QuoteTotals quote={attempt.quote} totalPaise={attempt.amountPaise} />
          </div>
        )}
        <div className={buttonRow}>
          <Link className={solid} href="/collections/all">
            Continue shopping
          </Link>
          {contact}
        </div>
        <p className={muted}>Questions about delivery? Quote the reference above when you contact us.</p>
      </>
    );
  }
  return (
    <div data-store>
      <section data-order-status aria-live="polite" className={panel}>
        {content}
      </section>
    </div>
  );
}
