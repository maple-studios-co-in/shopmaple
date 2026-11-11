import Link from "next/link";

/** Accounts switched off (`/api/health` → `accountsEnabled: false`): the page the store has shown until now, unchanged.
 * Signed out, the account pages lead to /account/login (Figma 392:1652) instead. */
export function AccountUnavailable() {
  return (
    <section className="editorial-page account-page">
      <h1>Account</h1>
      <p>
        Online account sign-in and order history are not available on this
        storefront yet.
      </p>
      <div className="account-actions">
        <Link href="/contact?product=Order%20support">
          Orders <span>Contact support about an order →</span>
        </Link>
        <Link href="/favourites">
          Wishlist <span>View your saved items →</span>
        </Link>
        <Link href="/contact?product=Account%20support">
          Profile &amp; Addresses{" "}
          <span>Contact support about your details →</span>
        </Link>
      </div>
    </section>
  );
}
