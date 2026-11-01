import type { ProductCard } from "@shopmaple/contracts";
export { toProductCard } from "@shopmaple/contracts";
export type { ProductCard as ProductCardModel } from "@shopmaple/contracts";

/** The card's saving as a whole percent of the compare-at price; null when there is no sale or it rounds to under 1%. */
export function discountPercent(card: Pick<ProductCard, "pricePaise" | "compareAtPaise">): number | null {
  if (card.pricePaise === null || card.compareAtPaise === null || card.compareAtPaise <= card.pricePaise) return null;
  const percent = Math.round((card.compareAtPaise - card.pricePaise) / card.compareAtPaise * 100);
  return percent >= 1 ? percent : null;
}
