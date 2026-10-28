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
      // Staff draft previews: never cached by a CDN or browser, never indexed.
      {
        source: "/admin/preview/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/admin/preview",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // The preview frame is embedded only by the same-origin preview shell.
      {
        source: "/admin/preview-frame/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/admin/preview-frame",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
