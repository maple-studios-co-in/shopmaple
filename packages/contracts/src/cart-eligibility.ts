/** Saving a priced catalogue item does not confirm stock or authorize checkout. */
export function canAddToCart(candidate?: { pricePaise: number | null; published?: boolean }) {
  return Boolean(
    candidate &&
    candidate.published !== false &&
    candidate.pricePaise !== null &&
    Number.isInteger(candidate.pricePaise) &&
    candidate.pricePaise >= 0 &&
    candidate.pricePaise <= 1_000_000_000,
  );
}
