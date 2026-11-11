import type { ReactNode } from "react";
import { CheckoutChrome } from "@/components/store/checkout-chrome";
import { getPublishedContent } from "@/lib/content";

/** The account pages wear the minimal shell ("Your Maple account"), drawn here so no other page carries it. */
export default async function SignedInAccountLayout({ children }: { children: ReactNode }) {
  return <CheckoutChrome kind="account" siteChrome={(await getPublishedContent()).siteChrome}>{children}</CheckoutChrome>;
}
