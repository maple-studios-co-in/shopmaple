import Link from "next/link";
import type { AccountOverview } from "@shopmaple/contracts/account";
import { money } from "@/lib/format";
import { formatDate, itemCount, paddedCount } from "@/lib/account/format";
import { previewHref } from "@/lib/account/preview";
import { AccountHeading, addressLines, Lines, OrderPhoto } from "./account-parts";

/** The account overview (Figma 392:1255): three shortcuts, the latest order, then the customer's details and address. */
export function AccountOverviewView({ overview, preview = false }: { overview: AccountOverview; preview?: boolean }) {
  const { customer, counts, latestOrder, defaultAddress } = overview;
  const href = (path: string) => previewHref(path, preview);
  const shortcuts = [
    { tone: "sage", icon: "box", title: counts.orders ? paddedCount(counts.orders, "order") : "No orders yet", note: "Follow every detail", path: "/account/orders" },
    { tone: "stone", icon: "pin", title: counts.addresses ? paddedCount(counts.addresses, "address", "addresses") : "No addresses yet", note: "Saved for next time", path: "/account/addresses" },
    { tone: "linen", icon: "profile", title: "Your profile", note: "Make it personal", path: "/account/details" },
  ];
  return (
    <>
      <AccountHeading title="A space that’s yours." lead="Your orders, details and favourite corners—all together." />
      <ul className="account-shortcuts">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.path} className="account-shortcut" data-tone={shortcut.tone}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img className="account-shortcut-icon" src={`/account/${shortcut.icon}.svg`} alt="" width={28} height={28} />
            <h2 className="account-shortcut-title">{shortcut.title}</h2>
            <p className="account-shortcut-note">{shortcut.note}</p>
            <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href={href(shortcut.path)} aria-label={`View details: ${shortcut.title}`}>
              View details
            </Link>
          </li>
        ))}
      </ul>
      <section className="account-card account-latest" aria-labelledby="account-latest">
        <h2 id="account-latest" className="account-card-title">Your latest order</h2>
        {latestOrder ? (
          <>
            <div className="account-latest-meta">
              <p className="account-latest-number">{`#${latestOrder.number} · ${formatDate(latestOrder.placedAt)}`}</p>
              <p className="account-latest-status">{latestOrder.statusLabel}</p>
            </div>
            <div className="account-item">
              <OrderPhoto src={latestOrder.firstItem.imageUrl} slot={104} />
              <div className="account-item-text">
                <p className="account-item-title">{latestOrder.firstItem.title}</p>
                {latestOrder.firstItem.variant ? <p className="account-item-meta">{latestOrder.firstItem.variant}</p> : null}
                <p className="account-item-meta">{itemCount(latestOrder.itemCount)}</p>
              </div>
              <p className="account-item-price">{money(latestOrder.totalPaise)}</p>
            </div>
            <Link className="account-cta" data-fill-button="" href={href(`/account/orders/${latestOrder.number}`)}>
              View order
            </Link>
          </>
        ) : (
          <>
            <p className="account-empty-title">No orders yet</p>
            <p className="account-muted">When you order online, your order appears here with every detail, from confirmation to delivery.</p>
            <Link className="account-cta" data-fill-button="" href="/collections/all">
              Explore furniture
            </Link>
          </>
        )}
      </section>
      <div className="account-pair">
        <section className="account-panel" aria-labelledby="account-details">
          <h2 id="account-details" className="account-panel-title">Account details</h2>
          <Lines className="account-panel-text"
            lines={[customer.name ?? <Link key="name" className="account-text-link" href={href("/account/details")}>Add your name</Link>, customer.email]} />
        </section>
        <section className="account-panel" aria-labelledby="account-address">
          <h2 id="account-address" className="account-panel-title">Default delivery address</h2>
          {defaultAddress ? (
            <Lines className="account-panel-text" lines={addressLines(defaultAddress)} />
          ) : (
            <p className="account-panel-text">
              No saved address yet.{" "}
              <Link className="account-text-link" href={href("/account/addresses")}>
                Add one for faster checkout
              </Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
