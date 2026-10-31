"use client";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useShop } from "@/components/shop-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import dynamic from "next/dynamic";

// The cart drawer loads on demand, keeping it out of every page's first-load JavaScript.
const CartDrawer = dynamic(() => import("@/components/cart").then((module) => module.CartDrawer));
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
  return (
    <>
      <Header siteChrome={siteChrome} />
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
