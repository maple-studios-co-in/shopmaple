import type { Metadata } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/red-hat-display/400.css";
import "@fontsource/red-hat-display/500.css";
import "@fontsource/red-hat-display/600.css";
import "@fontsource/red-hat-display/800.css";
import "./globals.css";
import "@/styles/home-parity.css";
import "@/styles/product-parity.css";
import "@/styles/contact-parity.css";
import "@/styles/collection-parity.css";
import "@/styles/landing-parity.css";
import { ShopProvider } from "@/components/shop-provider";
import { Header } from "@/components/header";
import { CartDrawer } from "@/components/cart";
import { Footer } from "@/components/footer";
export const metadata: Metadata = {
  title: { default: "Maple Furnishers", template: "%s | Maple Furnishers" },
  description: "Explore Maple furniture for your home.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ShopProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
          <aside className="preview-note" aria-label="Preview status">
            Development preview · Checkout unavailable
          </aside>
        </ShopProvider>
      </body>
    </html>
  );
}
