/**
 * Copies the store's Shopify-hosted photos, artwork and films to SHOPIFY_MEDIA_ROOT, where the API serves them as
 * /media/shopify/<name>. Run on the server from a release, with the private environment (docs/shopify-media-migration.md):
 *
 *   node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/migrate-shopify-media.ts --dry-run
 *   node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/migrate-shopify-media.ts
 *   node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/migrate-shopify-media.ts --verify
 *
 * Options: --dry-run (HEAD requests only, writes nothing), --verify (checks the copies, fetches nothing),
 * --sample=<n|all> (dry run's HEAD requests, default 60), --concurrency=<1-8> (default 4), --limit=<n> (copy at most n
 * new files), --min-free-mb=<n> (stop below this much free disk, default 2048), --sources=repo,database,snapshot
 * (default: the repository, plus the database when DATABASE_URL is set and the snapshot when SHOPIFY_CATALOGUE_FILE is).
 * Reruns are safe: copied files are skipped, and nothing is ever deleted or replaced.
 */
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { runMigration } from "./shopify-media-migration.js";

const usage = "Usage: deploy/migrate-shopify-media.ts [--dry-run | --verify] [--sample=<n|all>] [--concurrency=<1-8>] [--limit=<n>] [--min-free-mb=<n>] [--sources=repo,database,snapshot]";
const args = process.argv.slice(2);
const value = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const known = ["--dry-run", "--verify", "--sample=", "--concurrency=", "--limit=", "--min-free-mb=", "--sources="];
const number = (name: string, fallback: number, min: number, max: number) => {
  const text = value(name);
  if (text === undefined) return fallback;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`--${name} must be a whole number from ${min} to ${max}.`);
  return parsed;
};

try {
  if (args.some(arg => !known.some(option => option.endsWith("=") ? arg.startsWith(option) : arg === option)) || (args.includes("--dry-run") && args.includes("--verify")))
    throw new Error(usage);
  const sources = new Set((value("sources") ?? ["repo", process.env.DATABASE_URL && "database", process.env.SHOPIFY_CATALOGUE_FILE && "snapshot"].filter(Boolean).join(",")).split(","));
  if ([...sources].some(source => !["repo", "database", "snapshot"].includes(source)) || !sources.has("repo")) throw new Error("--sources lists repo, and optionally database and snapshot.");
  if (sources.has("database") && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is needed to read the database.");
  if (sources.has("snapshot") && !process.env.SHOPIFY_CATALOGUE_FILE) throw new Error("SHOPIFY_CATALOGUE_FILE is needed to read the snapshot.");
  const mediaRoot = process.env.SHOPIFY_MEDIA_ROOT || undefined;
  if (mediaRoot !== undefined && !isAbsolute(mediaRoot)) throw new Error("SHOPIFY_MEDIA_ROOT must be an absolute path.");
  if (!mediaRoot && !args.includes("--dry-run")) throw new Error("Set SHOPIFY_MEDIA_ROOT (an absolute directory) before copying or verifying.");
  const sample = value("sample") === "all" ? Infinity : number("sample", 60, 0, 100_000);

  let db: PrismaClient | undefined;
  /** Every row that can hold a media address, as JSON text: products, variants, the content document and its history. */
  const database = sources.has("database") ? async () => {
    db = new PrismaClient();
    const rows = [
      ...await db.$queryRaw<{ t: string }[]>`SELECT row_to_json(p)::text AS t FROM "Product" p`,
      ...await db.$queryRaw<{ t: string }[]>`SELECT row_to_json(v)::text AS t FROM "Variant" v`,
      ...await db.$queryRaw<{ t: string }[]>`SELECT row_to_json(c)::text AS t FROM "ShopContent" c`,
      ...await db.$queryRaw<{ t: string }[]>`SELECT row_to_json(r)::text AS t FROM "ShopContentRevision" r`,
    ];
    return rows.map(row => row.t);
  } : undefined;
  try {
    const report = await runMigration({
      repoRoot: fileURLToPath(new URL("..", import.meta.url)),
      mediaRoot,
      dryRun: args.includes("--dry-run"),
      verify: args.includes("--verify"),
      sample,
      concurrency: number("concurrency", 4, 1, 8),
      retries: 3,
      retryDelayMs: 1000,
      timeoutMs: 60_000,
      minFreeBytes: number("min-free-mb", 2048, 0, 10_000_000) * 1024 * 1024,
      limit: value("limit") === undefined ? undefined : number("limit", 0, 1, 100_000),
      log: line => console.log(line),
      database,
      snapshotFile: sources.has("snapshot") ? process.env.SHOPIFY_CATALOGUE_FILE : undefined,
    });
    const repoMissing = report.missing.filter(item => item.sources.includes("repo")).length;
    process.exitCode = report.failures.length || report.damaged.length || repoMissing ? 1 : 0;
  } finally { await db?.$disconnect(); }
} catch (error) {
  // Prisma errors can include connection details; print only the message's first line.
  console.error(String((error as Error).message ?? error).split("\n")[0]);
  process.exitCode = 2;
}
