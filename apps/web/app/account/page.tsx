import Link from "next/link";
export const metadata = { title: "Account" };
export default function AccountPage() {
  return (
    <section className="editorial-page account-page">
      <h1>Account</h1>
      <p>
        Online account sign-in and order history are not available on this
        storefront yet.
      </p>
      <div className="account-actions">
        <Link href="/pages/contact?product=Order%20support">
          Orders <span>Contact support about an order →</span>
        </Link>
        <Link href="/favourites">
          Wishlist <span>View your saved items →</span>
        </Link>
        <Link href="/pages/contact?product=Account%20support">
          Profile &amp; Addresses{" "}
          <span>Contact support about your details →</span>
        </Link>
      </div>
    </section>
  );
}
