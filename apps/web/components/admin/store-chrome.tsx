"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart";
import { WhatsAppLink } from "@/components/whatsapp-link";
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
      <CartDrawer />
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
