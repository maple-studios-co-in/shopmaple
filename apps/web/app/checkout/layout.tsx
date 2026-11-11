import type { ReactNode } from "react";
import { CheckoutChrome } from "@/components/store/checkout-chrome";
import { getPublishedContent } from "@/lib/content";
// The checkout shares the account pages' sheet (Figma 394:1310 beside 392:1255: the same fields, buttons and panels).
import "@/styles/account.css";
// The screens after payment (Figma 392:1752 and 392:1806), on the same sheet's words and buttons.
import "@/styles/checkout-result.css";

/** The checkout wears the minimal shell (Figma 394:1310), drawn here so no other page carries it. */
export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  return <CheckoutChrome kind="checkout" siteChrome={(await getPublishedContent()).siteChrome}>{children}</CheckoutChrome>;
}
