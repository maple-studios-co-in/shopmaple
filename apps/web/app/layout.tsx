import type { Metadata } from "next";
import { connection } from "next/server";
// "Maple / Typography" (Figma 180:639): DM Sans Medium for headings and labels, Red Hat Display for reading text.
import "@fontsource-variable/dm-sans/opsz.css";
import "@fontsource-variable/dm-sans/opsz-italic.css";
import "@fontsource/red-hat-display/400.css";
import "@fontsource/red-hat-display/400-italic.css";
import "@fontsource/red-hat-display/500.css";
import "@fontsource/red-hat-display/600.css";
import "@fontsource/red-hat-display/700.css";
import "./globals.css";
import "@/styles/home-parity.css";
import "@/styles/motion-rail.css";
import "@/styles/content-pages.css";
import "@/styles/campaign-banners.css";
import "@/styles/product-parity.css";
import "@/styles/collection-parity.css";
import "@/styles/landing-parity.css";
import "@/styles/navigation-parity.css";
import "@/styles/site-chrome.css";
import "@/styles/suggested-pages.css";
import "@/styles/search-dialog.css";
import "@/styles/campaign-banners.css";
import "@/styles/home-ticker.css";
import "@/styles/home-rails.css";
import "@/styles/home-impact.css";
import "@/styles/home-cities.css";
import "@/styles/home-newsletter.css";
import "@/styles/home-slides.css";
import "@/styles/home-editorial.css";
import "@/styles/storefront-interactions.css";
import "@/styles/checkout.css";
import "@/styles/button-fill.css";
// Big screens: the page grows with the screen from 1600px (owner, 4 Nov 2026); after the sheets it repeats.
import "@/styles/wide-screens.css";
// The header and its menu (Figma 256:3836), 30px between sections everywhere, and review cards that show whole lines
// only (owner, 9 Nov 2026).
import "@/styles/header-menu.css";
import "@/styles/section-rhythm.css";
import "@/styles/review-cards.css";
// Last, so a utility beats the legacy storefront rules it replaces.
import "@/styles/tailwind.css";
import { ButtonEffectsIsland } from "@/components/button-effects-island";
import { ShopProvider } from "@/components/shop-provider";
import { StoreChrome } from "@/components/admin/store-chrome";
import { getPublishedContent } from "@/lib/content";
import { ProductHighlightsProvider } from "@/components/store/product-highlights";
import { JsonLd } from "@/components/store/json-ld";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { resolveMenuArtwork } from "@/lib/menu-artwork";
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
  const content = await getPublishedContent();
  const { siteChrome, productHighlights, templateMedia } = content;
  const seo = seoSettings(process.env);
  return (
    <html lang="en">
      <body>
        <JsonLd data={[organizationStructuredData(seo, resolveSiteChrome(siteChrome)), websiteStructuredData(seo)]} />
        <ShopProvider>
          <ProductHighlightsProvider value={productHighlights}>
            <StoreChrome siteChrome={siteChrome} menuArtwork={resolveMenuArtwork(templateMedia)}>{children}</StoreChrome>
          </ProductHighlightsProvider>
        </ShopProvider>
        <ButtonEffectsIsland />
      </body>
    </html>
  );
}
