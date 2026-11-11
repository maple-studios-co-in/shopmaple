import { pullCatalogueUnion } from "../apps/api/src/union-live-sync.js";
import { reasonCode, recordSyncOutcome } from "./catalogue-sync-status.js";
// Keeri is the store's only product source (owner, 11 Nov 2026). SHOPIFY_CATALOGUE_FILE, which once named a pinned
// Shopify export to merge, is no longer read: a server that still sets it syncs exactly as one that does not.
// CATALOGUE_SYNC_STATUS_FILE (optional) names a private file where each run's outcome is kept for the store monitor.
const statusFile = process.env.CATALOGUE_SYNC_STATUS_FILE || undefined;
function record(outcome: Parameters<typeof recordSyncOutcome>[1]) {
  try {
    recordSyncOutcome(statusFile, outcome);
  } catch {
    console.error("Catalogue sync status could not be recorded.");
  }
}
try {
  const args = process.argv.slice(2);
  if (
    new Set(args).size !== args.length ||
    args.some((a) => !["--apply", "--allow-empty-keeri"].includes(a))
  )
    throw new Error("INVALID_ARGUMENTS");
  const {
    KEERI_ORIGIN: origin,
    KEERI_CATALOGUE_TOKEN: token,
    KEERI_TENANT_ID: tenantId,
  } = process.env;
  if (!origin || !token || !tenantId) throw new Error("MISSING_CONFIGURATION");
  const result = await pullCatalogueUnion({
    origin,
    token,
    tenantId,
    databaseUrl: process.env.DATABASE_URL,
    approval: process.env.APPROVE_STORE_CATALOGUE,
    apply: args.includes("--apply"),
    allowEmptyKeeri: args.includes("--allow-empty-keeri"),
  });
  console.log(JSON.stringify(result));
  // A dry run proves nothing about the live catalogue, so only an applied sync counts as a success.
  if (args.includes("--apply")) {
    const sizes = result as { totalProducts?: number; totalVariants?: number };
    record({ ok: true, totalProducts: sizes.totalProducts, totalVariants: sizes.totalVariants });
  }
} catch (error) {
  console.error(
    "Store catalogue sync failed; existing catalogue retained. Check configuration and source availability.",
  );
  const reason = reasonCode(error);
  console.error(`Reason code: ${reason}`);
  record({ ok: false, reason });
  process.exitCode = 1;
}
