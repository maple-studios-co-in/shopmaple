import type { NextConfig } from "next";
import { siteOrigins } from "../../packages/contracts/src/site-address";
import retired from "./data/retired-products.json";

// Evaluated when the release is built: the store's own addresses (SITE_URL, SITE_ALIASES and WEB_ORIGIN, see
// packages/contracts/src/site-address.ts) are fixed into this build's image allowlist and its link handling. Changing
// them needs a rebuild, as every release already is.
const origins = siteOrigins(process.env);
const api = process.env.API_URL ?? "http://127.0.0.1:4100";
/** Pictures the API serves on the store's own address(es): Keeri's approved photos and approved reviews' customer photos. */
const ownMedia = origins.flatMap((origin) => {
  const url = new URL(origin);
  const protocol = url.protocol === "http:" ? "http" as const : "https" as const;
  return ["/media/keeri/*.webp", "/media/keeri-review/*.webp"].map((pathname) => ({
    protocol, hostname: url.hostname, ...(url.port ? { port: url.port } : {}), pathname, search: "",
  }));
});
const config: NextConfig = {
  transpilePackages: ["@shopmaple/contracts"],
  // Read through apps/web/lib/site-origins.ts, on the server and in the browser alike.
  env: { STORE_SITE_ORIGINS: origins.join(",") },
  poweredByHeader: false,
  devIndicators: false,
  images: {
    // WebP only: encoding AVIF on a cold cache took seconds per photo and made pages wait on images. Every photo is made
    // here and cached for a week once made.
    formats: ["image/webp"],
    minimumCacheTTL: 604800,
    // Keeri photos, and customer photos on approved reviews (served by the API only while the review is listed). Nothing
    // is loaded from Shopify (owner, 11 Nov 2026).
    remotePatterns: ownMedia,
  },
  async redirects() {
    return [
      // Pages moved from Shopify's /pages/<slug> to /<slug> (10 Nov 2026). Old links, search results and sent emails keep
      // working, and the query (an enquiry's ?product=) carries over.
      { source: "/pages/:slug", destination: "/:slug", permanent: true },
      // The products that existed only in the old Shopify catalogue left the store (owner, 11 Nov 2026), for now: each old
      // address goes to its kind's collection, or to all furniture, temporarily (307), so search engines keep the
      // address while the owner decides what returns (data/retired-products.json).
      ...Object.entries(retired.redirects).map(([handle, collection]) => ({
        source: `/products/${handle}`, destination: `/collections/${collection}`, permanent: false,
      })),
    ];
  },
  async rewrites() {
    return [
      { source: "/media/keeri/:filename", destination: api + "/media/keeri/:filename" },
      { source: "/media/keeri-review/:filename", destination: api + "/media/keeri-review/:filename" },
      { source: "/media/instagram-feed/:filename", destination: api + "/media/instagram-feed/:filename" },
      { source: "/media/uploads/:filename", destination: api + "/media/uploads/:filename" },
      { source: "/api/:path*", destination: api + "/api/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Staff pages and draft previews must never be stored by browsers or the CDN. (Search
        // engine headers are set per request in proxy.ts, because these are fixed at build time.)
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // The draft preview frame is embedded only by the same-origin preview shell.
        source: "/admin/preview-frame/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // A section thumbnail (?section=) runs only React's inline streaming scripts, which swap
        // the rendered section in for the loading fallback; the app bundles never load, so
        // eighteen thumbnails are static documents rather than eighteen hydrated storefronts.
        source: "/admin/preview-frame/:path*",
        has: [{ type: "query", key: "section" }],
        headers: [{ key: "Content-Security-Policy", value: "script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'" }],
      },
    ];
  },
};
export default config;
