import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SiteChrome } from "@shopmaple/contracts";
import { defaultSiteChrome } from "@/lib/site-chrome-defaults";

const policies = [
  ["Refund policy", "/policies/refund-policy"],
  ["Shipping policy", "/policies/shipping-policy"],
  ["Privacy policy", "/policies/privacy-policy"],
  ["Terms of service", "/policies/terms-of-service"],
] as const;

/**
 * The checkout and account shell (owner, 10 Nov 2026; Figma 394:1310 and 392:1255) for /checkout, /account and /orders:
 * the brand bar, then "Continue shopping", the logo and a lock in place of the site header; a small policies footer at
 * the end. No cart drawer, Contact us button or menu. Each section's layout draws it with `CheckoutChrome`, on the
 * server; the store chrome steps aside on those paths and carries none of it, so no other page's JavaScript does either.
 * Styles: styles/checkout.css (loaded by the root layout), scoped to `.chrome`.
 */
export function CheckoutChrome({ kind, siteChrome, children }: { kind: "checkout" | "account"; siteChrome?: SiteChrome; children: ReactNode }) {
  return (
    <div className="chrome" data-checkout-chrome={kind}>
      <CheckoutChromePart part="header" kind={kind} siteChrome={siteChrome} />
      <main id="main" className="chrome-main">{children}</main>
      <CheckoutChromePart part="footer" kind={kind} />
    </div>
  );
}

/** One part of the shell: its header (with the brand bar) or its footer. */
export function CheckoutChromePart({ part, kind, siteChrome = defaultSiteChrome }: { part: "header" | "footer"; kind: "checkout" | "account"; siteChrome?: SiteChrome }) {
  if (part === "footer")
    return (
      <footer className="chrome-footer">
        <p className="chrome-copyright">© Maple Furnishers</p>
        <nav aria-label="Store policies">
          <ul className="chrome-policies">
            {policies.map(([label, href]) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </footer>
    );
  const { announcement } = siteChrome;
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {announcement.enabled && announcement.text ? (
        <p className="chrome-brand" data-brand-bar="">
          {announcement.text}
        </p>
      ) : null}
      <header className="chrome-header">
        <Link href="/collections/all" className="chrome-back">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img src="/account/arrow-left.svg" alt="" width={18} height={18} />
          <span className="chrome-label">Continue shopping</span>
        </Link>
        <Link href="/" className="chrome-logo" aria-label="Maple Furnishers home">
          {/* The site header's logo file, painted as it comes (no resizer), as the header does. */}
          <Image src="/media/footer/maple-logo.webp" width={1080} height={500} alt="Maple Furnishers" unoptimized />
        </Link>
        <p className="chrome-secure">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img src="/account/lock.svg" alt="" width={18} height={18} />
          <span className="chrome-label">{kind === "account" ? "Your Maple account" : "Secure checkout"}</span>
        </p>
      </header>
    </>
  );
}
