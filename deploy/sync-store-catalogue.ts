import { readFile, stat } from "node:fs/promises";
import { pullCatalogueUnion } from "../apps/api/src/union-live-sync.js";
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
    SHOPIFY_CATALOGUE_FILE: file,
  } = process.env;
  if (!origin || !token || !tenantId || !file)
    throw new Error("MISSING_CONFIGURATION");
  if ((await stat(file)).size > 50 * 1024 * 1024)
    throw new Error("SNAPSHOT_TOO_LARGE");
  const result = await pullCatalogueUnion({
    origin,
    token,
    tenantId,
    shopify: JSON.parse(await readFile(file, "utf8")),
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
