import { z } from "zod";
import { compareLeadPhoto } from "./primary-photo.js";
import { minOrderQuantitySchema, productOfferSchema, productSchema, sourceDetailsSchema, hotspotTypes, reviewSources, customisationOptions, type Product, type ProductPage } from "@shopmaple/contracts";

const id = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(64);
const time = z.iso.datetime({ offset: true });
// Match only explicit source types. Product titles and descriptions are not category evidence.
const productTypeCategories = new Map<string, Product["category"]>([
  ["chair", "chairs"], ["chairs", "chairs"],
  ["table", "tables"], ["tables", "tables"],
  ["sofa", "sofas"], ["sofas", "sofas"],
  ["bed", "beds"], ["beds", "beds"],
  ["storage", "storage"], ["outdoors", "outdoors"],
  // Keeri's own storage and nursery types (owner, 12 Nov 2026): without these its chests, bookcases and cabinets
  // reached no category page.
  ["chest", "storage"], ["bookcase", "storage"], ["cabinet", "storage"], ["crib", "beds"],
]);
/** A media row with its role when Keeri sent one (v2 rows carry it; v1 rows never do). */
const roleOf = (m: { id: string; position: number }) => ({ id: m.id, position: m.position, role: "role" in m && typeof m.role === "string" ? m.role : null });
const mediaSchema = z
  .object({
    id,
    tenantId: id,
    modelId: id.nullable(),
    variantId: id.nullable(),
    stage: z.string(),
    storageKey: z.string().nullable(),
    supersededAt: time.nullable(),
    position: z.number().int(),
  })
  .strict();
const variantSchema = z
  .object({
    id,
    tenantId: id,
    modelId: id,
    sku: z.string().trim().min(1).max(300),
    variantName: z.string().nullable(),
    status: z.string(),
    published: z.boolean(),
    deletedAt: time.nullable(),
    stockPolicy: z.enum(["stocked", "made_to_order", "dropship"]),
    updatedAt: time,
    prices: z
      .array(
        z
          .object({
            kind: z.string(),
            amount: z.number().int().min(0).max(1_000_000_000),
            currency: z.literal("INR"),
            updatedAt: time,
          })
          .strict(),
      )
      .max(30),
    media: z.array(mediaSchema),
  })
  .strict();
export const keeriExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("keeri-export"),
    complete: z.literal(true),
    tenantId: id,
    capturedAt: time,
    models: z
      .array(
        z
          .object({
            id,
            tenantId: id,
            name: z.string().trim().min(1).max(500),
            productType: z.string(),
            description: z.string().max(50000).nullable(),
            status: z.string(),
            deletedAt: time.nullable(),
            updatedAt: time,
            media: z.array(mediaSchema),
            variants: z.array(variantSchema).max(500),
          })
          .strict(),
      )
      .max(5000),
    publication: z
      .array(
        z
          .object({
            modelId: id,
            handle: productSchema.shape.handle,
            category: productSchema.shape.category,
          })
          .strict(),
      )
      .max(5000),
    publicMedia: z
      .array(
        z
          .object({
            assetId: id,
            url: z.url().refine((value) => {
              const url = new URL(value);
              return (
                url.protocol === "https:" && !url.username && !url.password
              );
            }),
          })
          .strict(),
      )
      .max(150000),
  })
  .strict();
const shopifyId = z
  .string()
  .regex(/^[1-9][0-9]{0,30}$/)
  .nullable();
const positiveInt = z.number().int().min(1).max(1_000_000);
/** Packed carton measurements for one unit, or null when staff left any of them unstated. */
const shippingSchema = z
  .object({
    packedWeightGrams: positiveInt,
    cartonLengthCm: positiveInt,
    cartonWidthCm: positiveInt,
    cartonHeightCm: positiveInt,
    cartonCount: positiveInt,
  })
  .strict()
  .nullable();
/** How Keeri would fulfil the variant; null for dropship and unverified policies. */
const fulfilmentSchema = z
  .object({
    kind: z.enum(["stocked", "made_to_order"]),
    leadTimeDays: z.number().int().min(1).max(365).nullable(),
  })
  .strict()
  .nullable();
/**
 * What the buyer pays, GST included, as Keeri works it out for the store and its
 * quote. Keeri's `mrp` is before GST, so it is never a price to show: without a
 * `store_price` (an older Keeri) the variant has no Keeri price at all.
 */
const storePriceOf = (v: { prices: { kind: string; amount: number }[] }) =>
  v.prices.find((p) => p.kind === "store_price" && p.amount > 0)?.amount ?? null;
