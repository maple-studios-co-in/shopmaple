import type { PrismaClient, Prisma } from "@prisma/client";
import type { Express, Response } from "express";
import { z } from "zod";
import {
  catalogueHandleSchema, cataloguePageSchema, catalogueCardResponseSchema, catalogueCardsResponseSchema,
  categories, relatedCatalogueCardsResponseSchema,
  collectionQuery, filterCollection, facetCounts,
  toProductCard, canOrder, pricedVariants, sourceTaxonomySchema,
} from "@shopmaple/contracts";
import { collectionTitles, collectionMembers, collectionCategories } from "@shopmaple/contracts/catalogue-registry";
import { HttpError } from "./cart.js";

const amount = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/);
const collectionInput = z.object({
  q: z.string().max(80).optional(),
  sort: z.enum(["featured", "title", "title-desc", "price-asc", "price-desc"]).optional(),
  availability: z.enum(["in", "out"]).optional(),
  min: amount.optional(), max: amount.optional(),
  category: z.enum(["sofas", "chairs", "tables", "beds", "storage", "outdoors"]).optional(),
  material: z.string().regex(/^[a-z]+(?:,[a-z]+)*$/).max(100).optional(),
  colour: z.string().regex(/^[a-z]+(?:,[a-z]+)*$/).max(100).optional(),
  wmin: z.string().regex(/^[1-9]\d{0,2}$/).optional(), wmax: z.string().regex(/^[1-9]\d{0,2}$/).optional(),
  dmin: z.string().regex(/^[1-9]\d{0,2}$/).optional(), dmax: z.string().regex(/^[1-9]\d{0,2}$/).optional(),
  page: z.string().regex(/^[1-9]\d{0,2}$/).optional(),
  limit: z.enum(["4", "24"]).optional(),
}).strict();
const batchInput = z.object({
  handles: z.string().min(1).max(10049).transform(value => value.split(","))
    .pipe(z.array(catalogueHandleSchema).min(1).max(50))
    .refine(handles => new Set(handles).size === handles.length, "Duplicate handles"),
}).strict();
const relatedInput = z.object({ category: z.enum(categories) }).strict();
const cardSelect = {
  id: true, handle: true, title: true, images: true, category: true, reviewCount: true, reviewAverage: true,
  variants: { where: { published: true }, orderBy: { id: "asc" }, select: { pricePaise: true, compareAtPaise: true, title: true, images: true, slug: true } },
} satisfies Prisma.ProductSelect;
const collectionSelect = {
  ...cardSelect, description: true, sourceTaxonomy: true, sourceDetails: true,
  variants: { ...cardSelect.variants, select: { ...cardSelect.variants.select, available: true, stockPolicy: true } },
} satisfies Prisma.ProductSelect;
const cache = "public, max-age=30, s-maxage=60";
// The two catalogue texts the listing's Material and Size filters read; anything else stored there is ignored.
const catalogueText = z.object({ materials: z.string().nullable().optional(), dimensions: z.string().nullable().optional() }).nullable();
/** The listing hero's photo and featured piece: the first member with its own https photo, in the collection's order. */
function coverOf(members: Parameters<typeof toProductCard>[0][]) {
  const first = members.find(product => product.images[0]?.startsWith("https://"));
  if (!first) return null;
  const card = toProductCard(first);
  return { image: first.images[0]!, title: first.title, handle: first.handle, pricePaise: card.pricePaise, priceFrom: card.priceFrom };
}

function sendCatalogue<T>(res: Response, schema: z.ZodType<T>, value: unknown, extra: Record<string, unknown> = {}) {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.set("Cache-Control", "private, no-store");
    // Stored output failures are server errors, distinct from invalid request input.
    throw new HttpError(500, "SERVER_ERROR", "We couldn't complete that request. Please try again.");
  }
  res.set("Cache-Control", cache).json({ ...result.data, ...extra });
}

