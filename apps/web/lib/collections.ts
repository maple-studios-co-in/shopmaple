import type { Product } from "@shopmaple/contracts";
import membership from "../data/collection-membership.json";
import { categoryNames } from "./format";

export const collectionTitles: Record<string, string> = {
  ...categoryNames,
  "5-seater-sofa": "5 Seater Sofas",
  "7-seater-sofa": "7 Seater Sofas",
  "chair-collection": "Chairs",
  "center-tables-1": "Center Tables",
  "side-table": "Side Tables",
  "sofa-table": "Sofa Tables",
  "bestseller-chairs": "Bestseller Chairs",
  "arm-chair": "Arm Chairs",
  "dining-chair": "Dining Chairs",
  "center-tables": "Center Tables",
  "accent-chair": "Accent Chairs",
  dinings: "Dining Sets",
  "clearance-sale": "Clearance Sale",
  "minimum-60-off": "Minimum 30% Off",
  "best-buy-under-rs-50-000": "Best Buy Under Rs. 50,000",
  "furniture-store-under-rs-25-000": "Furniture Under Rs. 25,000",
  dining: "Dining Tables",
  "console-tables": "Console Tables",
};
export const sortOptions = [
  ["featured", "Featured"],
  ["title", "Alphabetically, A–Z"],
  ["title-desc", "Alphabetically, Z–A"],
  ["price-asc", "Price, low to high"],
  ["price-desc", "Price, high to low"],
] as const;
export type CollectionQuery = {
  q: string;
  sort: string;
  availability: string;
  min: string;
  max: string;
  category: string;
  page: number;
};
export function collectionQuery(
  raw: Record<string, string | string[] | undefined>,
): CollectionQuery {
  const string = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const amount = (key: string) =>
    /^\d{1,8}(\.\d{1,2})?$/.test(string(key)) ? string(key) : "";
  const legacySort = (
    {
      "price-ascending": "price-asc",
      "price-descending": "price-desc",
      "title-ascending": "title",
      "title-descending": "title-desc",
      manual: "featured",
    } as Record<string, string>
  )[string("sort_by")];
  const sort = string("sort") || legacySort || "title";
  return {
    q: string("q").trim().slice(0, 80),
    sort: sortOptions.some(([value]) => value === sort) ? sort : "title",
    availability: ["in", "out"].includes(string("availability"))
      ? string("availability")
      : "",
    min: amount("min"),
    max: amount("max"),
    category:
      Object.hasOwn(categoryNames, string("category")) &&
      string("category") !== "all"
        ? string("category")
        : "",
    page: /^[1-9]\d{0,2}$/.test(string("page")) ? Number(string("page")) : 1,
  };
}
export function collectionMembers(products: Product[], handle: string) {
  if (Object.hasOwn(membership, handle)) {
    const byHandle = new Map(
      products.map((product) => [product.handle, product]),
    );
    return ((membership as Record<string, string[]>)[handle] ?? [])
      .map((member) => byHandle.get(member))
      .filter((product): product is Product => Boolean(product));
  }
  return handle === "all"
    ? products
    : products.filter((product) => product.category === handle);
}
export function filterCollection(products: Product[], query: CollectionQuery) {
  const min = query.min ? Math.round(Number(query.min) * 100) : 0;
  const max = query.max ? Math.round(Number(query.max) * 100) : Infinity;
  const filtered = products.filter((product) => {
    const text = `${product.title} ${product.description}`.toLowerCase();
    if (query.q && !text.includes(query.q.toLowerCase())) return false;
    if (query.category && product.category !== query.category) return false;
    return product.variants.some(
      (variant) =>
        variant.pricePaise >= min &&
        variant.pricePaise <= max &&
        (!query.availability ||
          (query.availability === "in"
            ? variant.available
            : !variant.available)),
    );
  });
  const price = (product: Product) =>
    Math.min(...product.variants.map((v) => v.pricePaise));
  if (query.sort === "title" || query.sort === "title-desc")
    filtered.sort(
      (a, b) =>
        a.title.localeCompare(b.title) * (query.sort === "title-desc" ? -1 : 1),
    );
  if (query.sort === "price-asc" || query.sort === "price-desc")
    filtered.sort(
      (a, b) => (price(a) - price(b)) * (query.sort === "price-desc" ? -1 : 1),
    );
  return filtered;
}
export function collectionHref(
  handle: string,
  query: CollectionQuery,
  page = 1,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (key !== "page" && value) params.set(key, String(value));
  if (page > 1) params.set("page", String(page));
  return `/collections/${handle}?${params}`;
}
