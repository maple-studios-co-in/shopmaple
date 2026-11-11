import type { ReactNode } from "react";

/** The checkout page (Figma 394:1310) inside the checkout shell; its heading and columns come with each step. Styles:
 * styles/account.css, which app/checkout/layout.tsx loads. */
export function CheckoutShell({ children }: { children: ReactNode }) {
  return <section className="checkout-page">{children}</section>;
}
