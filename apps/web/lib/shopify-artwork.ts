/**
 * Some original Shopify "collection cover" assets are SVG wrappers around
 * embedded PNG layers (1.8–7.7 MB each). next/image passes SVG through
 * untouched, so the homepage shipped 16 MB of artwork for 183px tiles. The
 * Shopify CDN also serves these covers as rasters, which next/image can
 * resize and re-encode. Only verified files are mapped; everything else is
 * returned unchanged so unknown media never points at a guessed URL.
 */
const rasterCovers = new Set(["Cover_Image_Maple_6", "Cover_Image_Maple_7", "Cover_Image_Maple_8", "Cover_Image_Maple_10"]);
const coverPattern = /^https:\/\/shop\.maplefurnishers\.com\/cdn\/shop\/collections\/([A-Za-z0-9_]+)\.svg(?:\?.*)?$/;

export function rasterShopifyArtwork(url: string): string {
  const match = coverPattern.exec(url);
  if (!match || !rasterCovers.has(match[1]!)) return url;
  return `https://shop.maplefurnishers.com/cdn/shop/collections/${match[1]}.webp?width=600`;
}
