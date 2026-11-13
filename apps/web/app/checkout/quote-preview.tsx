"use client";
import { useId, useState } from "react";
import { CheckoutDetails } from "@/components/store/checkout-details";
import type { CheckoutAttempt, CheckoutOptions } from "./checkout-client";

// Local development only (`/checkout?preview=quote`): the page as Figma 394:1310 draws it, priced, with the frame's sample
// order. Nothing here talks to the API; the buttons do nothing.
const options: CheckoutOptions = { deliveryMethods: [{ id: "home", label: "Home delivery" }], paymentKeyId: "rzp_test_designpreview" };
const attempt: CheckoutAttempt = {
  id: "00000000-0000-4000-8000-000000000000",
  state: "reservation_required",
  amountPaise: 2640000,
  currency: "INR",
  paid: false,
  providerOrderId: null,
  quote: {
    // Keeri's variant id, and the store's own beside it, as the API gives a piece carried over from the old store.
    items: [{ variantId: "keeri:preview:nola-oak", localVariantId: "preview-40000000000001", productId: "keeri:preview:nola", title: "Nola Accent Chair",
      variantTitle: "Natural cane · Oak finish", sku: null, quantity: 1, unitPricePaise: 2490000, lineTotalPaise: 2490000, fulfilment: { kind: "made_to_order", leadTimeDays: 10 } }],
    delivery: { courierName: "Delhivery Surface", estimatedDays: 4 },
    currency: "INR",
    subtotalPaise: 2490000,
    shippingPaise: 150000,
    taxPaise: 379831,
    totalPaise: 2640000,
    gstMode: "included",
    expiresAt: "2099-01-01T10:00:00.000Z",
  },
};
const defaults = { email: "aditi.sharma@example.com", firstName: "Aditi", lastName: "Sharma", phone: "9876543210",
  shipping: { line1: "14 Palm Avenue, Apartment 402", line2: "", city: "Bengaluru", stateCode: "29", pincode: "560001" }, billing: null };

export function CheckoutQuotePreview() {
  const id = useId();
  const [sameBilling, setSameBilling] = useState(true);
  return (
    <div data-store data-checkout>
      <CheckoutDetails id={id} phase="quote" defaults={defaults} options={options} deliveryMethodId="home" onDeliveryMethod={() => {}}
        sameBilling={sameBilling} onSameBilling={setSameBilling} fieldErrors={{}} problems={[]} notice="" busy={false}
        account={{ enabled: true, prefill: null }} attempt={attempt} photos={{ "preview-40000000000001": "/media/previews/nola-accent-chair.webp" }}
        promoCode="" onPromoCode={() => {}} promoError="" onSubmit={(event) => event.preventDefault()} onPay={() => {}} onEdit={() => {}} onRequote={() => {}} />
    </div>
  );
}
