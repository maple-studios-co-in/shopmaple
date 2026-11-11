/**
 * Some original Shopify "collection cover" assets are SVG wrappers around
 * embedded PNG layers (1.8–7.7 MB each). next/image passes SVG through
 * untouched, so the homepage shipped 16 MB of artwork for 183px tiles. The
 * Shopify CDN also serves these covers as rasters, which the store keeps as
 * its own copies (/media/shopify; scripts/rewrite-shopify-media.ts lists them)
 * and next/image resizes and re-encodes. A cover is recognised by its Shopify
 * address or by the server's copy of the SVG. Only verified files are mapped;
 * everything else is returned unchanged so unknown media never points at a
 * guessed URL.
 */
const rasterCovers: Record<string, string> = {
  // Cover_Image_Maple_6, 7, 8 and 10: the SVG's copy → the raster's copy.
  "66e0589836b36bde929448cb260601ab.svg": "8becbace84cb38e911b5528d874d2e5e.webp",
  "fd79f45c823ca52dd10046bd70824472.svg": "1af35189f19ee0bb8c8cdfb72c333dfb.webp",
  "26d16261885dc6aca639ae3fc66dca2b.svg": "0af63e1e2f3d04d65b85090b6a82ff19.webp",
  "373186ec527eec85f57d9e5984df8d1c.svg": "2df9f5458d15e4b15493c329065448f1.webp",
};
const shopifyCovers: Record<string, string> = {
  Cover_Image_Maple_6: "66e0589836b36bde929448cb260601ab.svg",
  Cover_Image_Maple_7: "fd79f45c823ca52dd10046bd70824472.svg",
  Cover_Image_Maple_8: "26d16261885dc6aca639ae3fc66dca2b.svg",
  Cover_Image_Maple_10: "373186ec527eec85f57d9e5984df8d1c.svg",
};
const coverPattern = /^https:\/\/(?:shop\.maplefurnishers\.com\/cdn\/shop|cdn\.shopify\.com\/s\/files\/1\/0691\/8651\/9229)\/collections\/([A-Za-z0-9_]+)\.svg(?:\?.*)?$/;
const copyPattern = /^\/media\/shopify\/([a-f0-9]{32}\.svg)$/;

export function rasterShopifyArtwork(url: string): string {
  const shopify = coverPattern.exec(url)?.[1];
  const svg = shopify && Object.hasOwn(shopifyCovers, shopify) ? shopifyCovers[shopify]! : copyPattern.exec(url)?.[1];
  return svg && Object.hasOwn(rasterCovers, svg) ? `/media/shopify/${rasterCovers[svg]}` : url;
}
