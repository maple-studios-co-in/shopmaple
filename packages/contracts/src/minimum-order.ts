/**
 * A design's minimum order (Keeri's `minOrderQuantity`, on the product and on each bag line) as the bag, the product
 * page and checkout apply it.
 *
 * Import this module by its subpath, `@shopmaple/contracts/minimum-order`. Like `/account` and `/checkout-consent`, it
 * is not re-exported from the package index, which ships in the homepage's JavaScript; the bag and the product page that
 * use it load after the homepage.
 */
export type MinimumShortfall = { handle: string; title: string; minimum: number; quantity: number };
/** The products in a bag that fall short of their minimum order, each counted across all its lines (finishes may be
 * mixed). Checkout is refused while any remain; Keeri's quote checks the same. */
export function minimumOrderShortfalls(items: readonly { handle: string; title: string; quantity: number; minOrderQuantity?: number | null }[]): MinimumShortfall[] {
  const products = new Map<string, MinimumShortfall>();
  for (const item of items) {
    const minimum = item.minOrderQuantity ?? 1;
    if (minimum <= 1) continue;
    const seen = products.get(item.handle) ?? { handle: item.handle, title: item.title, minimum, quantity: 0 };
    seen.quantity += item.quantity;
    products.set(item.handle, seen);
  }
  return [...products.values()].filter((product) => product.quantity < product.minimum);
}
/** How many pieces the product page adds at first: enough to meet the minimum with what is already in the bag. */
export function minimumToAdd(minimum: number | null | undefined, inBag: number) {
  return Math.max(1, (minimum ?? 1) - inBag);
}
