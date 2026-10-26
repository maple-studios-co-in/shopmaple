import { z } from "zod";
import { canOrder, lowestPrice, productCardSchema } from "./catalogue-cards";
export const categoryNames: Record<string, string> = {
  all: "All Furniture", sofas: "Sofas", chairs: "Chairs", tables: "Tables",
  beds: "Beds", storage: "Storage", outdoors: "Outdoors",
};
export type CollectionProduct = {
  handle: string; title: string; description: string; category: string | null;
  variants: { pricePaise: number | null; available: boolean; stockPolicy: string }[];
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
export function filterCollection<T extends CollectionProduct>(products: T[], query: CollectionQuery) {
  const min = query.min ? Math.round(Number(query.min) * 100) : 0;
  const max = query.max ? Math.round(Number(query.max) * 100) : Infinity;
  const filtered = products.filter((product) => {
    const text = `${product.title} ${product.description}`.toLowerCase();
    if (query.q && !text.includes(query.q.toLowerCase())) return false;
    if (query.category && product.category !== query.category) return false;
    const hasPriceFilter = Boolean(query.min || query.max);
    if (!hasPriceFilter && !query.availability) return true;
    if (!product.variants.length)
      return !hasPriceFilter && query.availability === "out";
    return product.variants.some(
      (variant) =>
        (!hasPriceFilter ||
          (variant.pricePaise !== null &&
            variant.pricePaise >= min &&
            variant.pricePaise <= max)) &&
        (!query.availability ||
          (query.availability === "in"
            ? canOrder(variant)
            : !canOrder(variant))),
    );
  });
  if (query.sort === "title" || query.sort === "title-desc")
    filtered.sort(
      (a, b) =>
        a.title.localeCompare(b.title) * (query.sort === "title-desc" ? -1 : 1),
    );
  if (query.sort === "price-asc" || query.sort === "price-desc")
    filtered.sort((a, b) => {
      const first = lowestPrice(a);
      const second = lowestPrice(b);
      if (first === null) return second === null ? 0 : 1;
      if (second === null) return -1;
      return (first - second) * (query.sort === "price-desc" ? -1 : 1);
    });
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

const queryResponseSchema = z.object({
  q: z.string().max(80), sort: z.enum(["featured", "title", "title-desc", "price-asc", "price-desc"]),
  availability: z.enum(["", "in", "out"]), min: z.string().regex(/^(?:\d{1,8}(?:\.\d{1,2})?)?$/), max: z.string().regex(/^(?:\d{1,8}(?:\.\d{1,2})?)?$/),
  category: z.enum(["", "sofas", "chairs", "tables", "beds", "storage", "outdoors"]),
  page: z.number().int().min(1).max(999),
}).strict();
export const cataloguePageSchema = z.object({
  handle: z.string().min(1).max(200), query: queryResponseSchema,
  products: z.array(productCardSchema).max(24), total: z.number().int().nonnegative(),
  collectionTotal: z.number().int().nonnegative(), inStock: z.number().int().nonnegative(),
  outOfStock: z.number().int().nonnegative(), highestPrice: z.number().int().min(0).max(1_000_000_000).nullable(),
  limit: z.union([z.literal(4), z.literal(24)]), published: z.literal(true),
  mode: z.literal("preview"), checkoutEnabled: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const maximumPage = Math.max(1, Math.ceil(value.total / value.limit));
  const expectedLength = Math.min(value.limit, Math.max(0, value.total - (value.query.page - 1) * value.limit));
  if (value.query.page > maximumPage || value.products.length !== expectedLength || value.total > value.collectionTotal || value.inStock > value.collectionTotal || value.outOfStock > value.collectionTotal || new Set(value.products.map(product => product.handle)).size !== value.products.length)
    ctx.addIssue({ code: "custom", message: "Inconsistent catalogue page" });
});
export type CataloguePage = z.infer<typeof cataloguePageSchema>;
