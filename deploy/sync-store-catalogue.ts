import { pullCatalogueUnion } from "../apps/api/src/union-live-sync.js";
// Keeri is the store's only product source (owner, 11 Nov 2026). SHOPIFY_CATALOGUE_FILE, which once named a pinned
// Shopify export to merge, is no longer read: a server that still sets it syncs exactly as one that does not.
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
} catch {
  console.error(
    "Store catalogue sync failed; existing catalogue retained. Check configuration and source availability.",
  );
  process.exitCode = 1;
}
