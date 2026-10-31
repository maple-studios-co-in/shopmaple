import type { Metadata } from "next";
import "@/styles/shopify-fonts.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
// Checkout keeps its own frozen layout sheet until it is rebuilt.
import "@/styles/checkout.css";
// The one stylesheet: tokens, base and utilities, loaded last.
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
