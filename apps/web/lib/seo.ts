/**
 * Search and answer engine signals for the storefront: whether it may be indexed (one launch
 * switch, off until the store opens), robots rules, the sitemap, page descriptions and
 * schema.org structured data. Pure functions, so every rule is tested without a server.
 */
import type { Metadata, MetadataRoute } from "next";
import { categories, policySlugs, type Product, type SiteChrome } from "@shopmaple/contracts";

export type SeoSettings = { siteUrl: string; indexing: boolean };
const brand = "Maple Furnishers";
const fallbackDescription = "Handcrafted luxury furniture from Maple Furnishers, made to order in Delhi and delivered across India.";

const storeUrl = "https://store.maplefurnishers.com";
/** SEO_INDEXING=on opens the store to search engines; anything else keeps it out. A missing or malformed SITE_URL means the store. */
export function seoSettings(env: Record<string, string | undefined>): SeoSettings {
  const value = env.SITE_URL?.trim() ?? "";
  const valid = /^https?:\/\/[^/\s]/.test(value) && URL.canParse(value);
  return { siteUrl: (valid ? value : storeUrl).replace(/\/+$/, ""), indexing: env.SEO_INDEXING === "on" };
}
export const absolute = (settings: SeoSettings, path: string) => /^https?:\/\//.test(path) ? path : `${settings.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;

/** Pages with no value in search: staff, the API, and each visitor's own cart, checkout, account and saved items. */
const privatePaths = ["/admin", "/api", "/cart", "/checkout", "/account", "/favourites"];
/**
 * Crawlers may read every page except the API, so they see the noindex on pages that must stay
 * out (a page blocked here can still be listed from links elsewhere, with no way to drop it).
 * Answer engines (GPTBot, PerplexityBot, Google-Extended...) follow the same rule.
 */
export function robotsRules(settings: SeoSettings): MetadataRoute.Robots {
  const rules = { userAgent: "*", allow: "/", disallow: ["/api/"] };
  return settings.indexing ? { rules: [rules], sitemap: absolute(settings, "/sitemap.xml") } : { rules: [rules] };
}
/** The X-Robots-Tag for a response: everything until launch, private pages always. It also covers media and error pages. */
export function robotsHeader(settings: SeoSettings, path: string): string | null {
  const isPrivate = privatePaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return !settings.indexing || isPrivate ? "noindex, nofollow" : null;
}
export const robotsMeta = (settings: SeoSettings) => ({ index: settings.indexing, follow: settings.indexing });

/** Pages that always exist, beside products, content pages, policies and articles. */
const fixedPages = ["/", "/collections/all", ...categories.map((category) => `/collections/${category}`),
  "/pages/sofas", "/pages/tables", "/pages/chairs", "/pages/our-story", "/pages/nimbus-collection",
  "/pages/contact", "/pages/bulk-enquiry", "/pages/returns", "/blogs/recent-stories"];
export function sitemapEntries(settings: SeoSettings, input: {
  products: Product[]; pages: string[]; policies: string[]; articles: { blog: string; handle: string }[];
}): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    ...fixedPages.map((path) => ({ url: absolute(settings, path) })),
    ...input.pages.map((slug) => ({ url: absolute(settings, `/pages/${slug}`) })),
    ...input.policies.filter((slug) => (policySlugs as readonly string[]).includes(slug)).map((slug) => ({ url: absolute(settings, `/policies/${slug}`) })),
    ...input.articles.map((article) => ({ url: absolute(settings, `/blogs/${article.blog}/${article.handle}`) })),
    ...input.products.filter((product) => product.published).map((product) => ({
      url: absolute(settings, `/products/${product.handle}`),
      lastModified: new Date(product.sourceUpdatedAt),
      images: product.images.slice(0, 10).map((image) => absolute(settings, image)),
    })),
  ];
  const seen = new Set<string>();
  return entries.filter((entry) => !seen.has(entry.url) && Boolean(seen.add(entry.url)));
}

/** A search-result description: the page's own words on one line, at most 160 characters. */
export function pageDescription(text: string | null | undefined): string {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  if (!line) return fallbackDescription;
  return line.length <= 160 ? line : `${line.slice(0, 159).trimEnd()}…`;
}

type Variant = Product["variants"][number];
const availability: Record<Variant["stockPolicy"], string> = {
  stocked: "https://schema.org/InStock", made_to_order: "https://schema.org/MadeToOrder",
  dropship: "https://schema.org/InStock", unverified: "https://schema.org/LimitedAvailability",
};
const availabilityOf = (variant: Variant) => variant.available ? availability[variant.stockPolicy] : "https://schema.org/OutOfStock";
/**
 * schema.org Product: one canonical page, its photos and brand, and an offer for each priced option.
 * A product with nothing priced has no Product block (search engines report one without offers as an error).
 */
