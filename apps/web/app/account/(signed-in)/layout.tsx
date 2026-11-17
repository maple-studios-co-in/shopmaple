import type { ReactNode } from "react";
import { CheckoutChrome } from "@/components/store/checkout-chrome";
import { getPublishedContent } from "@/lib/content";
import { resolveChromeArtwork } from "@/lib/chrome-artwork-resolve";

/** The account pages wear the minimal shell ("Your Maple account"), drawn here so no other page carries it. */
export default async function SignedInAccountLayout({ children }: { children: ReactNode }) {
  const content = await getPublishedContent();
  return <CheckoutChrome kind="account" siteChrome={content.siteChrome} logo={resolveChromeArtwork(content.templateMedia).logo}>{children}</CheckoutChrome>;
}
