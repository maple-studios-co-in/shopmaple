import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { adaptKeeriExport } from "./keeri.js";

/** Only writes the Shop Maple read model; never connects to Keeri. */
export async function syncKeeriExport(
  db: PrismaClient,
  input: unknown,
  tenantId: string,
) {
  const snapshot = adaptKeeriExport(input, tenantId);
  const { source, products } = snapshot;
  const capturedAt = new Date(snapshot.capturedAt);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(snapshot.input))
    .digest("hex");
  return db.$transaction(
    async (tx) => {
      // READ COMMITTED + transaction-scoped lock ensures the next importer reads the
      // preceding commit's cursor even when both started before that commit.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${source}))::text`;
      const previous = await tx.catalogueSyncState.findUnique({
        where: { source },
      });
      if (previous) {
        if (previous.capturedAt > capturedAt)
          throw new Error("Snapshot is older than the applied catalogue");
        if (previous.capturedAt.getTime() === capturedAt.getTime()) {
          if (previous.payloadHash !== payloadHash)
            throw new Error(
              "Conflicting payload at the same snapshot timestamp",
            );
          return { replayed: true, imported: products.length, source };
        }
      }
      for (const product of products) {
        const existing = await tx.product.findUnique({
          where: { id: product.id },
        });
        if (existing && existing.source !== source)
          throw new Error("Product identity belongs to another source");
        const held = await tx.variant.findMany({
          where: { id: { in: product.variants.map((v) => v.id) } },
          include: { product: true },
        });
        if (
          held.some(
            (v) => v.productId !== product.id || v.product.source !== source,
          )
        )
          throw new Error(
            "Variant identity belongs to another product or source",
          );
        const { variants, ...fields } = product;
        const data = { ...fields, pdpContent: fields.pdpContent ?? Prisma.DbNull, sourceUpdatedAt: capturedAt };
        await tx.product.upsert({
          where: { id: product.id },
          create: data,
          update: data,
        });
        for (const variant of variants) {
          const data = { ...variant, productId: product.id, published: true };
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
          data: { available: false, published: false },
        });
      }
      const omitted = { source, id: { notIn: products.map((p) => p.id) } };
      await tx.variant.updateMany({
        where: { product: omitted },
        data: { available: false, published: false },
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
      return { replayed: false, imported: products.length, source };
    },
    { timeout: 30000, isolationLevel: "ReadCommitted" },
  );
}