export function productStructuredData(settings: SeoSettings, product: Product): object | null {
  const url = absolute(settings, `/products/${product.handle}`);
  const offers = product.variants.filter((variant) => (variant.pricePaise ?? 0) > 0).map((variant) => ({
    "@type": "Offer", ...(variant.sku ? { sku: variant.sku } : {}), name: variant.title,
    url: variant.slug ? `${url}?variant=${encodeURIComponent(variant.slug)}` : url,
    price: (variant.pricePaise! / 100).toFixed(2), priceCurrency: "INR",
    availability: availabilityOf(variant), itemCondition: "https://schema.org/NewCondition",
  }));
  if (!offers.length) return null;
  return {
    "@context": "https://schema.org", "@type": "Product", url, name: product.title,
    description: pageDescription(product.description),
    ...(product.images.length ? { image: product.images.map((image) => absolute(settings, image)) } : {}),
    brand: { "@type": "Brand", name: brand },
    ...(product.category ? { category: product.category } : {}),
    offers,
  };
}

/** The business, from the footer staff edit: a furniture store with its showroom, phone, email and profiles. */
export function organizationStructuredData(settings: SeoSettings, chrome: SiteChrome): object {
  const { footer } = chrome;
  const [street = "", locality = ""] = footer.addressLines;
  const postalCode = /\b(\d{6})\b/.exec(footer.addressLines.join(" "))?.[1];
  return {
    "@context": "https://schema.org", "@type": "FurnitureStore", "@id": `${settings.siteUrl}/#store`,
    name: brand, url: settings.siteUrl, logo: absolute(settings, "/icon.jpg"),
    telephone: footer.customerPhone, email: footer.customerEmail,
    address: {
      "@type": "PostalAddress", streetAddress: street.replace(/,\s*$/, ""),
      addressLocality: locality.split(",")[0]?.trim() || "New Delhi", addressRegion: "Delhi", addressCountry: "IN",
      ...(postalCode ? { postalCode } : {}),
    },
    sameAs: [footer.instagram, footer.linkedin].filter(Boolean),
  };
}
/** The site, with its catalogue search, so answer engines can send a query straight to it. */
export function websiteStructuredData(settings: SeoSettings): object {
  return {
    "@context": "https://schema.org", "@type": "WebSite", "@id": `${settings.siteUrl}/#website`, name: brand, url: settings.siteUrl,
    publisher: { "@id": `${settings.siteUrl}/#store` },
    potentialAction: { "@type": "SearchAction", target: `${settings.siteUrl}/collections/all?q={search_term_string}`, "query-input": "required name=search_term_string" },
  };
}
export function breadcrumbStructuredData(settings: SeoSettings, trail: [name: string, path: string][]): object {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: absolute(settings, path) })),
  };
}
export function articleStructuredData(settings: SeoSettings, article: { title: string; excerpt: string; path: string; image?: string; published?: string }): object {
  return {
    "@context": "https://schema.org", "@type": "Article", headline: article.title.slice(0, 110), description: pageDescription(article.excerpt),
    url: absolute(settings, article.path), mainEntityOfPage: absolute(settings, article.path),
    ...(article.image ? { image: absolute(settings, article.image) } : {}), ...(article.published ? { datePublished: article.published } : {}),
    author: { "@type": "Organization", name: brand }, publisher: { "@id": `${settings.siteUrl}/#store` },
  };
}

/** JSON for a <script type="application/ld+json">: nothing in it can end the script or start markup. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Every published product, read a page at a time (the API serves at most 50 per page). */
export async function collectProducts(read: (page: number) => Promise<{ products: Product[]; total: number; limit: number }>): Promise<Product[]> {
  const products: Product[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await read(page);
    products.push(...result.products);
    if (!result.products.length || page * result.limit >= result.total) break;
  }
  return products;
}

/** Shared by every page: the address titles and share links resolve against, the name, and the launch switch. */
export function siteMetadata(settings: SeoSettings): Metadata {
  return {
    metadataBase: new URL(`${settings.siteUrl}/`),
    title: { default: brand, template: `%s | ${brand}` },
    description: fallbackDescription,
    robots: robotsMeta(settings),
    openGraph: { type: "website", siteName: brand, locale: "en_IN" },
    twitter: { card: "summary_large_image" },
  };
}
/** A product page: its words, one canonical address for all its variants, and its first photo for link previews. */
export function productMetadata(settings: SeoSettings, product: Product): Metadata {
  const path = `/products/${product.handle}`, description = pageDescription(product.description);
  const images = product.images.slice(0, 1).map((image) => ({ url: absolute(settings, image), alt: product.title }));
  return {
    title: product.title, description, alternates: { canonical: path },
    openGraph: { type: "website", siteName: brand, locale: "en_IN", url: path, title: product.title, description, images },
    twitter: { card: "summary_large_image", title: product.title, description, images: images.map((image) => image.url) },
  };
}
