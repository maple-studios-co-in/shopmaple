import { readCheckoutAvailability } from "./availability";
import { CheckoutClosed } from "./checkout-closed";
import { CheckoutFlow, CheckoutSection } from "./checkout-flow";
// Availability is read from the API on every request; it must never be baked in at build time.
export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout", robots: { index: false, follow: false } };
export default async function CheckoutPage() {
  const options = await readCheckoutAvailability();
  if (!options) return <CheckoutClosed />;
  return (
    <CheckoutSection>
      <CheckoutFlow options={options} />
    </CheckoutSection>
  );
}
