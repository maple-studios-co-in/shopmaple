import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@shopmaple/contracts"],
  poweredByHeader: false,
  devIndicators: false,
  images: {
    // WebP only: encoding AVIF on a cold cache took seconds per photo and made pages wait on images. Shopify's own photos
    // skip this optimizer altogether (lib/image-loading.ts); what is left is cached for a week once made.
    formats: ["image/webp"],
    minimumCacheTTL: 604800,
    remotePatterns: [
      { protocol: "https", hostname: "store.maplefurnishers.com", pathname: "/media/keeri/*.webp", search: "" },
      // Customer photos on approved reviews, served by the API only while the review is listed.
      { protocol: "https", hostname: "store.maplefurnishers.com", pathname: "/media/keeri-review/*.webp", search: "" },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
      {
        protocol: "https",
        hostname: "shop.maplefurnishers.com",
        pathname: "/cdn/shop/**",
      },
    ],
  },
  async rewrites() {
    return [
      { source: "/media/keeri/:filename", destination: (process.env.API_URL ?? "http://127.0.0.1:4100") + "/media/keeri/:filename" },
      { source: "/media/keeri-review/:filename", destination: (process.env.API_URL ?? "http://127.0.0.1:4100") + "/media/keeri-review/:filename" },
      { source: "/media/instagram-feed/:filename", destination: (process.env.API_URL ?? "http://127.0.0.1:4100") + "/media/instagram-feed/:filename" },
      {
        source: "/media/uploads/:filename",
        destination:
          (process.env.API_URL ?? "http://127.0.0.1:4100") +
          "/media/uploads/:filename",
      },
      {
        source: "/api/:path*",
        destination:
          (process.env.API_URL ?? "http://127.0.0.1:4100") + "/api/:path*",
      },
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
