import Link from "next/link";
export default function CheckoutPage() {
  return (
    <section className="empty-state checkout-state">
      <h1>Checkout is not open in this preview</h1>
      <p>
        Your cart is saved. We’re preparing online payments and confirming
        delivery and stock before opening checkout.
      </p>
      <p>No payment has been taken and no order has been placed.</p>
      <div className="button-row">
        <Link className="button" href="/cart">
          Return to cart
        </Link>
        <Link className="button secondary" href="/pages/contact">
          Contact our team
        </Link>
      </div>
    </section>
  );
}
