"use client";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useShop } from "@/components/shop-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import dynamic from "next/dynamic";

// The cart drawer loads on demand, keeping it out of every page's first-load JavaScript.
const CartDrawer = dynamic(() => import("@/components/cart").then((module) => module.CartDrawer));

/** /checkout, /account and /orders, and the pages below them, wear the minimal shell (owner, 10 Nov 2026); "/accounting"
 * or "/orders-and-returns" would not. Their own layouts draw it (`CheckoutChrome`, in components/store), so this chrome,
 * which every page loads, only steps aside there. Development previews (/previews, e.g. the WhatsApp message) draw
 * their whole page themselves. */
export function minimalChrome(path: string | null): "checkout" | "account" | "preview" | null {
  const section = path?.split("/")[1];
  if (section === "previews") return "preview";
  return section === "account" ? "account" : section === "checkout" || section === "orders" ? "checkout" : null;
}
import { WhatsAppLink } from "@/components/whatsapp-link";

/** Mounts the cart drawer the first time the cart opens: a lazy component that renders at all is fetched during hydration. */
function CartDrawerOnDemand() {
  const { cartOpen } = useShop();
  const [cartOpened, setCartOpened] = useState(false);
  if (cartOpen && !cartOpened) setCartOpened(true);
  return cartOpened && <CartDrawer />;
}
import type { SiteChrome } from "@shopmaple/contracts";
export function StoreChromeView({
  path,
  children,
  siteChrome,
}: {
  path: string | null;
  siteChrome?: SiteChrome;
  children: ReactNode;
}) {
  // The staff preview frame renders the draft's own chrome inside the page.
  if (path?.startsWith("/admin/preview-frame/")) return <>{children}</>;
  if (path === "/admin" || path?.startsWith("/admin/"))
    return <main id="main">{children}</main>;
  // The checkout and account shell is drawn by those sections' layouts (app/checkout, app/account, app/orders).
  if (minimalChrome(path)) return <>{children}</>;
  // Product pages keep the header pinned to the top (owner, 10 Nov 2026).
  const product = Boolean(path?.startsWith("/products/"));
  return (
    <>
      <Header siteChrome={siteChrome} sticky={product} />
      <main id="main">{children}</main>
      <Footer siteChrome={siteChrome} />
      <CartDrawerOnDemand />
      <WhatsAppLink siteChrome={siteChrome} />
    </>
  );
}
export function StoreChrome({
  children,
  siteChrome,
}: {
  children: ReactNode;
  siteChrome?: SiteChrome;
}) {
  return (
    <StoreChromeView path={usePathname()} siteChrome={siteChrome}>
      {children}
    </StoreChromeView>
  );
}
