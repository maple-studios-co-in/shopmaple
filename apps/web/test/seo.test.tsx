import assert from "node:assert/strict";
import { test } from "node:test";
import type { Product } from "@shopmaple/contracts";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";
import {
  breadcrumbStructuredData, collectProducts, jsonLdText, organizationStructuredData, pageDescription, productMetadata, productStructuredData,
  robotsRules, robotsMeta, seoSettings, siteMetadata, sitemapEntries,
} from "../lib/seo";

const site = "https://store.maplefurnishers.com";
const on = seoSettings({ SEO_INDEXING: "on" });
const off = seoSettings({});
const photo = (name: string) => `${site}/media/keeri/${name}.webp`;
const product: Product = {
  id: "keeri:t:arix", handle: "arix", title: "Arix", description: "  The Arix Dining Chair features a softly sculpted\nwraparound back.  ", category: "chairs",
  images: [photo("teal"), photo("ivory")], published: true, source: "keeri:t", sourceUpdatedAt: "2026-10-31T00:00:00Z",
  variants: [
    { id: "v1", title: "Teal Velvet", sku: "ARIX-TV", pricePaise: 2_950_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", slug: "teal-velvet" },
    { id: "v2", title: "Ivory Boucle", sku: "ARIX-IB", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "stocked", slug: "ivory-boucle" },
  ],
};

test("search engines are kept out until the launch switch is on, then sent to the sitemap with private pages excluded", () => {
  assert.equal(off.siteUrl, site);
  assert.deepEqual(robotsRules(off), { rules: [{ userAgent: "*", disallow: "/" }] });
  assert.deepEqual(robotsMeta(off), { index: false, follow: false });
  const rules = robotsRules(on);
  assert.equal(rules.sitemap, `${site}/sitemap.xml`);
  const everyone = (Array.isArray(rules.rules) ? rules.rules : [rules.rules]).find((rule) => rule.userAgent === "*")!;
  assert.equal(everyone.allow, "/");
  for (const path of ["/admin", "/api/", "/cart", "/checkout", "/account", "/favourites"]) assert.ok([everyone.disallow].flat().includes(path), `${path} stays private`);
  assert.deepEqual(robotsMeta(on), { index: true, follow: true });
  assert.equal(seoSettings({ SEO_INDEXING: "yes" }).indexing, false, "only the exact switch value turns indexing on");
});

test("the sitemap lists every public page once, with readable product addresses, their photos and when they changed", () => {
  const entries = sitemapEntries(on, {
    products: [product, { ...product, id: "x", handle: "hidden", published: false }],
    pages: ["delivery-faq"], policies: ["privacy-policy"], articles: [{ blog: "recent-stories", handle: "how-to-measure-furniture-before-ordering-online" }],
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
  for (const path of ["/", "/collections/all", "/collections/chairs", "/pages/our-story", "/pages/contact", "/pages/delivery-faq", "/policies/privacy-policy", "/blogs/recent-stories", "/blogs/recent-stories/how-to-measure-furniture-before-ordering-online", "/products/arix"])
    assert.ok(urls.includes(site + path), `${path} is listed`);
  assert.ok(!urls.some((url) => url.includes("hidden")), "unpublished products are not listed");
  const arix = entries.find((entry) => entry.url === `${site}/products/arix`)!;
  assert.deepEqual(arix.images, [photo("teal"), photo("ivory")]);
  assert.equal(new Date(arix.lastModified!).toISOString(), "2026-10-31T00:00:00.000Z");
});

test("a product describes itself to search and answer engines: name, photos, brand, and an offer only where there is a price", () => {
  const data = productStructuredData(on, product) as Record<string, any>;
  assert.equal(data["@type"], "Product");
  assert.equal(data.url, `${site}/products/arix`, "one canonical address, not one per variant");
  assert.equal(data.name, "Arix");
  assert.deepEqual(data.image, [photo("teal"), photo("ivory")]);
  assert.equal(data.brand.name, "Maple Furnishers");
  assert.equal(data.description, "The Arix Dining Chair features a softly sculpted wraparound back.");
  assert.deepEqual(data.offers, [{
    "@type": "Offer", sku: "ARIX-TV", name: "Teal Velvet", url: `${site}/products/arix?variant=teal-velvet`,
    price: "29500.00", priceCurrency: "INR", availability: "https://schema.org/MadeToOrder", itemCondition: "https://schema.org/NewCondition",
  }], "the unpriced variant has no offer");
  assert.equal((productStructuredData(on, { ...product, variants: [product.variants[1]!] }) as Record<string, any>).offers, undefined);
});

test("the business is described once, from the footer staff edit", () => {
  const data = organizationStructuredData(on, defaultSiteChrome) as Record<string, any>;
  assert.equal(data["@type"], "FurnitureStore");
  assert.equal(data.name, "Maple Furnishers");
  assert.equal(data.url, site);
  assert.equal(data.telephone, defaultSiteChrome.footer.customerPhone);
  assert.equal(data.email, defaultSiteChrome.footer.customerEmail);
  assert.match(data.address.streetAddress, /Kirti Nagar/);
  assert.equal(data.address.postalCode, "110015");
  assert.equal(data.address.addressCountry, "IN");
  assert.ok(data.sameAs.includes(defaultSiteChrome.footer.instagram));
});

test("breadcrumbs, descriptions and the script text are safe and well formed", () => {
  const crumbs = breadcrumbStructuredData(on, [["Home", "/"], ["Chairs", "/collections/chairs"], ["Arix", "/products/arix"]]) as Record<string, any>;
  assert.deepEqual(crumbs.itemListElement.map((item: any) => [item.position, item.name, item.item]), [[1, "Home", `${site}/`], [2, "Chairs", `${site}/collections/chairs`], [3, "Arix", `${site}/products/arix`]]);
  assert.equal(pageDescription("x".repeat(400)).length, 160);
  assert.equal(pageDescription("   "), "Handcrafted luxury furniture from Maple Furnishers, made to order in Delhi and delivered across India.");
  const text = jsonLdText({ name: "</script><script>alert(1)</script> & <!-- \u2028" });
  assert.ok(!/[<>&\u2028]/.test(text), "nothing can close the script or start markup");
  assert.equal(JSON.parse(text).name, "</script><script>alert(1)</script> & <!-- \u2028", "and it still reads back exactly");
});

test("the sitemap reads the whole catalogue, page by page, and stops at the end", async () => {
  const asked: number[] = [];
  const all = Array.from({ length: 120 }, (_, index) => ({ ...product, id: `p${index}`, handle: `p${index}` }));
  const products = await collectProducts(async (page) => {
    asked.push(page);
    return { products: all.slice((page - 1) * 50, page * 50), total: all.length, limit: 50 };
  });
  assert.deepEqual(asked, [1, 2, 3]);
  assert.equal(products.length, 120);
  assert.deepEqual(await collectProducts(async () => ({ products: [], total: 0, limit: 50 })), []);
});

test("a product page has its own title, description, one canonical address and its photo for sharing", () => {
  const meta = productMetadata(on, product);
  assert.equal(meta.title, "Arix");
  assert.equal(meta.description, "The Arix Dining Chair features a softly sculpted wraparound back.");
  assert.equal(meta.alternates?.canonical, "/products/arix", "every variant address points search to the one product page");
  const og = meta.openGraph as Record<string, any>;
  assert.equal(og.url, "/products/arix");
  assert.deepEqual([og.images].flat().map((image: any) => image.url ?? image), [photo("teal")]);
  assert.equal((meta.twitter as Record<string, any>).card, "summary_large_image");
});

test("every page shares the site address, name and indexing switch", () => {
  const meta = siteMetadata(off);
  assert.equal(String(meta.metadataBase), `${site}/`);
  assert.deepEqual(meta.robots, { index: false, follow: false });
  assert.deepEqual(meta.title, { default: "Maple Furnishers", template: "%s | Maple Furnishers" });
  assert.equal((meta.openGraph as Record<string, any>).siteName, "Maple Furnishers");
  assert.equal((meta.openGraph as Record<string, any>).locale, "en_IN");
  assert.deepEqual(siteMetadata(on).robots, { index: true, follow: true });
});
