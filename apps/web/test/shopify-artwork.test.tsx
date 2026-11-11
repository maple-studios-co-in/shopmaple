import assert from "node:assert/strict";
import { test } from "node:test";
import { rasterShopifyArtwork } from "../lib/shopify-artwork";
import { copyOf } from "./support/shopify-copy";

test("known SVG-wrapped category covers resolve to the store's copy of the raster variant that next/image can resize", () => {
  for (const cover of ["Cover_Image_Maple_6", "Cover_Image_Maple_7", "Cover_Image_Maple_8", "Cover_Image_Maple_10"]) {
    const raster = copyOf(`collections/${cover}.webp`);
    // As published content names it on Shopify (either host, any version), or as the API names the server's copy.
    assert.equal(rasterShopifyArtwork(`https://shop.maplefurnishers.com/cdn/shop/collections/${cover}.svg?v=1778649785`), raster);
    assert.equal(rasterShopifyArtwork(`https://cdn.shopify.com/s/files/1/0691/8651/9229/collections/${cover}.svg`), raster);
    assert.equal(rasterShopifyArtwork(copyOf(`collections/${cover}.svg`)), raster);
  }
});

test("other artwork, including unverified SVG files and raster files, is returned unchanged", () => {
  for (const url of [
    "https://shop.maplefurnishers.com/cdn/shop/files/Chairs_9.svg",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_99.svg?v=1",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Clearance_Sale.webp?v=1778257635",
    copyOf("files/Chairs_9.svg"),
    copyOf("collections/Cover_Image_Maple_6.webp"),
    "/media/uploads/cover.svg",
  ]) assert.equal(rasterShopifyArtwork(url), url);
});
