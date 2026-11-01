import type { Metadata } from "next";
import { connection } from "next/server";
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
import "@/styles/policy-page.css";
import "@/styles/search-dialog.css";
import "@/styles/campaign-banners.css";
import "@/styles/home-ticker.css";
import "@/styles/home-rails.css";
import "@/styles/home-impact.css";
import "@/styles/storefront-interactions.css";
import "@/styles/checkout.css";
// Last, so a utility beats the legacy storefront rules it replaces.
import "@/styles/tailwind.css";
import { ShopProvider } from "@/components/shop-provider";
import { StoreChrome } from "@/components/admin/store-chrome";
import { getPublishedContent } from "@/lib/content";
import { ProductHighlightsProvider } from "@/components/store/product-highlights";
import { JsonLd } from "@/components/store/json-ld";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { organizationStructuredData, seoSettings, siteMetadata, websiteStructuredData } from "@/lib/seo";
// Read at request time (never baked in at build): the store stays out of search until SEO_INDEXING=on at launch.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return siteMetadata(seoSettings(process.env));
}
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { siteChrome, productHighlights } = await getPublishedContent();
  const seo = seoSettings(process.env);
  return (
    <html lang="en">
      <body>
        <JsonLd data={[organizationStructuredData(seo, resolveSiteChrome(siteChrome)), websiteStructuredData(seo)]} />
        <ShopProvider>
          <ProductHighlightsProvider value={productHighlights}>
            <StoreChrome siteChrome={siteChrome}>{children}</StoreChrome>
          </ProductHighlightsProvider>
        </ShopProvider>
      </body>
    </html>
  );
}
