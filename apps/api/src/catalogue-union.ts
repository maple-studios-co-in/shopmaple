import { productSchema, type Product } from "@shopmaple/contracts";
import { adaptKeeriExportV2, keeriExportV2Schema } from "./keeri.js";
import {
  adaptShopifyCatalogue,
  approvedCatalogueImage,
} from "./shopify-catalogue.js";
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
/** Exact identity evidence only. Ambiguities stay as separate enquiry listings. */
export function planCatalogueUnion(
  shopifyInput: unknown,
  keeriInput: unknown,
  tenantId: string,
  existing: ExistingCatalogue = empty,
) {
  const shopify = adaptShopifyCatalogue(shopifyInput);
  const keeri = adaptKeeriExportV2(keeriInput, tenantId);
  const raw = keeriExportV2Schema.parse(keeriInput);
  const source = keeri.source;
  if (
    [...existing.productBindings, ...existing.variantBindings].some(
      (b) => b.source.startsWith("keeri:") && b.source !== source,
    )
  )
    throw new Error("FOREIGN_TENANT_BINDING");
  const binding = (rows: SourceBinding[], s: string, id: string) =>
    rows.find((b) => b.source === s && b.externalId === id)?.targetId;
  const old = new Map(existing.products.map((p) => [p.id, p]));
  const products = new Map<string, Product>();
  const productBindings: SourceBinding[] = [];
  const variantBindings: SourceBinding[] = [];
  for (const p of shopify.products) {
    const id = binding(existing.productBindings, "shopify", p.id) ?? p.id;
    const prior = old.get(id);
    products.set(id, {
      ...p,
      id,
      handle: prior?.handle ?? p.handle,
      description: p.description,
      images: p.images,
      category: p.category ?? prior?.category ?? null,
      variants: p.variants.map((v) => ({
        ...v,
        id: binding(existing.variantBindings, "shopify", v.id) ?? v.id,
      })),
    });
    productBindings.push({ source: "shopify", externalId: p.id, targetId: id });
    p.variants.forEach((v) =>
      variantBindings.push({
        source: "shopify",
        externalId: v.id,
        targetId: binding(existing.variantBindings, "shopify", v.id) ?? v.id,
      }),
    );
  }
  const shopVariants = [...products.values()].flatMap((p) =>
    p.variants.map((v) => ({ p, v })),
  );
  const skuIndex = new Map<string, typeof shopVariants>();
  for (const row of shopVariants) {
    if (row.v.sku)
      skuIndex.set(row.v.sku, [...(skuIndex.get(row.v.sku) ?? []), row]);
  }
  const shopProduct = (id: string) =>
    products.get(
      binding(existing.productBindings, "shopify", `preview-${id}`) ??
        `preview-${id}`,
    );
  const shopVariant = (id: string) =>
    shopVariants.find(
      (row) =>
        row.v.id ===
        (binding(existing.variantBindings, "shopify", `preview-${id}`) ??
          `preview-${id}`),
    );
  const keeriSkuCounts = new Map<string, number>();
  for (const v of keeri.products.flatMap((p) => p.variants))
    if (v.sku) keeriSkuCounts.set(v.sku, (keeriSkuCounts.get(v.sku) ?? 0) + 1);
  const candidates = keeri.products.map((p) => {
    const model = raw.models.find((m) => `${source}:${m.id}` === p.id)!;
    const targetProducts = new Set<string>();
    const variantMap = new Map<string, string>();
    let ambiguous = false;
    const bound = binding(existing.productBindings, source, p.id);
    if (bound) targetProducts.add(bound);
    if (model.shopifyProductId) {
      const target = shopProduct(model.shopifyProductId);
      if (target) targetProducts.add(target.id);
    }
    for (const v of p.variants) {
      const rawV = model.variants.find((r) => `${source}:${r.id}` === v.id)!;
      const targets = new Set<string>();
      const held = binding(existing.variantBindings, source, v.id);
      if (held) targets.add(held);
      if (rawV.shopifyVariantId) {
        const row = shopVariant(rawV.shopifyVariantId);
        if (row) {
          if (
            rawV.shopifyProductId &&
            row.p.id !== shopProduct(rawV.shopifyProductId)?.id
          )
            ambiguous = true;
          targets.add(row.v.id);
          targetProducts.add(row.p.id);
        }
      }
      const sameSku = v.sku ? skuIndex.get(v.sku) : undefined;
      if (sameSku?.length === 1 && keeriSkuCounts.get(v.sku!) === 1) {
        // A current SKU cannot override explicit stable identity evidence, even
        // when that former Shopify item is absent from the current snapshot.
        if (
          (rawV.shopifyVariantId &&
            shopVariant(rawV.shopifyVariantId)?.v.id !== sameSku[0]!.v.id) ||
          (rawV.shopifyProductId &&
            shopProduct(rawV.shopifyProductId)?.id !== sameSku[0]!.p.id) ||
          (model.shopifyProductId &&
            shopProduct(model.shopifyProductId)?.id !== sameSku[0]!.p.id)
        )
          ambiguous = true;
        targets.add(sameSku[0]!.v.id);
        targetProducts.add(sameSku[0]!.p.id);
      }
      if (targets.size > 1) ambiguous = true;
      if (targets.size === 1) variantMap.set(v.id, [...targets][0]!);
    }
    if (
      targetProducts.size > 1 ||
      new Set(variantMap.values()).size !== variantMap.size
    )
      ambiguous = true;
    const target = [...targetProducts][0];
    const publishedCategory = raw.publication.find((entry) => entry.modelId === model.id)?.category;
    return { p, target, variantMap, ambiguous, bound, publishedCategory };
  });
  const claims = new Map<string, number>();
  for (const c of candidates)
    if (c.target) claims.set(c.target, (claims.get(c.target) ?? 0) + 1);
  let mergedModels = 0;
  let ambiguousModels = 0;
  for (const c of candidates) {
    const ambiguous =
      c.ambiguous ||
      (c.target !== undefined && (claims.get(c.target) ?? 0) > 1);
    if (ambiguous && c.bound) throw new Error("EXISTING_IDENTITY_CONFLICT");
    if (ambiguous) ambiguousModels++;
    const target = !ambiguous ? c.target : undefined;
    const base = target ? products.get(target) : undefined;
    const id = target ?? c.p.id;
    const prior = base ?? old.get(id);
    if (prior && !["shopify-preview", source].includes(prior.source))
      throw new Error("FOREIGN_SOURCE_IDENTITY");
    if (base) mergedModels++;
    const variants = new Map((base?.variants ?? []).map((v) => [v.id, v]));
    for (const v of c.p.variants) {
      const variantId = !ambiguous ? (c.variantMap.get(v.id) ?? v.id) : v.id;
      const before = base?.variants.find((v) => v.id === variantId);
      variants.set(variantId, {
        ...v,
        id: variantId,
        title: before?.title ?? v.title,
        // A merged listing filters Keeri photos to approved hosts rather than failing, as its gallery does.
        images: base ? (v.images ?? []).filter(approvedCatalogueImage) : v.images,
        // V2 MRP has no reliable tax/market basis. Keep it in Keeri, never label it a buyer price.
        pricePaise: before?.pricePaise ?? null,
        compareAtPaise: before?.compareAtPaise ?? null,
        available: false,
      });
      variantBindings.push({ source, externalId: v.id, targetId: variantId });
    }
    const product = productSchema.parse({
      ...c.p,
      id,
      handle: prior?.handle ?? c.p.handle,
      // Shopify owns display presentation for exact matches, including empty
      // current fields. Keeri remains the source of operational variant data.
      title: base ? base.title : c.p.title,
      description: base ? base.description : c.p.description,
      pdpContent: base?.pdpContent ?? null,
      // Explicit channel categories outrank a fallback derived from the source type.
      category: c.publishedCategory ?? base?.category ?? c.p.category ?? null,
      images: [...new Set([...(base?.images ?? []), ...(base ? c.p.images.filter(approvedCatalogueImage) : c.p.images)])],
      source: base ? "shopify-preview" : source,
      variants: [...variants.values()],
    });
    products.set(id, product);
    productBindings.push({ source, externalId: c.p.id, targetId: id });
  }
  const named = nameAddresses([...products.values()], raw.models, existing);
  const handleAliases = named.flatMap((p) => p.alias ? [{ handle: p.alias, productId: p.product.id }] : []);
  const result = named.map((p) => p.product);
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
    shopifyCapturedAt: shopify.capturedAt,
    publicPricesCapturedAt: shopify.publicPricesCapturedAt,
    report: {
      shopifyProducts: shopify.products.length,
      keeriProducts: keeri.products.length,
      mergedModels,
      ambiguousModels,
      totalProducts: result.length,
      totalVariants: variantIds.size,
    },
  };
}

/** A readable address segment: "Zyro Lounge" -> "zyro-lounge"; accents dropped, at most 80 characters. */
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
