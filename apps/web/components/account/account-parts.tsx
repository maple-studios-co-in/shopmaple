import Link from "next/link";
import type { ReactNode } from "react";
import type { AccountAddress } from "@shopmaple/contracts/account";
import { stateName } from "@/lib/account/format";

// Pieces the account pages share (Figma 392:1255, 392:1338, 392:1432). Styles: styles/account.css, scoped to `.account`.

/** Every account page opens the same way: MY ACCOUNT, the page's line, then its lead. */
export function AccountHeading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="account-heading">
      <p className="account-eyebrow">My account</p>
      <h1 className="account-title">{title}</h1>
      {lead ? <p className="account-lead">{lead}</p> : null}
    </div>
  );
}

/** A piece's photo, filling its frame; a plain frame when the catalogue has none. Only this site's own files and https
 * photos are drawn. The piece's name is printed beside it, so the photo itself is decorative. */
export function OrderPhoto({ src }: { src: string | null; slot?: number }) {
  const safe = src && (src.startsWith("https://") || (src.startsWith("/") && !src.startsWith("//"))) ? src : null;
  if (!safe) return <span className="account-photo" data-empty="" aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- catalogue photos from any of the store's hosts, sized by CSS
    <img className="account-photo" src={safe} alt="" loading="lazy" decoding="async" />
  );
}

/** "14 Palm Avenue, Apartment 402" then "Bengaluru, Karnataka 560001". */
export function addressLines(address: Pick<AccountAddress, "line1" | "line2" | "city" | "state" | "pin">) {
  return [address.line2 ? `${address.line1}, ${address.line2}` : address.line1, `${address.city}, ${stateName(address.state)} ${address.pin}`];
}

/** Lines of text, one under another, as the frames set addresses and contact details. */
export function Lines({ lines, className }: { lines: ReactNode[]; className?: string }) {
  return (
    <p className={className}>
      {lines.map((line, index) => (
        <span key={index} className="account-line">
          {line}
        </span>
      ))}
    </p>
  );
}

/** When the API cannot be reached: nothing about the account is guessed. */
export function AccountProblem({ retry }: { retry: string }) {
  return (
    <div className="account account-problem" data-store>
      <section className="account-notice" role="alert">
        <h1 className="account-notice-title">We couldn’t load your account</h1>
        <p className="account-muted">Please try again in a moment. Your orders and details are safe.</p>
        <div className="account-buttons">
          <Link className="account-cta" data-fill-button="" href={retry}>
            Try again
          </Link>
          <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href="/contact">
            Contact our team
          </Link>
        </div>
      </section>
    </div>
  );
}
