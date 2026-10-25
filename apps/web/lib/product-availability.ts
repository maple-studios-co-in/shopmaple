import type { Product, Variant } from "@shopmaple/contracts";

export function pricedVariants(product: Product) {
  return product.variants.filter(
    (variant): variant is Variant & { pricePaise: number } =>
      variant.pricePaise !== null,
  );
}

export function lowestPrice(product: Product): number | null {
  const priced = pricedVariants(product);
  return priced.length
    ? Math.min(...priced.map((variant) => variant.pricePaise))
    : null;
}

export function canOrder(variant?: {
  available: boolean;
  pricePaise: number | null;
  stockPolicy: string;
}) {
  return Boolean(
    variant &&
      variant.available &&
      variant.pricePaise !== null &&
      variant.pricePaise > 0 &&
      ["stocked", "dropship"].includes(variant.stockPolicy),
  );
}
