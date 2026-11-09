/** In the preview a priced item may be saved to the cart; that confirms neither
 * stock nor checkout. With checkout on, the cart holds only what can be bought:
 * `available` is Keeri's sellable verdict at the price the store shows. */
export function canAddToCart(
  candidate?: { pricePaise: number | null; published?: boolean; available?: boolean },
  checkoutEnabled = false,
) {
  return Boolean(
    candidate &&
    candidate.published !== false &&
    (!checkoutEnabled || candidate.available === true) &&
    candidate.pricePaise !== null &&
    Number.isInteger(candidate.pricePaise) &&
    candidate.pricePaise >= 0 &&
    candidate.pricePaise <= 1_000_000_000,
  );
}
