import type { Product } from "@shopmaple/contracts";
import { pricedVariants } from "./product-availability";

/** Display-only props for card islands; full catalogue records stay on the server. */
export type ProductCardModel = {
  id: string;
  handle: string;
  title: string;
  image: string | null;
  pricePaise: number | null;
  compareAtPaise: number | null;
  priceFrom: boolean;
  otherOptionsOnRequest: boolean;
  optionCount: number;
};

export function toProductCard(product: Product): ProductCardModel {
  const priced = pricedVariants(product);
  // Sorting the filtered copy preserves both the catalogue order and the first
  // equal-price option's compare-at amount used by the original card.
  const cheapest = priced.sort((a, b) => a.pricePaise - b.pricePaise)[0];
  const price = cheapest?.pricePaise ?? null;
  const unknownPrices = priced.length < product.variants.length;
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    image: product.images[0] ?? null,
    pricePaise: price,
    compareAtPaise: price !== null && cheapest?.compareAtPaise != null && cheapest.compareAtPaise > price
      ? cheapest.compareAtPaise : null,
    priceFrom: price !== null && (unknownPrices || new Set(priced.map(variant => variant.pricePaise)).size > 1),
    otherOptionsOnRequest: unknownPrices && price !== null,
    optionCount: product.variants.length,
  };
}
