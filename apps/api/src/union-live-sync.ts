import { PrismaClient } from "@prisma/client";
import { fetchKeeriExport } from "./keeri-fetch.js";
import { planCatalogueUnion } from "./catalogue-union.js";
import { syncCatalogueUnion } from "./catalogue-union-sync.js";
export interface UnionSyncOptions {
  origin: string;
  token: string;
  tenantId: string;
  shopify: unknown;
  databaseUrl?: string;
  approval?: string;
  apply?: boolean;
  allowEmptyKeeri?: boolean;
  now?: Date;
  fetch?: typeof fetch;
}
export async function pullCatalogueUnion(options: UnionSyncOptions) {
  if (options.apply) {
    let db: URL;
    try {
      db = new URL(options.databaseUrl ?? "");
    } catch {
      throw new Error("ISOLATED_DATABASE_APPROVAL_REQUIRED");
    }
    if (
      options.approval !== "publish-all-current-enquiry-only" ||
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" ||
      db.search ||
      db.hash ||
      !(
        (db.port === "55440" && db.pathname === "/shopmaple_store") ||
        (db.port === "55439" && db.pathname === "/shopmaple_test")
      )
    )
      throw new Error("ISOLATED_DATABASE_APPROVAL_REQUIRED");
  }
  const snapshot = await fetchKeeriExport({
    endpoint: `${options.origin}/api/storefront/catalogue/v2`,
    trustedOrigin: options.origin,
    token: options.token,
    tenantId: options.tenantId,
    schemaVersion: 2,
    includeTaxonomy: true,
    includeContent: true,
    includeAttributes: true,
    fetch: options.fetch,
  });
  const age =
    (options.now ?? new Date()).getTime() - Date.parse(snapshot.capturedAt);
  if (age > 900000 || age < -60000) throw new Error("STALE_OR_FUTURE_SNAPSHOT");
  if (options.apply && !snapshot.products.length && !options.allowEmptyKeeri)
    throw new Error("EMPTY_KEERI_REQUIRES_APPROVAL");
  const plan = planCatalogueUnion(
    options.shopify,
    snapshot.input,
    options.tenantId,
  );
  let report = plan.report;
  if (options.apply) {
    const db = new PrismaClient({
      datasources: { db: { url: options.databaseUrl! } },
    });
    try {
      report = await syncCatalogueUnion(
        db,
        options.shopify,
        snapshot.input,
        options.tenantId,
      );
    } catch {
      throw new Error("CATALOGUE_APPLY_FAILED");
    } finally {
      await db.$disconnect();
    }
  }
  return {
    ...report,
    capturedAt: snapshot.capturedAt,
    shopifySnapshotCapturedAt: plan.shopifyCapturedAt,
    publicPricesCapturedAt: plan.publicPricesCapturedAt,
    shopifyRefreshMode: "pinned-snapshot",
    dryRun: !options.apply,
    checkoutEnabled: false,
  };
}
