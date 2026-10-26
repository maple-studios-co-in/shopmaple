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
  if (path === "/admin" || path?.startsWith("/admin/"))
    return <main id="main">{children}</main>;
  return (
    <>
      <Header siteChrome={siteChrome} />
      <main id="main">{children}</main>
      <Footer siteChrome={siteChrome} />
      <CartDrawer />
      <WhatsAppLink siteChrome={siteChrome} />
      <aside className="preview-note" aria-label="Preview status">
        Development preview · Checkout unavailable
      </aside>
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
