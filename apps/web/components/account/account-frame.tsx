import Link from "next/link";
import type { ReactNode } from "react";
import { firstName } from "@/lib/account/format";
import { previewHref } from "@/lib/account/preview";
import { SignOutButton } from "./sign-out-button";

export type AccountSection = "overview" | "orders" | "addresses" | "details";
const sections: Array<[AccountSection, string, string]> = [
  ["overview", "Overview", "/account"],
  ["orders", "My orders", "/account/orders"],
  ["addresses", "Saved addresses", "/account/addresses"],
  ["details", "Account details", "/account/details"],
];

/**
 * A signed-in account page (Figma 392:1255): the account navigation on the left, the page on the right. On a phone the
 * navigation becomes a compact strip above the page. `subpage` marks a page below a section (an order below My orders).
 */
export function AccountFrame({ active, name, preview = false, subpage = false, children }: {
  active: AccountSection;
  name: string | null;
  preview?: boolean;
  subpage?: boolean;
  children: ReactNode;
}) {
  const first = firstName(name);
  return (
    <div className="account" data-store>
      <div className="account-layout">
        <aside className="account-nav" aria-label="Your account">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img className="account-nav-icon" src="/account/user.svg" alt="" width={40} height={40} />
          <p className="account-nav-hello">{first ? `Hello, ${first}.` : "Hello."}</p>
          <p className="account-nav-note">Your Maple account</p>
          <hr className="account-nav-rule" />
          <nav aria-label="Account">
            <ul className="account-nav-links">
              {sections.map(([key, label, path]) => (
                <li key={key}>
                  <Link className="account-nav-link" href={previewHref(path, preview)}
                    aria-current={active === key ? (subpage ? "true" : "page") : undefined}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <SignOutButton preview={preview} />
        </aside>
        <div className="account-main">{children}</div>
      </div>
    </div>
  );
}
