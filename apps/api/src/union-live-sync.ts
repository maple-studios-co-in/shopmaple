import { PrismaClient } from "@prisma/client";
import { fetchKeeriExport, KeeriFetchError } from "./keeri-fetch.js";
import { planCatalogueUnion } from "./catalogue-union.js";
import { syncCatalogueUnion } from "./catalogue-union-sync.js";
export interface UnionSyncOptions {
  origin: string;
  token: string;
  tenantId: string;
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
  // The richest level first. Each needs a Keeri release that offers it; an older Keeri refuses it
  // with 400 and the sync steps down a level (minimum orders, free delivery, offers, product page, variant options, plain).
  const levels = [
    { includeAttributes: true, includeProductPage: true, includeOffers: true, includeFreeDelivery: true, includeMinOrder: true },
    { includeAttributes: true, includeProductPage: true, includeOffers: true, includeFreeDelivery: true },
    { includeAttributes: true, includeProductPage: true, includeOffers: true },
    { includeAttributes: true, includeProductPage: true, includeOffers: false },
    { includeAttributes: true, includeProductPage: false, includeOffers: false },
    { includeAttributes: false, includeProductPage: false, includeOffers: false },
  ];
  const unsupported = new Set(["MIN_ORDER_UNSUPPORTED", "FREE_DELIVERY_UNSUPPORTED", "OFFERS_UNSUPPORTED", "PRODUCT_PAGE_UNSUPPORTED", "ATTRIBUTES_UNSUPPORTED"]);
  const request = async (level: number): Promise<Awaited<ReturnType<typeof fetchKeeriExport>>> => {
    try {
      return await fetchKeeriExport({
        endpoint: `${options.origin}/api/storefront/catalogue/v2`,
        trustedOrigin: options.origin,
        token: options.token,
        tenantId: options.tenantId,
        schemaVersion: 2,
        includeTaxonomy: true,
        includeContent: true,
        ...levels[level]!,
        fetch: options.fetch,
      });
    } catch (error) {
      if (error instanceof KeeriFetchError && unsupported.has(error.code) && level + 1 < levels.length) return request(level + 1);
      throw error;
    }
  };
  const snapshot = await request(0);
  const age =
    (options.now ?? new Date()).getTime() - Date.parse(snapshot.capturedAt);
  if (age > 900000 || age < -60000) throw new Error("STALE_OR_FUTURE_SNAPSHOT");
  if (options.apply && !snapshot.products.length && !options.allowEmptyKeeri)
    throw new Error("EMPTY_KEERI_REQUIRES_APPROVAL");
  const plan = planCatalogueUnion(snapshot.input, options.tenantId);
  let report: typeof plan.report & { replayed?: boolean; retiredProducts?: number } = plan.report;
  if (options.apply) {
    const db = new PrismaClient({
      datasources: { db: { url: options.databaseUrl! } },
    });
    try {
      report = await syncCatalogueUnion(db, snapshot.input, options.tenantId);
    } catch {
      throw new Error("CATALOGUE_APPLY_FAILED");
    } finally {
      await db.$disconnect();
    }
  }
  return {
    ...report,
    capturedAt: snapshot.capturedAt,
    dryRun: !options.apply,
    checkoutEnabled: false,
  };
}
