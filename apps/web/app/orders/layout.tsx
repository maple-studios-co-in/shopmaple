import type { ReactNode } from "react";
import { CheckoutChrome } from "@/components/store/checkout-chrome";
import { getPublishedContent } from "@/lib/content";
import { resolveChromeArtwork } from "@/lib/chrome-artwork-resolve";

/** A guest's order status page wears the checkout's minimal shell, drawn here so no other page carries it. */
export default async function OrdersLayout({ children }: { children: ReactNode }) {
  const content = await getPublishedContent();
  return <CheckoutChrome kind="checkout" siteChrome={content.siteChrome} logo={resolveChromeArtwork(content.templateMedia).logo}>{children}</CheckoutChrome>;
}
