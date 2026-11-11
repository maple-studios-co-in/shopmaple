"use client";
import { useEffect, useState } from "react";
import { PaymentFailure, PaymentPending, PaymentSuccess } from "@/components/store/checkout-result";
import type { CheckoutAttempt } from "./checkout-client";

// Local development only: the screens after Razorpay's window as Figma 392:1752, 392:1806 and 459:1337 draw them, with the
// quote preview's sample order (quote-preview.tsx). `?preview=success` is the paid order, `?preview=success-multi` the same
// with two pieces, `?preview=failure` a failed try, `?preview=failure-dismissed` a window closed untried and
// `?preview=pending` a payment awaiting confirmation. Nothing here talks to the API; the failure screen's buttons do nothing,
// and the pending screen's "Check payment status" pretends a check that finds the payment still pending.
export type ResultPreviewKind = "success" | "success-multi" | "failure" | "failure-dismissed" | "pending";

const nola = { variantId: "keeri:preview:nola-oak", productId: "keeri:preview:nola", title: "Nola Accent Chair", variantTitle: "Natural cane · Oak finish", sku: null,
  quantity: 1, unitPricePaise: 2490000, lineTotalPaise: 2490000, fulfilment: { kind: "made_to_order" as const, leadTimeDays: 10 } };
const aero = { variantId: "keeri:preview:nimbus-ivory", productId: "keeri:preview:nimbus", title: "Nimbus Modular Sofa", variantTitle: "Ivory bouclé · 4 seater", sku: null,
  quantity: 1, unitPricePaise: 8990000, lineTotalPaise: 8990000, fulfilment: { kind: "made_to_order" as const, leadTimeDays: 10 } };
// The frames' own Nola photograph (Figma 392:1752), and the Nimbus page's sofa.
const photos = { [nola.variantId]: "/media/previews/nola-accent-chair.webp", [aero.variantId]: "/media/nimbus-collection/sofas.webp" };
const customer = { name: "Aditi Sharma", email: "aditi.sharma@example.com" };
const shippingPaise = 150000;

/** The sample order: Aditi's Nola chair (₹24,900 + ₹1,500 delivery = ₹26,400) as order MF-10482, paid or not. */
function sampleAttempt(items: (typeof nola)[], paid: boolean): CheckoutAttempt {
  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  return {
    id: "00000000-0000-4000-8000-000000000000",
    state: paid ? "captured" : "awaiting_payment",
    amountPaise: subtotalPaise + shippingPaise,
    currency: "INR",
    paid,
    providerOrderId: "order_previewresult",
    quote: {
      items,
      delivery: { courierName: "Delhivery Surface", estimatedDays: 4 },
      currency: "INR",
      subtotalPaise,
      shippingPaise,
      // GST included at 18%, as the quote preview counts it.
      taxPaise: Math.round((subtotalPaise * 18) / 118),
      totalPaise: subtotalPaise + shippingPaise,
      gstMode: "included",
      expiresAt: "2099-01-01T10:00:00.000Z",
    },
    fulfillmentStatus: paid ? "confirmed" : "pending",
    orderReference: paid ? "SO-PREVIEW" : null,
    // The frames' order number, and so their reference PAY-10482.
    orderNumber: "MF-10482",
  };
}

/** The pending screen with a pretend check: a moment of "Checking…", then still pending. */
function PendingPreview() {
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!checking) return;
    const timer = setTimeout(() => {
      setChecking(false);
      setCheckedAt(new Date());
    }, 900);
    return () => clearTimeout(timer);
  }, [checking]);
  return <PaymentPending attempt={sampleAttempt([nola], false)} photos={photos} checking={checking} checkedAt={checkedAt} onCheck={() => setChecking(true)} />;
}

export function CheckoutResultPreview({ kind }: { kind: ResultPreviewKind }) {
  return (
    <div data-store data-checkout>
      {kind === "success" || kind === "success-multi" ? (
        <PaymentSuccess attempt={sampleAttempt(kind === "success" ? [nola] : [nola, aero], true)} customer={customer} photos={photos} signedIn={false} />
      ) : kind === "pending" ? (
        <PendingPreview />
      ) : (
        <PaymentFailure attempt={sampleAttempt([nola], false)} reason={kind === "failure" ? "failed" : "dismissed"} photos={photos} busy={false}
          onRetry={() => {}} onChooseMethod={() => {}} />
      )}
    </div>
  );
}
