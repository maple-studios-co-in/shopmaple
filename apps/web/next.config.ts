import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@shopmaple/contracts"],
  poweredByHeader: false,
  devIndicators: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "store.maplefurnishers.com", pathname: "/media/keeri/*.webp", search: "" },
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
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Staff pages and draft previews must never be stored by browsers or the CDN.
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
