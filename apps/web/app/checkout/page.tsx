import { readCheckoutAvailability } from "./availability";
import { CheckoutClosed } from "./checkout-closed";
import { CheckoutFlow } from "./checkout-flow";
import type { CheckoutOptions } from "./checkout-client";
import { CheckoutShell } from "@/components/store/checkout-shell";
// Availability is read from the API on every request; it must never be baked in at build time.
export const dynamic = "force-dynamic";

/**
 * Local development only: `/checkout?preview=design` shows the details step with sample delivery methods while the API
 * keeps checkout closed, so the layout can be reviewed. Continuing fails as the closed API refuses it; production builds
 * never take this path.
 */
async function designPreview(searchParams: Promise<{ preview?: string | string[] }> | undefined): Promise<CheckoutOptions | null> {
  if (process.env.NODE_ENV === "production" || (await searchParams)?.preview !== "design") return null;
  return { deliveryMethods: [{ id: "standard", label: "Home delivery" }, { id: "pickup", label: "Store pickup" }], paymentKeyId: "rzp_test_designpreview" };
}

export default async function CheckoutPage({ searchParams }: { searchParams?: Promise<{ preview?: string | string[] }> } = {}) {
  const options = (await readCheckoutAvailability()) ?? (await designPreview(searchParams));
  if (!options) return <CheckoutClosed />;
  return (
    <CheckoutShell>
      <CheckoutFlow options={options} />
    </CheckoutShell>
  );
}
