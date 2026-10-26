import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { productSchema } from "@shopmaple/contracts";
import { planCatalogueUnion } from "./catalogue-union.js";
export async function syncCatalogueUnion(
  db: PrismaClient,
  shopify: unknown,
  keeri: unknown,
  tenantId: string,
) {
  const validated = planCatalogueUnion(shopify, keeri, tenantId);
  const source = `union:${tenantId}`;
  const capturedAt = new Date(validated.capturedAt);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ shopify, keeri }))
    .digest("hex");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"shopmaple-catalogue-union"}))::text`;
      const previous = await tx.catalogueSyncState.findUnique({
        where: { source },
      });
      const [rows, pBindings, vBindings] = await Promise.all([
        tx.product.findMany({ include: { variants: true } }),
        tx.productSourceIdentity.findMany(),
        tx.variantSourceIdentity.findMany(),
      ]);
      const plan = planCatalogueUnion(shopify, keeri, tenantId, {
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
      });
      if (previous) {
        if (previous.capturedAt > capturedAt)
          throw new Error("STALE_UNION_SNAPSHOT");
        if (previous.capturedAt.getTime() === capturedAt.getTime()) {
          if (previous.payloadHash !== payloadHash)
            throw new Error("CONFLICTING_UNION_SNAPSHOT");
          return { replayed: true, ...plan.report };
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
            productId: product.id,
            published: true,
            available: false,
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
      await tx.product.updateMany({
        where: omitted,
        data: { published: false },
      });
      await tx.catalogueSyncState.upsert({
        where: { source },
        create: { source, capturedAt, payloadHash },
        update: { capturedAt, payloadHash, importedAt: new Date() },
      });
      return { replayed: false, ...plan.report };
    },
    { timeout: 60000, isolationLevel: "ReadCommitted" },
  );
}
