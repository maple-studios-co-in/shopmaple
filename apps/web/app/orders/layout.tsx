import type { ReactNode } from "react";
import { CheckoutChrome } from "@/components/store/checkout-chrome";
import { getPublishedContent } from "@/lib/content";

/** A guest's order status page wears the checkout's minimal shell, drawn here so no other page carries it. */
export default async function OrdersLayout({ children }: { children: ReactNode }) {
  return <CheckoutChrome kind="checkout" siteChrome={(await getPublishedContent()).siteChrome}>{children}</CheckoutChrome>;
}
