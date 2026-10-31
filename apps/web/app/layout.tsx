import type { Metadata } from "next";
import "@/styles/shopify-fonts.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "./globals.css";
import "@/styles/home-parity.css";
import "@/styles/motion-rail.css";
import "@/styles/content-pages.css";
import "@/styles/campaign-banners.css";
import "@/styles/product-parity.css";
import "@/styles/contact-parity.css";
import "@/styles/collection-parity.css";
import "@/styles/landing-parity.css";
import "@/components/legacy-chairs.css";
import "@/styles/navigation-parity.css";
import "@/styles/site-chrome.css";
import "@/styles/suggested-pages.css";
import "@/styles/search-dialog.css";
import "@/styles/campaign-banners.css";
import "@/styles/home-ticker.css";
import "@/styles/home-rails.css";
import "@/styles/storefront-interactions.css";
import "@/styles/checkout.css";
// Last, so a utility beats the legacy storefront rules it replaces.
import "@/styles/tailwind.css";
import { ShopProvider } from "@/components/shop-provider";
import { StoreChrome } from "@/components/admin/store-chrome";
import { getPublishedContent } from "@/lib/content";
import { ProductHighlightsProvider } from "@/components/store/product-highlights";
export const metadata: Metadata = {
  title: { default: "Maple Furnishers", template: "%s | Maple Furnishers" },
  description: "Explore Maple furniture for your home.",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { siteChrome, productHighlights } = await getPublishedContent();
  return (
    <html lang="en">
      <body>
        <ShopProvider>
          <ProductHighlightsProvider value={productHighlights}>
            <StoreChrome siteChrome={siteChrome}>{children}</StoreChrome>
          </ProductHighlightsProvider>
        </ShopProvider>
      </body>
    </html>
  );
}
