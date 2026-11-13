import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { productSchema } from "@shopmaple/contracts";
import { planCatalogueUnion } from "./catalogue-union.js";
import { reviewSummary } from "./review-summary.js";
/**
 * Applies Keeri's catalogue in one transaction (see planCatalogueUnion). The watermark (`union:<tenant>`) refuses an
 * older snapshot and replays the same one; a store product that Keeri no longer publishes, including every former
 * Shopify-only listing, is unpublished with its variants rather than deleted, so carts keep valid references and see the
 * line as no longer available.
 */
export async function syncCatalogueUnion(
  db: PrismaClient,
  keeri: unknown,
  tenantId: string,
) {
  const validated = planCatalogueUnion(keeri, tenantId);
  const source = `union:${tenantId}`;
  const capturedAt = new Date(validated.capturedAt);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ keeri }))
    .digest("hex");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"shopmaple-catalogue-union"}))::text`;
      const previous = await tx.catalogueSyncState.findUnique({
        where: { source },
      });
      const [rows, pBindings, vBindings, aliases] = await Promise.all([
        tx.product.findMany({ include: { variants: true } }),
        tx.productSourceIdentity.findMany(),
        tx.variantSourceIdentity.findMany(),
        tx.productHandleAlias.findMany({ select: { handle: true, productId: true } }),
      ]);
      const plan = planCatalogueUnion(keeri, tenantId, {
        products: rows.map((p) =>
          productSchema.parse({
            ...p,
            sourceUpdatedAt: p.sourceUpdatedAt.toISOString(),
          }),
        ),
        productBindings: pBindings.map((b) => ({
          ...b,
          targetId: b.productId,
        })),
        variantBindings: vBindings.map((b) => ({
          ...b,
          targetId: b.variantId,
        })),
        handleAliases: aliases,
      });
      if (previous) {
        if (previous.capturedAt > capturedAt)
          throw new Error("STALE_UNION_SNAPSHOT");
        if (previous.capturedAt.getTime() === capturedAt.getTime()) {
          if (previous.payloadHash !== payloadHash)
            throw new Error("CONFLICTING_UNION_SNAPSHOT");
          return { replayed: true, retiredProducts: 0, ...plan.report };
        }
      }
      for (const product of plan.products) {
        const prior = rows.find((p) => p.id === product.id);
        if (prior && !["shopify-preview", plan.source].includes(prior.source))
          throw new Error("FOREIGN_SOURCE_IDENTITY");
        const { variants, ...fields } = product;
        const data = {
          ...fields,
          pdpContent: fields.pdpContent ?? Prisma.DbNull, sourceTaxonomy: fields.sourceTaxonomy ?? Prisma.DbNull, sourceDetails: fields.sourceDetails ?? Prisma.DbNull,
          productPage: fields.productPage ?? Prisma.DbNull,
          offer: fields.offer ?? Prisma.DbNull,
          // Absent below Keeri's minimum-order level: no minimum is kept from an earlier export.
          minOrderQuantity: fields.minOrderQuantity ?? null,
          ...reviewSummary(fields.productPage),
          sourceUpdatedAt: new Date(fields.sourceUpdatedAt),
        };
        await tx.product.upsert({
          where: { id: product.id },
          create: data,
          update: data,
        });
        for (const variant of variants) {
          const held = rows
            .flatMap((p) => p.variants)
            .find((v) => v.id === variant.id);
          if (held && held.productId !== product.id)
            throw new Error("VARIANT_REPARENT_FORBIDDEN");
          const data = {
            ...variant,
            productPage: variant.productPage ?? Prisma.DbNull,
            productId: product.id,
            published: true,
            leadTimeDays: variant.leadTimeDays ?? null,
            freeDelivery: variant.freeDelivery ?? false,
          };
          await tx.variant.upsert({
            where: { id: variant.id },
            create: data,
            update: data,
          });
        }
        await tx.variant.updateMany({
          where: {
            productId: product.id,
            id: { notIn: variants.map((v) => v.id) },
          },
          data: { published: false, available: false },
        });
      }
      // A renamed address keeps redirecting; a newer alias for the same old address wins.
      for (const alias of plan.handleAliases)
        await tx.productHandleAlias.upsert({
          where: { handle: alias.handle },
          create: alias,
          update: { productId: alias.productId },
        });
      for (const b of plan.productBindings) {
        const held = pBindings.find(
          (p) => p.source === b.source && p.externalId === b.externalId,
        );
        if (held && held.productId !== b.targetId)
          throw new Error("PRODUCT_BINDING_CONFLICT");
        await tx.productSourceIdentity.upsert({
          where: {
            source_externalId: { source: b.source, externalId: b.externalId },
          },
          create: {
            source: b.source,
            externalId: b.externalId,
            productId: b.targetId,
          },
          update: {},
        });
      }
      for (const b of plan.variantBindings) {
        const held = vBindings.find(
          (v) => v.source === b.source && v.externalId === b.externalId,
        );
        if (held && held.variantId !== b.targetId)
          throw new Error("VARIANT_BINDING_CONFLICT");
        await tx.variantSourceIdentity.upsert({
          where: {
            source_externalId: { source: b.source, externalId: b.externalId },
          },
          create: {
            source: b.source,
            externalId: b.externalId,
            variantId: b.targetId,
          },
          update: {},
        });
      }
      const omitted = {
        source: { in: ["shopify-preview", plan.source] },
        id: { notIn: plan.products.map((p) => p.id) },
      };
      await tx.variant.updateMany({
        where: { product: omitted },
        data: { published: false, available: false },
      });
      const retired = await tx.product.updateMany({
        where: { ...omitted, published: true },
        data: { published: false },
      });
      await tx.catalogueSyncState.upsert({
        where: { source },
        create: { source, capturedAt, payloadHash },
        update: { capturedAt, payloadHash, importedAt: new Date() },
      });
      return { replayed: false, retiredProducts: retired.count, ...plan.report };
    },
    { timeout: 60000, isolationLevel: "ReadCommitted" },
  );
}
