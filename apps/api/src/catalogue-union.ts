import { productSchema, type Product } from "@shopmaple/contracts";
import { adaptKeeriExportV2, keeriExportV2Schema } from "./keeri.js";
import { approvedCatalogueImage } from "./catalogue-images.js";
export interface SourceBinding {
  source: string;
  externalId: string;
  targetId: string;
}
export interface ExistingCatalogue {
  products: Product[];
  productBindings: SourceBinding[];
  variantBindings: SourceBinding[];
  /** Earlier addresses that redirect; a rename never takes one. */
  handleAliases?: { handle: string; productId: string }[];
}
const empty: ExistingCatalogue = {
  products: [],
  productBindings: [],
  variantBindings: [],
  handleAliases: [],
};
/**
 * The store's catalogue from Keeri alone (owner, 11 Nov 2026): every product Keeri publishes to the store, with Keeri's
 * title, description, copy, photos and prices. Nothing comes from Shopify any more.
 *
 * A Keeri product that earlier syncs merged into a former Shopify listing keeps that listing's store identity through the
 * recorded bindings: its product id, its address (handle), its variant ids (so carts keep pointing at them) and each
 * variant's `?variant=` value. Only its presentation changes to Keeri's. A former listing that Keeri does not publish is
 * left out here; the sync unpublishes it (catalogue-union-sync.ts).
 */
export function planCatalogueUnion(
  keeriInput: unknown,
  tenantId: string,
  existing: ExistingCatalogue = empty,
) {
  const keeri = adaptKeeriExportV2(keeriInput, tenantId);
  const raw = keeriExportV2Schema.parse(keeriInput);
  const source = keeri.source;
  if (
    [...existing.productBindings, ...existing.variantBindings].some(
      (b) => b.source.startsWith("keeri:") && b.source !== source,
    )
  )
    throw new Error("FOREIGN_TENANT_BINDING");
  const binding = (rows: SourceBinding[], id: string) =>
    rows.find((b) => b.source === source && b.externalId === id)?.targetId;
  const old = new Map(existing.products.map((p) => [p.id, p]));
  const variantOwner = new Map(existing.products.flatMap((p) => p.variants.map((v) => [v.id, p.id] as const)));
  const claims = new Set<string>();
  const products = new Map<string, Product>();
  const productBindings: SourceBinding[] = [];
  const variantBindings: SourceBinding[] = [];
  let formerShopifyListings = 0;
  let keeriPricedVariants = 0;
  for (const p of keeri.products) {
    const id = binding(existing.productBindings, p.id) ?? p.id;
    // One store product per Keeri product: a recorded identity is never shared or moved.
    if (claims.has(id)) throw new Error("EXISTING_IDENTITY_CONFLICT");
    claims.add(id);
    const prior = old.get(id);
    if (prior && !["shopify-preview", source].includes(prior.source))
      throw new Error("FOREIGN_SOURCE_IDENTITY");
    // A former Shopify listing drops a photo from an unapproved host rather than failing the sync, as it always has.
    const formerListing = prior?.source === "shopify-preview";
    if (formerListing) formerShopifyListings++;
    const variants = p.variants.map((v) => {
      const variantId = binding(existing.variantBindings, v.id) ?? v.id;
      const owner = variantOwner.get(variantId);
      if (owner && owner !== id) throw new Error("EXISTING_IDENTITY_CONFLICT");
      if (v.pricePaise != null) keeriPricedVariants++;
      variantBindings.push({ source, externalId: v.id, targetId: variantId });
      return {
        ...v,
        id: variantId,
        images: formerListing ? (v.images ?? []).filter(approvedCatalogueImage) : v.images,
        // Only a variant with Keeri's store price may be bought (owner, 7 Nov 2026).
        available: v.available && v.pricePaise != null,
      };
    });
    products.set(id, productSchema.parse({
      ...p,
      id,
      handle: prior?.handle ?? p.handle,
      // Keeri's copy is `sourceDetails`; the copy blocks a former Shopify listing carried are not shown any more.
      pdpContent: null,
      images: formerListing ? p.images.filter(approvedCatalogueImage) : p.images,
      source,
      variants,
    }));
    productBindings.push({ source, externalId: p.id, targetId: id });
  }
  const named = nameAddresses([...products.values()], raw.models, existing);
  const handleAliases = named.flatMap((p) => p.alias ? [{ handle: p.alias, productId: p.product.id }] : []);
  const result = translateProductPages(named.map((p) => p.product), productBindings, variantBindings);
  const handles = new Set<string>();
  const variantIds = new Set<string>();
  for (const p of result) {
    if (handles.has(p.handle)) throw new Error("HANDLE_COLLISION");
    handles.add(p.handle);
    for (const image of p.images)
      if (!approvedCatalogueImage(image))
        throw new Error("UNSUPPORTED_PUBLIC_MEDIA");
    for (const v of p.variants) {
      if ((v.images ?? []).some((image) => !approvedCatalogueImage(image)))
        throw new Error("UNSUPPORTED_PUBLIC_MEDIA");
      if (variantIds.has(v.id)) throw new Error("VARIANT_IDENTITY_COLLISION");
      variantIds.add(v.id);
    }
  }
  return {
    products: result,
    handleAliases,
    productBindings,
    variantBindings,
    source,
    capturedAt: keeri.capturedAt,
    report: {
      keeriProducts: keeri.products.length,
      formerShopifyListings,
      keeriPricedVariants,
      totalProducts: result.length,
      totalVariants: variantIds.size,
    },
  };
}