/** Keeri's struck-through store price, only where it is above the store price it is struck against. */
const compareAtOf = (v: { prices: { kind: string; amount: number }[] }) => {
  const price = storePriceOf(v);
  const compareAt = v.prices.find((p) => p.kind === "compare_at")?.amount ?? null;
  return price !== null && compareAt !== null && compareAt > price ? compareAt : null;
};

/** Keeri's own verdict on whether the variant can be quoted and held today, with reason codes. */
const eligibilitySchema = z
  .object({
    sellable: z.boolean(),
    reasons: z.array(z.string().max(64)).max(20),
  })
  .strict();
// --- Keeri's `productPage=1` level (Keeri docs/shopmaple-product-page.md). Every block is optional so an
// export from a lower level, or an older Keeri, still parses; the store records nothing it did not send.
const measure = z.number().positive().max(10_000).nullable();
const specsSchema = z.object({ widthCm: measure, depthCm: measure, heightCm: measure, seatHeightCm: measure, weightKg: measure }).strict();
const mediaV2Schema = mediaSchema.extend({
  role: z.string().trim().min(1).max(40).optional(),
  width: z.number().int().positive().max(20_000).nullable().optional(),
  height: z.number().int().positive().max(20_000).nullable().optional(),
  altText: z.string().trim().max(250).nullable().optional(),
  realPhoto: z.boolean().optional(),
  hotspots: z.array(z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    label: z.string().trim().min(1).max(60), text: z.string().trim().max(300), type: z.enum(hotspotTypes),
  }).strict()).max(12).optional(),
});
const modelPageSchema = z.object({
  specs: specsSchema,
  highlights: z.array(z.string().trim().min(1).max(120)).max(5),
  faq: z.array(z.object({ question: z.string().trim().min(1).max(200), answer: z.string().trim().min(1).max(2000) }).strict()).max(20),
  assembly: z.object({ required: z.boolean(), minutes: z.number().int().min(1).max(1440).nullable() }).strict().nullable(),
  customisation: z.object({ options: z.array(z.enum(customisationOptions)).max(6), note: z.string().trim().max(500).nullable() }).strict().nullable(),
  rooms: z.array(z.object({ id, name: z.string().trim().min(1).max(120) }).strict()).max(20),
  bundleIds: z.array(id).max(20),
  reviews: z.object({
    average: z.number().min(1).max(5).nullable(),
    count: z.number().int().min(0),
    items: z.array(z.object({
      id, rating: z.number().int().min(1).max(5),
      title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(2000),
      reviewerName: z.string().trim().min(1).max(60), city: z.string().trim().min(1).max(60).nullable(),
      reviewedAt: z.iso.date(), source: z.enum(reviewSources), verifiedBuyer: z.boolean(), variantId: id.nullable(),
      photos: z.array(z.object({
        id, url: z.string().regex(/^https:\/\/(?:store|shop)\.maplefurnishers\.com\/media\/keeri-review\/[A-Za-z0-9_-]{1,64}\.webp$/),
        width: z.number().int().positive().max(20_000).nullable(), height: z.number().int().positive().max(20_000).nullable(),
      }).strict()).max(5),
    }).strict()).max(50),
  }).strict(),
}).strict();
const copyText = z.string().max(10_000).nullable();
const variantPageSchema = z.object({
  specs: specsSchema,
  copy: z.object({ description: copyText, details: copyText, materials: copyText, dimensions: copyText, careInstructions: copyText }).strict(),
  batch: z.object({ remaining: z.number().int().min(1), showAtOrBelow: z.number().int().min(1) }).strict().nullable(),
}).strict();
const bundleSchema = z.object({
  id, name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable(),
  items: z.array(z.object({ modelId: id, variantId: id.nullable(), quantity: z.number().int().min(1).max(20) }).strict()).min(2).max(6),
}).strict();
/** A variant's named options ("Fabric: Ivory Boucle"), which name a variant Keeri left unnamed. */
function variantOptions(v: object) {
  const attributes = "attributes" in v && Array.isArray(v.attributes) ? (v.attributes as { axis: string; value: string }[]) : [];
  return attributes
    .map((a) => ({ axis: a.axis.trim(), value: a.value.trim() }))
    .filter((a) => a.axis && a.value)
    .map((a) => ({ name: a.axis.charAt(0).toUpperCase() + a.axis.slice(1), value: a.value }));
}
export const keeriExportV2Schema = keeriExportSchema.extend({
  schemaVersion: z.literal(2),
  models: z
    .array(
      keeriExportSchema.shape.models.element.extend({
        content: sourceDetailsSchema.optional(),
        media: z.array(mediaV2Schema),
        productPage: modelPageSchema.optional(),
        // The `offers=1` level: the model's running or next offer, or null. Absent below that level.
        offer: productOfferSchema.nullable().optional(),
        // The `minOrder=1` level: the fewest pieces of the design an order may hold, or null. Absent below that level.
        minOrderQuantity: minOrderQuantitySchema.nullable().optional(),
        taxonomy: z.object({ category: z.string().max(200).nullable(), subCategory: z.string().max(200).nullable() }).strict().optional(),
        channelPublished: z.boolean(),
        shopifyProductId: shopifyId,
        variants: z
          .array(
            variantSchema.extend({
              channelPublished: z.boolean(),
              // Named options (fabric, polish, size...), sent only when the store asks for attributes.
              // Blank values are tolerated here and dropped below, so one empty cell never fails the catalogue.
              attributes: z.array(z.object({
                axis: z.string().max(80), value: z.string().max(200),
                // The SKU code and swatch colour of the choice, at the product-page level.
                code: z.string().max(20).nullable().optional(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
              }).strict()).max(20).optional(),
              media: z.array(mediaV2Schema),
              productPage: variantPageSchema.optional(),
              sku: z.string().trim().max(300).nullable(),
              stockPolicy: z.enum([
                "stocked",
                "made_to_order",
                "dropship",
                "unverified",
              ]),
              shopifyProductId: shopifyId,
              shopifyVariantId: shopifyId,
              // Added by Keeri on 2026-10-27; optional so an older export still parses.
              // The store records nothing from them yet: cart eligibility is still decided
              // at quote time by Keeri, and delivery pricing by the quote policy.
              shipping: shippingSchema.optional(),
              fulfilment: fulfilmentSchema.optional(),
              eligibility: eligibilitySchema.optional(),
              // The `freeDelivery=1` level: staff's free-delivery tick on a selected ShopMaple row. Absent below that level.
              freeDelivery: z.boolean().optional(),
            }),
          )
          .max(500),
      }),
    )
    .max(5000),
  /** Complete-the-look sets, only at the product-page level. */
  bundles: z.array(bundleSchema).max(500).optional(),
});
/** Keeri's own verdict, taken only when it agrees with itself: a sellable
 * variant states a fulfilment matching its stock policy, a lead time exactly
 * when made to order, and an INR MRP (the store price its quote charges is built from it). */
function keeriSellable(v: object) {
  const x = v as {
    stockPolicy: string;
    prices: { kind: string; amount: number }[];
    fulfilment?: { kind: string; leadTimeDays: number | null } | null;
    eligibility?: { sellable: boolean };
  };
  const f = x.fulfilment;
  return (
    x.eligibility?.sellable === true &&
    !!f &&
    f.kind === x.stockPolicy &&
    (f.kind === "made_to_order") === (f.leadTimeDays !== null) &&
    x.prices.some((p) => p.kind === "mrp" && p.amount > 0)
  );
}
export function adaptKeeriExportV2(input: unknown, expectedTenantId: string) {
  return adaptValidated(keeriExportV2Schema.parse(input), expectedTenantId);
}
export type KeeriExport = z.infer<typeof keeriExportSchema>;
type V2Model = z.infer<typeof keeriExportV2Schema>["models"][number];
type V2Variant = V2Model["variants"][number];

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label}`);
}

/** Explicit projection of Keeri's schema, not the admin API response shape. */
export function adaptKeeriExport(input: unknown, expectedTenantId: string) {
  return adaptValidated(keeriExportSchema.parse(input), expectedTenantId);
}
function adaptValidated(
  data: KeeriExport | z.infer<typeof keeriExportV2Schema>,
  expectedTenantId: string,
) {
  if (data.tenantId !== expectedTenantId)
    throw new Error("Keeri tenant mismatch");
  const source = `keeri:${data.tenantId}`;
  const identity = (value: string) => `keeri:${data.tenantId}:${value}`;
  const variants = data.models.flatMap<
    | KeeriExport["models"][number]["variants"][number]
    | z.infer<typeof keeriExportV2Schema>["models"][number]["variants"][number]
  >((m) => m.variants);
  unique(
    data.models.map((m) => m.id),
    "model identity",
  );
  unique(
    variants.map((v) => v.id),
    "variant identity",
  );
  if (data.schemaVersion === 1)
    unique(
      variants.map((v) => v.sku).filter((sku): sku is string => sku !== null),
      "SKU",
    );
  unique(
    data.publication.map((p) => p.modelId),
    "publication model",
  );
  unique(
    data.publication.map((p) => p.handle),
    "publication handle",
  );
  unique(
    data.publicMedia.map((p) => p.assetId),
    "public media mapping",
  );
  const media = data.models.flatMap((m) => [
    ...m.media,
    ...m.variants.flatMap((v) => v.media),
  ]);
  // Prisma's model.media can include variant-bound rows too. Repeated rows must agree.
  const knownMedia = new Map<string, string>();
  for (const row of media) {
    const previous = knownMedia.get(row.id);
    const current = JSON.stringify(row);
    if (previous && previous !== current)
      throw new Error("Conflicting media identity");
    knownMedia.set(row.id, current);
  }
  for (const p of data.publication)
    if (!data.models.some((m) => m.id === p.modelId))
      throw new Error("Unknown publication model");
  for (const p of data.publicMedia)
    if (!knownMedia.has(p.assetId))
      throw new Error("Unknown public media asset");
  const capturedAt = Date.parse(data.capturedAt);
  const checkTime = (value: string) => {
    if (Date.parse(value) > capturedAt)
      throw new Error("Source timestamp is newer than snapshot");
  };
  for (const model of data.models) {
    if (model.tenantId !== data.tenantId)
      throw new Error("Model tenant mismatch");
    checkTime(model.updatedAt);
    for (const variant of model.variants) {
      if (variant.tenantId !== data.tenantId || variant.modelId !== model.id)
        throw new Error("Variant ownership mismatch");
      checkTime(variant.updatedAt);
      unique(
        variant.prices.map((p) => p.kind),
        "price tier",
      );
      variant.prices.forEach((p) => checkTime(p.updatedAt));
      for (const asset of variant.media)
        if (
          asset.variantId !== variant.id ||
          (asset.modelId !== null && asset.modelId !== model.id)
        )
          throw new Error("Variant media ownership mismatch");
    }
    for (const asset of model.media)
      if (
        asset.modelId !== model.id ||
        (asset.variantId !== null &&
          !model.variants.some((v) => v.id === asset.variantId))
      )
        throw new Error("Model media ownership mismatch");
  }
  if (media.some((m) => m.tenantId !== data.tenantId))
    throw new Error("Media tenant mismatch");
  const publicMedia = new Map(data.publicMedia.map((m) => [m.assetId, m.url]));
  const handles = new Map(data.publication.map((p) => [p.modelId, p.handle]));
  const bundles = new Map(("bundles" in data ? data.bundles ?? [] : []).map((b) => [b.id, b]));
  const modelVariants = new Map(data.models.map((m) => [m.id, new Set(m.variants.map((v) => v.id))]));
  for (const bundle of bundles.values())
    for (const item of bundle.items) {
      // Keeri exports a bundle only when every design is in the same snapshot.
      if (!modelVariants.has(item.modelId) || !handles.has(item.modelId)) throw new Error("Unknown bundle model");
      if (item.variantId && !modelVariants.get(item.modelId)!.has(item.variantId)) throw new Error("Bundle variant mismatch");
    }
  /** The product page's extra data, with Keeri ids turned into store ids (the union maps merged listings). */
  const pageOf = (model: V2Model, eligible: V2Variant[], eligibleIds: Set<string>): ProductPage => {
    const { bundleIds, reviews, ...page } = model.productPage!;
    const seen = new Set<string>();
    const media = [...model.media, ...eligible.flatMap((v) => v.media)]
      .filter((m) => m.stage === "approved" && m.supersededAt === null && m.storageKey?.trim() && (m.variantId === null || eligibleIds.has(m.variantId)))
      .sort((a, b) => compareLeadPhoto(roleOf(a), roleOf(b)))
      .flatMap((m) => {
        const url = publicMedia.get(m.id);
        if (!url || seen.has(url)) return [];
        seen.add(url);
        const role = m.role ?? "unclassified";
        return [{
          url, variantId: m.variantId ? identity(m.variantId) : null, role,
          width: m.width ?? null, height: m.height ?? null, altText: m.altText || null, realPhoto: m.realPhoto ?? false,
          // Keeri puts hotspots only on white-background photographs; anything else is ignored.
          hotspots: role === "cutout" ? m.hotspots ?? [] : [],
        }];
      });
    return {
      ...page,
      reviews: { ...reviews, items: reviews.items.map((r) => ({ ...r, variantId: r.variantId && eligibleIds.has(r.variantId) ? identity(r.variantId) : null })) },
      media,
      bundles: bundleIds.flatMap((bundleId) => {
        const bundle = bundles.get(bundleId);
        if (!bundle) return [];
        return [{
          id: bundle.id, name: bundle.name, description: bundle.description,
          items: bundle.items.map((item) => ({
            productId: identity(item.modelId), handle: handles.get(item.modelId)!,
            variantId: item.variantId ? identity(item.variantId) : null, quantity: item.quantity,
          })),
        }];
      }),
    };
  };
  const products: Product[] = [];
  for (const model of data.models) {
    const publication = data.publication.find((p) => p.modelId === model.id);
    if (
      !publication ||
      model.deletedAt ||
      ("channelPublished" in model
        ? !model.channelPublished
        : model.status !== "published")
    )
      continue;
    const eligible = model.variants.filter(
      (v) =>
        !v.deletedAt &&
        ("channelPublished" in v
          ? v.channelPublished
          : v.status === "published" &&
            v.published &&
            v.prices.some((p) => p.kind === "mrp" && p.amount > 0)),
    );
    const eligibleIds = new Set(eligible.map((v) => v.id));
    const photos = (media: typeof model.media) => [
      ...new Set(
        media
          .filter(
            (m) =>
              m.stage === "approved" &&
              m.supersededAt === null &&
              m.storageKey?.trim() &&
              (m.variantId === null || eligibleIds.has(m.variantId)),
          )
          .sort((a, b) => compareLeadPhoto(roleOf(a), roleOf(b)))
          .map((m) => publicMedia.get(m.id))
          .filter((url): url is string => Boolean(url)),
      ),
    ];
    // Every photo for cards and listings; each variant also keeps its own for the product page.
    const images = photos([...model.media, ...eligible.flatMap((v) => v.media)]);
    const productPage = "productPage" in model && model.productPage
      ? pageOf(model as V2Model, eligible as V2Variant[], eligibleIds)
      : null;
    if (data.schemaVersion === 1 && (!eligible.length || !images.length))
      continue;
    products.push(
      productSchema.parse({
        id: identity(model.id),
        handle: publication.handle,
        title: model.name,
        description: model.description ?? "",
        category: publication.category ?? (data.schemaVersion === 2
          ? productTypeCategories.get(model.productType.trim().toLowerCase()) ?? null
          : null),
        sourceDetails: "content" in model ? model.content ?? null : null,
        sourceTaxonomy: "taxonomy" in model && model.taxonomy ? { productType: model.productType.length <= 200 ? model.productType : "", ...model.taxonomy } : null,
        images,
        published: true,
        source,
        ...(data.schemaVersion === 2 ? { sourceStatus: model.status } : {}),
        sourceUpdatedAt: data.capturedAt,
        // Present only when Keeri sent the product-page level; the sync clears it when a later export does not.
        ...(productPage ? { productPage } : {}),
        // Only at the offers level; the sync clears a stored offer when a later export has none.
        ...("offer" in model && model.offer !== undefined ? { offer: model.offer } : {}),
        // Only at the minimum-order level; the sync stores none when a later export does not say.
        ...("minOrderQuantity" in model && model.minOrderQuantity !== undefined ? { minOrderQuantity: model.minOrderQuantity } : {}),
        variants: eligible.map((v) => ({
          id: identity(v.id),
          title: v.variantName?.trim() || variantOptions(v).map((o) => o.value).join(" / ").slice(0, 300).trim() || v.sku || "Details on request",
          images: photos(v.media),
          sku: v.sku || null,
          pricePaise: storePriceOf(v),
          compareAtPaise: compareAtOf(v),
          available: data.schemaVersion === 2 && keeriSellable(v),
          stockPolicy: v.stockPolicy,
          leadTimeDays: "fulfilment" in v && v.fulfilment?.kind === "made_to_order" ? v.fulfilment.leadTimeDays : null,
          // Only at the free-delivery level; the sync clears a stored tick when a later export has none.
          ...("freeDelivery" in v && v.freeDelivery !== undefined ? { freeDelivery: v.freeDelivery } : {}),
          ...("productPage" in v && v.productPage ? { productPage: {
            ...v.productPage,
            options: ((v as V2Variant).attributes ?? [])
              .map((a) => ({ axis: a.axis.trim(), value: a.value.trim(), code: a.code?.trim() || null, hex: a.hex ?? null }))
              .filter((a) => a.axis && a.value),
          } } : {}),
        })),
      }),
    );
  }
  return { source, capturedAt: data.capturedAt, products, input: data };
}
