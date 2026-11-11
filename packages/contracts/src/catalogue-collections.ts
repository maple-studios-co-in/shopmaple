import { z } from "zod";
import { canOrder, lowestPrice, productCardSchema } from "./catalogue-cards";
export const categoryNames: Record<string, string> = {
  all: "All Furniture", sofas: "Sofas", chairs: "Chairs", tables: "Tables",
  beds: "Beds", storage: "Storage", outdoors: "Outdoors",
};
export type CollectionProduct = {
  handle: string; title: string; description: string; category: string | null;
  sourceTaxonomy?: { productType: string; category: string | null; subCategory: string | null } | null;
  // The catalogue's own materials and dimensions text, for the listing's Material and Size filters.
  sourceDetails?: { materials?: string | null; dimensions?: string | null } | null;
  variants: { pricePaise: number | null; available: boolean; stockPolicy: string; title?: string }[];
};

// The listing's Material and Colour filters (frame 1:1139) read the words the catalogue already uses: a piece is
// "Wood" when its materials, name or description say walnut or sheesham, "Cream" when an option is called Ivory.
export const materialFacets = [
  ["wood", "Wood", /\b(?:wood|wooden|sheesham|teak|oak|walnut|mango|acacia|ash|beech|pine|veneer|plywood|mdf|rubberwood)\b/i],
  ["fabric", "Fabric", /\b(?:fabric|upholster(?:ed|y)?|boucl[eé]|velvet|linen|chenille|cotton|polyester|textile)\b/i],
  ["leather", "Leather", /\b(?:leather|leatherette|suede)\b/i],
  ["metal", "Metal", /\b(?:metal|iron|steel|brass|aluminium|aluminum|chrome)\b/i],
  ["stone", "Marble & stone", /\b(?:marble|stone|granite|travertine|quartz|sintered)\b/i],
  ["cane", "Cane & rattan", /\b(?:cane|rattan|wicker|jute)\b/i],
  ["glass", "Glass", /\bglass\b/i],
] as const;
export const colourFacets = [
  ["cream", "Cream", /\b(?:cream|ivory|off[- ]white|beige|oat|oatmeal|sand|ecru|bone)\b/i],
  ["white", "White", /(?<!off[- ])\bwhite\b/i],
  ["grey", "Grey", /\b(?:grey|gray|graphite|charcoal|slate|silver)\b/i],
  ["black", "Black", /\b(?:black|ebony|onyx)\b/i],
  ["brown", "Brown", /\b(?:brown|walnut|mocha|espresso|chocolate|coffee|cognac|tan|taupe|caramel|chestnut|cocoa)\b/i],
  ["blue", "Blue", /\b(?:blue|navy|atlantic|indigo|denim|cobalt|teal)\b/i],
  ["green", "Green", /\b(?:green|olive|sage|emerald|forest|moss|mint|teal)\b/i],
  ["pink", "Pink", /\b(?:pink|blush|rose|mauve)\b/i],
  ["red", "Red", /\b(?:red|maroon|burgundy|wine|rust|terracotta|crimson)\b/i],
  ["yellow", "Yellow", /\b(?:yellow|mustard|ochre)\b/i],
  ["gold", "Gold", /\b(?:gold|golden|brass|champagne)\b/i],
] as const;
type Facets = readonly (readonly [string, string, RegExp])[];
const matching = (facets: Facets, text: string) => facets.filter(([, , pattern]) => pattern.test(text)).map(([key]) => key);

/** The material filters a piece answers to, from its materials text, name and description. */
export function productMaterials(product: Pick<CollectionProduct, "title" | "description" | "sourceDetails">): string[] {
  return matching(materialFacets, `${product.sourceDetails?.materials ?? ""} ${product.title} ${product.description}`);
}
/** The colour filters a piece answers to: its options' and name's colours, or failing those, its description's. */
export function productColours(product: Pick<CollectionProduct, "title" | "description" | "variants">): string[] {
  const named = matching(colourFacets, [product.title, ...product.variants.map((variant) => variant.title ?? "")].join(" "));
  return named.length ? named : matching(colourFacets, product.description);
}
/**
 * Width and depth in whole centimetres from the catalogue's dimensions text: "Width: 28\" (≈ 71 cm)" reads its
 * centimetres, "Width (in) - 25" and "Depth: 24\"" convert inches, "Depth 61 cm" reads as written.
 */
