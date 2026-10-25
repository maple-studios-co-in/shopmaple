import { readFile, stat } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { adaptKeeriExport } from "../apps/api/src/keeri.js";
import { syncKeeriExport } from "../apps/api/src/keeri-sync.js";

const [file, tenantId, flag, ...extra] = process.argv.slice(2);
if (
  !file ||
  !tenantId ||
  (flag !== undefined && flag !== "--apply") ||
  extra.length
)
  throw new Error(
    "Usage: tsx scripts/import-keeri.ts <export.json> <expected-tenant-id> [--apply]",
  );
if ((await stat(file)).size > 50 * 1024 * 1024)
  throw new Error("Export exceeds 50 MiB");
const input: unknown = JSON.parse(await readFile(file, "utf8"));
const preview = adaptKeeriExport(input, tenantId);
const summary = {
  source: preview.source,
  capturedAt: preview.capturedAt,
  imported: preview.products.length,
  omitted: preview.input.models.length - preview.products.length,
  checkoutEnabled: false,
};
if (flag !== "--apply") {
  console.log(JSON.stringify({ ...summary, dryRun: true }));
} else {
  if (process.env.NODE_ENV === "production")
    throw new Error("Keeri export apply is disabled in production");
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    !["/shopmaple", "/shopmaple_test"].includes(database.pathname)
  )
    throw new Error(
      "Keeri export apply requires a dedicated local Shop Maple database",
    );
  const db = new PrismaClient();
  try {
    const result = await syncKeeriExport(db, input, tenantId);
    console.log(JSON.stringify({ ...summary, ...result, dryRun: false }));
  } finally {
    await db.$disconnect();
  }
}
