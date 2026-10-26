import { catalogueImportSchema } from "@shopmaple/contracts";
import { Prisma, type PrismaClient } from "@prisma/client";

export function preparePublicPreview(input: unknown) {
  const parsed = catalogueImportSchema.parse(input);
  if (parsed.source !== "shopify-preview" || parsed.products.some(p =>
    p.source !== "shopify-preview" || !/^preview-[0-9]+$/.test(p.id) ||
    p.variants.some(v => !/^preview-[0-9]+$/.test(v.id))))
    throw new Error("Only reviewed Shopify preview identities are allowed");
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
      await tx.product.create({ data: { ...fields, pdpContent: fields.pdpContent ?? Prisma.DbNull, sourceTaxonomy: fields.sourceTaxonomy ?? Prisma.DbNull, sourceDetails: fields.sourceDetails ?? Prisma.DbNull, sourceUpdatedAt: new Date(sourceUpdatedAt), variants: { create: variants } } });
    }
  }, { isolationLevel: "Serializable", timeout: 30_000 });
  return payload.products.length;
}