export function productSize(dimensions: string | null | undefined): { width?: number; depth?: number } {
  const size: { width?: number; depth?: number } = {};
  for (const line of (dimensions ?? "").split(/\r?\n|\|/)) {
    const label = /\b(width|depth)\b/i.exec(line)?.[1]?.toLowerCase() as "width" | "depth" | undefined;
    if (!label || size[label] !== undefined) continue;
    const rest = line.slice(line.toLowerCase().indexOf(label) + label.length);
    const centimetres = /(\d+(?:\.\d+)?)\s*cm\b/i.exec(rest);
    const number = /(\d+(?:\.\d+)?)/.exec(rest);
    if (centimetres) size[label] = Math.round(Number(centimetres[1]));
    else if (number) size[label] = Math.round(Number(number[1]) * (/"|\binch|\(in\)|\bin\b/i.test(line) ? 2.54 : 1));
  }
  return size;
}
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
  /** Material and colour filter keys, sorted and comma-joined ("fabric,wood"); a piece matching any one passes. */
  material: string;
  colour: string;
  /** Width and depth bounds in whole centimetres. */
  wmin: string;
  wmax: string;
  dmin: string;
  dmax: string;
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
  // Ticked boxes arrive repeated ("material=wood&material=fabric") or already joined; unknown keys are dropped.
  const keys = (key: string, facets: Facets) => {
    const value = raw[key];
    const asked = (Array.isArray(value) ? value : [value ?? ""]).flatMap((part) => part.split(","));
    return facets.map(([facet]) => facet).filter((facet) => asked.includes(facet)).sort().join(",");
  };
  const centimetres = (key: string) => (/^[1-9]\d{0,2}$/.test(string(key)) ? string(key) : "");
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
    material: keys("material", materialFacets),
    colour: keys("colour", colourFacets),
    wmin: centimetres("wmin"),
    wmax: centimetres("wmax"),
    dmin: centimetres("dmin"),
    dmax: centimetres("dmax"),
    page: /^[1-9]\d{0,2}$/.test(string("page")) ? Number(string("page")) : 1,
  };
}
/** Whether a measured size sits within the bounds; an unmeasured piece passes only when no bound is set. */
const within = (value: number | undefined, low: string, high: string) =>
  (!low && !high) || (value !== undefined && (!low || value >= Number(low)) && (!high || value <= Number(high)));
