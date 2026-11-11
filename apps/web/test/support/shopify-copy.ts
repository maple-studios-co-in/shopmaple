import { mapleShopifyFiles, shopifyMediaPath } from "@shopmaple/contracts/shopify-media";

/**
 * The store's own copy (/media/shopify/<name>) of a file first published on Maple's Shopify store, by its Shopify
 * address or its path there ("files/Chairs_1.png", "collections/Sofa_set.png").
 */
export const copyOf = (address: string) => shopifyMediaPath(/^(?:https:)?\/\//.test(address) ? address : mapleShopifyFiles + address)!;
/** A rendered src, raw or through the image optimizer (/_next/image?url=…), as a plain path to compare. */
export const shown = (src: string | null | undefined) => {
  const value = src ?? "";
  return value.startsWith("/_next/image?") ? new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("url") ?? "" : value;
};
