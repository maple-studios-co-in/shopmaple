import { readCheckoutAvailability } from "./availability";
import { CheckoutClosed } from "./checkout-closed";
import { CheckoutFlow } from "./checkout-flow";
// Availability is read from the API on every request; it must never be baked in at build time.
export const dynamic = "force-dynamic";
export default async function CheckoutPage() {
  const options = await readCheckoutAvailability();
  if (!options) return <CheckoutClosed />;
  return (
    <section className="page-section checkout-page">
      <h1>Checkout</h1>
      <CheckoutFlow options={options} />
    </section>
  );
}
