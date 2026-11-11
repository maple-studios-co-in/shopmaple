import { catalogueImportSchema } from "@shopmaple/contracts";
import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * The committed public snapshot (apps/api/data/preview-catalog.json): Keeri products as the store lists them, with
 * their store identities (`keeri:<tenant>:<id>`), so a later catalogue sync updates the same rows. Keeri is the store's
 * only product source (owner, 11 Nov 2026).
 */
export function isKeeriPreviewSnapshot(parsed: { source: string; products: { id: string; source: string; variants: { id: string }[] }[] }) {
  const source = parsed.products[0]?.source ?? "";
  return parsed.source === "keeri-store-snapshot" && /^keeri:[a-z0-9]{1,64}$/.test(source) &&
    parsed.products.every(p => p.source === source && p.id.startsWith(`${source}:`) &&
      p.variants.every(v => v.id.startsWith(`${source}:`)));
}

export function preparePublicPreview(input: unknown) {
  const parsed = catalogueImportSchema.parse(input);
  if (!isKeeriPreviewSnapshot(parsed))
    throw new Error("Only the reviewed Keeri preview snapshot's identities are allowed");
  return { ...parsed, products: parsed.products.map(p => ({ ...p,
    variants: p.variants.map(v => ({ ...v, available: false, stockPolicy: "unverified" as const })),
  })) };
}

export function assertPreviewTarget(url: string, expectedDatabase: string, approval: string) {
  let target: URL;
  try { target = new URL(url); } catch { throw new Error("Valid isolated ShopMaple database URL required"); }
  if (approval !== "publish-public-preview-no-checkout" ||
    !["shopmaple_store", "shopmaple_preview_import_test"].includes(expectedDatabase) ||
    target.hostname !== "127.0.0.1" ||
    target.port !== (expectedDatabase === "shopmaple_store" ? "55440" : "55439") ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.pathname !== "/" + expectedDatabase || target.search || target.hash)
    throw new Error("Explicit approval and matching isolated ShopMaple database required");
}

export async function bootstrapPublicPreview(db: PrismaClient, input: unknown) {
  const payload = preparePublicPreview(input);
  await db.$transaction(async tx => {
    if (await tx.product.count() !== 0 || await tx.variant.count() !== 0 || await tx.catalogueSyncState.count() !== 0)
      throw new Error("Public preview bootstrap requires an empty catalogue");
    for (const product of payload.products) {
      const { variants, sourceUpdatedAt, ...fields } = product;
      await tx.product.create({ data: { ...fields, pdpContent: fields.pdpContent ?? Prisma.DbNull, sourceTaxonomy: fields.sourceTaxonomy ?? Prisma.DbNull, sourceDetails: fields.sourceDetails ?? Prisma.DbNull, productPage: fields.productPage ?? Prisma.DbNull, offer: fields.offer ?? Prisma.DbNull, sourceUpdatedAt: new Date(sourceUpdatedAt), variants: { create: variants.map((v) => ({ ...v, productPage: v.productPage ?? Prisma.DbNull })) } } });
    }
  }, { isolationLevel: "Serializable", timeout: 30_000 });
  return payload.products.length;
}