export function registerCatalogueViewRoutes(app: Express, db: PrismaClient) {
  app.get("/api/catalogue/related", async (req, res) => {
    const { category } = relatedInput.parse(req.query);
    const products = await db.product.findMany({
      where: { published: true, category }, select: cardSelect,
      orderBy: [{ title: "asc" }, { id: "asc" }], take: 5,
    });
    sendCatalogue(res, relatedCatalogueCardsResponseSchema, { category, products: products.map(toProductCard), published: true });
  });
  app.get("/api/catalogue/collections/:handle", async (req, res) => {
    const handle = catalogueHandleSchema.parse(req.params.handle);
    if (!Object.hasOwn(collectionTitles, handle)) throw new HttpError(404, "COLLECTION_NOT_FOUND", "We couldn't find that collection.");
    const input = collectionInput.parse(req.query);
    const query = collectionQuery(input);
    const limit = Number(input.limit ?? "24") as 4 | 24;
    // Membership and facets need the complete compact catalogue once, not one
    // full-record database read for each API page fetched by the web server.
    const products = (await db.product.findMany({ where: { published: true }, select: collectionSelect, orderBy: [{ title: "asc" }, { id: "asc" }] }))
      .map(product => ({ ...product, sourceTaxonomy: sourceTaxonomySchema.nullable().catch(null).parse(product.sourceTaxonomy), sourceDetails: catalogueText.catch(null).parse(product.sourceDetails) }));
    const members = collectionMembers(products, handle);
    const filtered = filterCollection(members, query);
    const page = Math.min(query.page, Math.max(1, Math.ceil(filtered.length / limit)));
    const knownPrices = members.flatMap(product => pricedVariants(product).map(variant => variant.pricePaise));
    sendCatalogue(res, cataloguePageSchema, {
      handle, query: { ...query, page }, products: filtered.slice((page - 1) * limit, page * limit).map(toProductCard),
      total: filtered.length, collectionTotal: members.length,
      inStock: members.filter(product => product.variants.some(canOrder)).length,
      outOfStock: members.filter(product => !product.variants.length || product.variants.some(variant => !canOrder(variant))).length,
      highestPrice: knownPrices.length ? Math.max(...knownPrices) : null,
      facets: { ...facetCounts(members), categories: collectionCategories(products, handle), cover: coverOf(members) },
      limit, published: true, mode: "preview", checkoutEnabled: false,
    });
  });
  app.get("/api/catalogue/cards", async (req, res) => {
    const { handles } = batchInput.parse(req.query);
    // Saved picks (homepage merchandising, wishlists) may still name a renamed keeri-<id> address.
    const aliases = await db.productHandleAlias.findMany({ where: { handle: { in: handles } }, select: { handle: true, product: { select: { handle: true } } } });
    const current = new Map(aliases.map(alias => [alias.handle, alias.product.handle]));
    const wanted = handles.map(handle => current.get(handle) ?? handle);
    const products = await db.product.findMany({ where: { published: true, handle: { in: wanted } }, select: cardSelect });
    const byHandle = new Map(products.map(product => [product.handle, toProductCard(product)]));
    const seen = new Set<string>();
    const moved: { handle: string; from: string }[] = [];
    const ordered = handles.flatMap((asked, index) => {
      const handle = wanted[index]!;
      if (!byHandle.has(handle) || seen.has(handle)) return [];
      seen.add(handle);
      if (handle !== asked) moved.push({ handle, from: asked });
      return [byHandle.get(handle)!];
    });
    // `moved` stays out of the shared contract, which every page's script carries; only the server reads it.
    sendCatalogue(res, catalogueCardsResponseSchema, { products: ordered, published: true }, moved.length ? { moved } : {});
  });
  app.get("/api/catalogue/cards/:handle", async (req, res) => {
    const handle = catalogueHandleSchema.parse(req.params.handle);
    z.object({}).strict().parse(req.query);
    const product = await db.product.findFirst({ where: { handle, published: true }, select: cardSelect });
    if (!product) {
      const alias = await db.productHandleAlias.findUnique({ where: { handle }, select: { product: { select: { handle: true, published: true } } } });
      if (alias?.product.published) {
        res.set("Cache-Control", "public, max-age=300, s-maxage=3600").redirect(308, `/api/catalogue/cards/${encodeURIComponent(alias.product.handle)}`);
        return;
      }
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product.");
    }
    sendCatalogue(res, catalogueCardResponseSchema, { product: toProductCard(product), published: true });
  });
}
