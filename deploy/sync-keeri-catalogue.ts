import { catalogueCommandOptions, pullKeeriCatalogue } from "../apps/api/src/keeri-live-sync.js";

try {
  const result = await pullKeeriCatalogue(catalogueCommandOptions(process.argv.slice(2), process.env));
  console.log(JSON.stringify(result));
} catch {
  // Never print upstream errors, tokens, connection strings or private source rows.
  console.error("Keeri catalogue sync failed; verify scoped configuration, publication readiness and database target.");
  process.exitCode = 1;
}
