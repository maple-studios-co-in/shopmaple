import { z } from "zod";
import { productSchema, sourceDetailsSchema, type Product } from "@shopmaple/contracts";

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
]);
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
export const keeriExportV2Schema = keeriExportSchema.extend({
  schemaVersion: z.literal(2),
  models: z
    .array(
      keeriExportSchema.shape.models.element.extend({
        content: sourceDetailsSchema.optional(),
        taxonomy: z.object({ category: z.string().max(200).nullable(), subCategory: z.string().max(200).nullable() }).strict().optional(),
        channelPublished: z.boolean(),
        shopifyProductId: shopifyId,
        variants: z
          .array(
            variantSchema.extend({
              channelPublished: z.boolean(),
              sku: z.string().trim().max(300).nullable(),
              stockPolicy: z.enum([
                "stocked",
                "made_to_order",
                "dropship",
                "unverified",
              ]),
              shopifyProductId: shopifyId,
              shopifyVariantId: shopifyId,
            }),
          )
          .max(500),
      }),
    )
    .max(5000),
});
export function adaptKeeriExportV2(input: unknown, expectedTenantId: string) {
  return adaptValidated(keeriExportV2Schema.parse(input), expectedTenantId);
}
export type KeeriExport = z.infer<typeof keeriExportSchema>;

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
    const images = [
      ...new Set(
        [...model.media, ...eligible.flatMap((v) => v.media)]
          .filter(
            (m) =>
              m.stage === "approved" &&
              m.supersededAt === null &&
              m.storageKey?.trim() &&
              (m.variantId === null || eligibleIds.has(m.variantId)),
          )
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .map((m) => publicMedia.get(m.id))
          .filter((url): url is string => Boolean(url)),
      ),
    ];
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
        variants: eligible.map((v) => ({
          id: identity(v.id),
          title: v.variantName?.trim() || v.sku || "Details on request",
          sku: v.sku || null,
          pricePaise:
            v.prices.find((p) => p.kind === "mrp" && p.amount > 0)?.amount ??
            null,
          compareAtPaise: null,
          available: false,
          stockPolicy: v.stockPolicy,
        })),
      }),
    );
  }
  return { source, capturedAt: data.capturedAt, products, input: data };
}