export function filterCollection<T extends CollectionProduct>(products: T[], query: CollectionQuery) {
  const min = query.min ? Math.round(Number(query.min) * 100) : 0;
  const max = query.max ? Math.round(Number(query.max) * 100) : Infinity;
  const materials = query.material ? query.material.split(",") : [];
  const colours = query.colour ? query.colour.split(",") : [];
  const filtered = products.filter((product) => {
    const text = `${product.title} ${product.description}`.toLowerCase();
    if (query.q && !text.includes(query.q.toLowerCase())) return false;
    if (query.category && product.category !== query.category) return false;
    if (materials.length && !productMaterials(product).some((key) => materials.includes(key))) return false;
    if (colours.length && !productColours(product).some((key) => colours.includes(key))) return false;
    if (query.wmin || query.wmax || query.dmin || query.dmax) {
      const size = productSize(product.sourceDetails?.dimensions);
      if (!within(size.width, query.wmin, query.wmax) || !within(size.depth, query.dmin, query.dmax)) return false;
    }
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
      (a, b) => byTitle(a, b) * (query.sort === "title-desc" ? -1 : 1),
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
/** The store's A–Z order as the listing shows it: letters compare without regard to case, so "Aera" comes before "ARVEN". */
export function byTitle(a: { title: string }, b: { title: string }) {
  return a.title.localeCompare(b.title);
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
  // The listing's newer filters default to unset, so a response from before them still reads.
  material: z.string().regex(/^(?:[a-z]+(?:,[a-z]+)*)?$/).max(100).default(""), colour: z.string().regex(/^(?:[a-z]+(?:,[a-z]+)*)?$/).max(100).default(""),
  wmin: z.string().regex(/^(?:[1-9]\d{0,2})?$/).default(""), wmax: z.string().regex(/^(?:[1-9]\d{0,2})?$/).default(""),
  dmin: z.string().regex(/^(?:[1-9]\d{0,2})?$/).default(""), dmax: z.string().regex(/^(?:[1-9]\d{0,2})?$/).default(""),
  page: z.number().int().min(1).max(999),
}).strict();
const facetCountSchema = z.object({ key: z.string().regex(/^[a-z]+$/).max(20), label: z.string().min(1).max(40), count: z.number().int().positive() }).strict();
export const collectionFacetsSchema = z.object({
  materials: z.array(facetCountSchema).max(materialFacets.length),
  colours: z.array(facetCountSchema).max(colourFacets.length),
  // The Category filter: a family's collections to open ("Dining Chairs", "Accent Chairs"), or else categories to filter by.
  categories: z.array(z.object({
    handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200), title: z.string().min(1).max(80),
    count: z.number().int().nonnegative(), current: z.boolean(), kind: z.enum(["collection", "filter"]),
  }).strict()).max(12),
  // The hero's photo and featured piece: the collection's first piece with a photo, whatever the filters, so it stays put
  // while browsing. Its address and price come with it for the featured-product card.
  cover: z.object({
    image: z.url().max(4096).refine((value) => value.startsWith("https://")), title: z.string().min(1).max(500),
    handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).optional(),
    pricePaise: z.number().int().min(0).max(1_000_000_000).nullable().optional(), priceFrom: z.boolean().optional(),
  }).strict().nullable(),
}).strict();
export type CollectionFacets = z.infer<typeof collectionFacetsSchema>;
/** How many of a collection's pieces answer to each material and colour, most common first; absent ones are left out. */
export function facetCounts(products: CollectionProduct[]): Pick<CollectionFacets, "materials" | "colours"> {
  const count = (facets: Facets, keysOf: (product: CollectionProduct) => string[]) => facets
    .map(([key, label]) => ({ key, label, count: products.filter((product) => keysOf(product).includes(key)).length }))
    .filter((facet) => facet.count > 0)
    .sort((a, b) => b.count - a.count);
  return { materials: count(materialFacets, productMaterials), colours: count(colourFacets, productColours) };
}
export const cataloguePageSchema = z.object({
  handle: z.string().min(1).max(200), query: queryResponseSchema,
  products: z.array(productCardSchema).max(24), total: z.number().int().nonnegative(),
  collectionTotal: z.number().int().nonnegative(), inStock: z.number().int().nonnegative(),
  outOfStock: z.number().int().nonnegative(), highestPrice: z.number().int().min(0).max(1_000_000_000).nullable(),
  // Optional so a response from before the filters stays readable.
  facets: collectionFacetsSchema.optional(),
  limit: z.union([z.literal(4), z.literal(24)]), published: z.literal(true),
  mode: z.literal("preview"), checkoutEnabled: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const maximumPage = Math.max(1, Math.ceil(value.total / value.limit));
  const expectedLength = Math.min(value.limit, Math.max(0, value.total - (value.query.page - 1) * value.limit));
  if (value.query.page > maximumPage || value.products.length !== expectedLength || value.total > value.collectionTotal || value.inStock > value.collectionTotal || value.outOfStock > value.collectionTotal || new Set(value.products.map(product => product.handle)).size !== value.products.length)
    ctx.addIssue({ code: "custom", message: "Inconsistent catalogue page" });
});
export type CataloguePage = z.infer<typeof cataloguePageSchema>;