/** A readable address segment: "Zyro Lounge" -> "zyro-lounge"; accents dropped, at most 80 characters. */
/**
 * Keeri's product-page data names Keeri ids; a former Shopify listing keeps its store product and variant ids.
 * Point bundles, reviews and photos at the final store ids and addresses. A bundle with a piece the store
 * does not list is left out rather than offered incomplete.
 */
function translateProductPages(products: Product[], productBindings: SourceBinding[], variantBindings: SourceBinding[]) {
  const productTarget = new Map(productBindings.map((b) => [b.externalId, b.targetId]));
  const variantTarget = new Map(variantBindings.map((b) => [b.externalId, b.targetId]));
  const handles = new Map(products.map((p) => [p.id, p.handle]));
  const variant = (value: string | null) => (value === null ? null : variantTarget.get(value) ?? null);
  return products.map((p) => {
    if (!p.productPage) return p;
    const page = p.productPage;
    return productSchema.parse({
      ...p,
      productPage: {
        ...page,
        media: page.media.filter((m) => approvedCatalogueImage(m.url)).map((m) => ({ ...m, variantId: variant(m.variantId) })),
        reviews: { ...page.reviews, items: page.reviews.items.map((r) => ({ ...r, variantId: variant(r.variantId) })) },
        bundles: page.bundles.flatMap((bundle) => {
          const items = bundle.items.map((item) => {
            const productId = productTarget.get(item.productId);
            const handle = productId && handles.get(productId);
            return handle ? { ...item, productId: productId!, handle, variantId: variant(item.variantId) } : null;
          });
          return items.every((item) => item !== null) ? [{ ...bundle, items }] : [];
        }),
      },
    });
  });
}
export function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}
/** The first of the candidates (then the first with a number) that `taken` does not hold. */
function unique(candidates: string[], taken: Set<string>) {
  const options = candidates.filter(Boolean);
  const free = options.find((c) => !taken.has(c));
  if (free) return free;
  const base = options[0] ?? "item";
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
/**
 * Readable addresses. A Keeri product still on its fallback address (keeri-<model id>) is renamed
 * once to its name, then its name and type, then a number (a name with no letters becomes its type
 * and Keeri id), and the old address is kept as an alias for a permanent redirect. The new address
 * avoids every address in this run, every stored product (published or not) and every alias.
 * Every other address is already published and never changes. Each variant keeps the `?variant=`
 * value it already has; a new variant gets one from its title that no variant of its product used.
 */
function nameAddresses(products: Product[], models: { id: string; productType: string }[], existing: ExistingCatalogue) {
  const types = new Map(models.map((m) => [m.id, m.productType]));
  const ids = new Set(products.map((p) => p.id));
  const taken = new Set([
    ...products.filter((p) => !isFallback(p)).map((p) => p.handle),
    ...existing.products.filter((p) => !ids.has(p.id)).map((p) => p.handle),
    ...(existing.handleAliases ?? []).map((a) => a.handle),
  ]);
  const before = new Map(existing.products.map((p) => [p.id, p]));
  return [...products].sort((a, b) => a.id.localeCompare(b.id)).map((product) => {
    const prior = new Map((before.get(product.id)?.variants ?? []).map((v) => [v.id, v.slug]));
    const used = new Set([...prior.values()].filter((slug): slug is string => Boolean(slug)));
    const variants = product.variants.map((v) => {
      const kept = prior.get(v.id);
      if (kept) return { ...v, slug: kept };
      const slug = unique([slugify(v.title) || "variant"], used);
      used.add(slug);
      return { ...v, slug };
    });
    if (!isFallback(product)) return { product: { ...product, variants }, alias: null };
    const modelId = product.id.split(":").at(-1) ?? "";
    const type = types.get(modelId) ?? "";
    const name = slugify(product.title);
    const handle = unique(name ? [name, slugify(`${product.title} ${type}`)] : [`${slugify(type) || "product"}-${slugify(modelId)}`], taken);
    taken.add(handle);
    return { product: { ...product, handle, variants }, alias: product.handle };
  });
}
/** Still on Keeri's fallback address: exactly keeri-<its model id>, not merely a name starting with "keeri". */
const isFallback = (p: Product) => p.source.startsWith("keeri:") && p.handle === `keeri-${p.id.split(":").at(-1)}`;
