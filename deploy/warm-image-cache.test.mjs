import assert from "node:assert/strict";
import test from "node:test";
import { imageUrls, warmPages } from "./warm-image-cache.mjs";

test("collects every resized photo a page names, once each, up to the width limit", () => {
  const html = [
    `<img alt="" src="/_next/image?url=%2Fmedia%2Fa.webp&amp;w=3840&amp;q=75"`,
    // React writes the attribute names in camel case.
    ` srcSet="/_next/image?url=%2Fmedia%2Fa.webp&amp;w=640&amp;q=75 640w, /_next/image?url=%2Fmedia%2Fa.webp&amp;w=3840&amp;q=75 3840w">`,
    `<link rel="preload" as="image" imageSrcSet="/_next/image?url=%2Fmedia%2Fb.webp&amp;w=750&amp;q=75 750w, /_next/image?url=%2Fmedia%2Fa.webp&amp;w=640&amp;q=75 640w">`,
    // Shopify's photos, plain files and anything that is not a resized photo are left alone.
    `<img src="https://cdn.shopify.com/s/files/x.jpg?width=750"><img src="/media/plain.webp"><img src="/_next/image?w=640">`,
  ].join("");
  assert.deepEqual(imageUrls(html, "https://store.example", 1920), [
    "https://store.example/_next/image?url=%2Fmedia%2Fa.webp&w=640&q=75",
    "https://store.example/_next/image?url=%2Fmedia%2Fb.webp&w=750&q=75",
  ]);
  assert.equal(imageUrls(html, "https://store.example", 4000).length, 3);
});

test("warms the homepage and the four rooms its hero tiles open", () => {
  for (const path of ["/", "/sofas", "/chairs", "/tables", "/collections/beds"]) assert.ok(warmPages.includes(path), path);
});
