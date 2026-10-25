import { PrismaClient } from "@prisma/client";
import { fetchKeeriExport } from "./keeri-fetch.js";
import { syncKeeriExport } from "./keeri-sync.js";

export interface LiveCatalogueOptions {
  origin: string;
  token: string;
  tenantId: string;
  databaseUrl?: string;
  apply?: boolean;
  approval?: string;
  allowEmpty?: boolean;
  now?: Date;
  fetch?: typeof fetch;
}

export function catalogueCommandOptions(args: string[], env: Record<string, string | undefined>): LiveCatalogueOptions {
  const apply = args.includes("--apply");
  const allowEmpty = args.includes("--allow-empty");
  if (new Set(args).size !== args.length || args.some(arg => !["--apply", "--allow-empty"].includes(arg)) || (allowEmpty && !apply))
    throw new Error("INVALID_SYNC_ARGUMENTS");
  if (!env.KEERI_ORIGIN || !env.KEERI_CATALOGUE_TOKEN || !env.KEERI_TENANT_ID)
    throw new Error("MISSING_SYNC_CONFIGURATION");
  return {origin: env.KEERI_ORIGIN, token: env.KEERI_CATALOGUE_TOKEN, tenantId: env.KEERI_TENANT_ID,
    databaseUrl: env.DATABASE_URL, approval: env.APPROVE_KEERI_CATALOGUE, apply, allowEmpty};
}

export async function pullKeeriCatalogue(options: LiveCatalogueOptions): Promise<{
  source: string; capturedAt: string; eligibleProducts: number; dryRun: boolean; checkoutEnabled: false;
}> {
  if (options.apply) {
    let target: URL;
    try { target = new URL(options.databaseUrl ?? ""); }
    catch { throw new Error("ISOLATED_DATABASE_APPROVAL_REQUIRED"); }
    if (options.approval !== "publish-selected-keeri-no-checkout" ||
      !["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" || target.search || target.hash ||
      !((target.pathname === "/shopmaple_store" && target.port === "55440") ||
        (target.pathname === "/shopmaple_test" && target.port === "55439")))
      throw new Error("ISOLATED_DATABASE_APPROVAL_REQUIRED");
  }
  const snapshot = await fetchKeeriExport({
    endpoint: `${options.origin}/api/storefront/catalogue`,
    trustedOrigin: options.origin,
    token: options.token,
    tenantId: options.tenantId,
    fetch: options.fetch,
  });
  const age = (options.now ?? new Date()).getTime() - Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(age) || age > 15 * 60_000 || age < -60_000)
    throw new Error("STALE_OR_FUTURE_SNAPSHOT");
  // Keep aligned with the deployed Next image remotePatterns. Adding a media
  // host needs a reviewed public-media mapping and frontend configuration first.
  for (const image of snapshot.products.flatMap(product => product.images)) {
    const url = new URL(image);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !((url.hostname === "cdn.shopify.com" && url.pathname.startsWith("/s/files/")) ||
        (url.hostname === "shop.maplefurnishers.com" && url.pathname.startsWith("/cdn/shop/"))))
      throw new Error("UNSUPPORTED_PUBLIC_MEDIA");
  }
  if (options.apply && snapshot.products.length === 0 && !options.allowEmpty)
    throw new Error("EMPTY_CATALOGUE_REQUIRES_APPROVAL");
  if (options.apply) {
    const db = new PrismaClient({datasources: {db: {url: options.databaseUrl!}}});
    try {
      await syncKeeriExport(db, snapshot.input, options.tenantId);
    } catch {
      // Prisma errors can include database connection details or source values.
      throw new Error("CATALOGUE_APPLY_FAILED");
    } finally { await db.$disconnect(); }
  }
  return {source: snapshot.source, capturedAt: snapshot.capturedAt,
    eligibleProducts: snapshot.products.length, dryRun: !options.apply, checkoutEnabled: false};
}
