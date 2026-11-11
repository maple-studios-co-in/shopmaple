import { readCheckoutAccount } from "./account-prefill";
import { readCheckoutAvailability } from "./availability";
import { CheckoutClosed } from "./checkout-closed";
import { CheckoutFlow } from "./checkout-flow";
import { CheckoutQuotePreview } from "./quote-preview";
import { CheckoutResultPreview } from "./result-preview";
import type { CheckoutOptions, CheckoutPrefill } from "./checkout-client";
import { CheckoutShell } from "@/components/store/checkout-shell";
// Availability is read from the API on every request; it must never be baked in at build time.
export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout", robots: { index: false, follow: false } };

const sampleOptions: CheckoutOptions = { deliveryMethods: [{ id: "standard", label: "Home delivery" }, { id: "pickup", label: "Store pickup" }], paymentKeyId: "rzp_test_designpreview" };
const samplePrefill: CheckoutPrefill = { email: "aditi.sharma@example.com", name: "Aditi Sharma", phone: "+919876543210",
  address: { line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", stateCode: "29", pincode: "560001" } };

/**
 * Local development only, while the API keeps checkout closed: `/checkout?preview=design` shows the page with sample
 * delivery methods as a guest sees it, `?preview=signed-in` as a signed-in customer's, filled in, and `?preview=quote`
 * priced, with the delivery charge, the estimate and the total (Figma 394:1310). `?preview=success` and `?preview=failure`
 * show the screens after payment (Figma 392:1752 and 392:1806), `?preview=success-multi` the first with two pieces and
 * `?preview=failure-dismissed` the second for a payment window closed untried. Continuing fails as the closed API
 * refuses it; production builds never take this path.
 */
async function designPreview(searchParams: Promise<{ preview?: string | string[] }> | undefined) {
  if (process.env.NODE_ENV === "production") return null;
  const preview = (await searchParams)?.preview;
  if (preview === "design") return <CheckoutFlow options={sampleOptions} account={{ enabled: true, prefill: null }} />;
  if (preview === "signed-in") return <CheckoutFlow options={sampleOptions} account={{ enabled: true, prefill: samplePrefill }} />;
  if (preview === "quote") return <CheckoutQuotePreview />;
  if (preview === "success" || preview === "success-multi" || preview === "failure" || preview === "failure-dismissed")
    return <CheckoutResultPreview kind={preview} />;
  return null;
}

export default async function CheckoutPage({ searchParams }: { searchParams?: Promise<{ preview?: string | string[] }> } = {}) {
  const live = await readCheckoutAvailability();
  if (live)
    return (
      <CheckoutShell>
        <CheckoutFlow options={live.options} account={await readCheckoutAccount(live.accountsEnabled)} />
      </CheckoutShell>
    );
  const preview = await designPreview(searchParams);
  if (!preview) return <CheckoutClosed />;
  return <CheckoutShell>{preview}</CheckoutShell>;
}
