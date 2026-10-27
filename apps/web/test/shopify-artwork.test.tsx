import assert from "node:assert/strict";
import { test } from "node:test";
import { rasterShopifyArtwork } from "../lib/shopify-artwork";

test("known SVG-wrapped category covers resolve to the CDN raster variant that next/image can resize", () => {
  assert.equal(
    rasterShopifyArtwork("https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_6.svg?v=1778649785"),
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_6.webp?width=600",
  );
  assert.equal(
    rasterShopifyArtwork("https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_10.svg?v=1780689685"),
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_10.webp?width=600",
  );
});

test("other artwork, including unverified SVG files and raster files, is returned unchanged", () => {
  for (const url of [
    "https://shop.maplefurnishers.com/cdn/shop/files/Chairs_9.svg",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_99.svg?v=1",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Clearance_Sale.webp?v=1778257635",
    "https://cdn.shopify.com/s/files/1/0691/8651/9229/collections/Cover_Image_Maple_6.svg",
    "/media/uploads/cover.svg",
  ]) assert.equal(rasterShopifyArtwork(url), url);
});
