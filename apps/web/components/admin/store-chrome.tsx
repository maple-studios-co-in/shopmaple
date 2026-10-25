"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart";
import { WhatsAppLink } from "@/components/whatsapp-link";
export function StoreChromeView({
  path,
  children,
}: {
  path: string | null;
  children: ReactNode;
}) {
  if (path === "/admin" || path?.startsWith("/admin/"))
    return <main id="main">{children}</main>;
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <CartDrawer />
      <WhatsAppLink />
      <aside className="preview-note" aria-label="Preview status">
        Development preview · Checkout unavailable
      </aside>
    </>
  );
}
export function StoreChrome({ children }: { children: ReactNode }) {
  return <StoreChromeView path={usePathname()}>{children}</StoreChromeView>;
}
