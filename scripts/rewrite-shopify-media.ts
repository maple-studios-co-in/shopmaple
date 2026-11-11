/**
 * Rewrites the repository's own data and code from Shopify-hosted media to the store's copies (/media/shopify/<name>),
 * and records each source in packages/contracts/data/shopify-media-sources.json, which the server's download
 * (deploy/migrate-shopify-media.ts) and the API's fallback read. Run from the repository root, by a developer:
 *
 *   npx tsx scripts/rewrite-shopify-media.ts [--check]
 *
 * --check changes nothing and exits 1 when anything is left to rewrite (the test suite runs the same check).
 * It never downloads anything; the files themselves come from the server run (docs/shopify-media-migration.md).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { canonicalShopifyMediaUrl, mapleShopifyFiles, shopifyMediaPath, shopifyMediaUrlsInText } from "../packages/contracts/src/shopify-media";

export const sourcesFile = "packages/contracts/data/shopify-media-sources.json";
/** Data the storefront and the preview catalogue read. */
const dataDirectories = ["apps/web/data", "apps/api/data", "packages/contracts/data"];
/** Code that names media (constants, defaults); validation code names Shopify's hosts, never a file, so it is untouched. */
const codeDirectories = ["apps/web/lib", "apps/web/components", "apps/web/app"];
/**
 * Files the code asks Shopify to convert (an SVG cover served as a raster; lib/shopify-artwork.ts), which no data names
 * directly: copied too, so the converted artwork stays local.
 */
export const extraSources = ["Cover_Image_Maple_6", "Cover_Image_Maple_7", "Cover_Image_Maple_8", "Cover_Image_Maple_10"]
  .map(name => `${mapleShopifyFiles}collections/${name}.webp`);
/** A bare Shopify file name in data ("Chairs_1.png"), which the code used to prefix with the shop's files address. */
const bareName = /("(?:image|desktop|mobile)"\s*:\s*")((?:preview_images\/)?[A-Za-z0-9_.()-]+\.(?:png|jpe?g|webp|svg|gif|avif|mp4))(")/g;
/** shopFile("Chairs_1.png") or shopify("Chairs_1.png?v=1") in code. */
const fileCall = /\b(?:shopFile|shopify)\(\s*"([^"\\]+)"\s*\)/g;

function filesIn(root: string, directory: string, extensions: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesIn(root, path, extensions));
    else if (extensions.some(extension => entry.name.endsWith(extension)) && path !== sourcesFile) found.push(path);
  }
  return found;
}

export type RewriteResult = { changed: Map<string, string>; sources: Map<string, string>; unsupported: string[] };

/** The rewritten text of every file that names Shopify media, every source by local name, and addresses left as they are. */
export function planRewrite(root: string): RewriteResult {
  const sources = new Map<string, string>(), unsupported: string[] = [], changed = new Map<string, string>();
  const local = (url: string) => {
    const canonical = canonicalShopifyMediaUrl(url), path = shopifyMediaPath(url);
    if (!canonical || !path) { unsupported.push(url); return null; }
    sources.set(path.slice("/media/shopify/".length), canonical);
    return path;
  };
  const files = [
    ...dataDirectories.flatMap(directory => filesIn(root, directory, [".json"])),
    ...codeDirectories.flatMap(directory => filesIn(root, directory, [".ts", ".tsx"])),
  ];
  for (const file of files) {
    const before = readFileSync(join(root, file), "utf8");
    let after = before.replace(shopifyMediaUrlsInText, url => local(url) ?? url);
    if (file.endsWith(".json")) after = after.replace(bareName, (whole, open: string, name: string, close: string) => {
      const path = local(`${mapleShopifyFiles}files/${name}`);
      return path ? `${open}${path}${close}` : whole;
    });
    else after = after.replace(fileCall, (whole, name: string) => {
      const path = local(`${mapleShopifyFiles}files/${name}`);
      return path ? JSON.stringify(path) : whole;
    });
    if (after !== before) changed.set(file, after);
  }
  for (const url of extraSources) local(url);
  // Earlier runs' sources stay listed: the code may name a copy whose Shopify address no longer appears anywhere.
  const recorded = JSON.parse(readFileSync(join(root, sourcesFile), "utf8")) as { files: Record<string, string> };
  for (const [name, source] of Object.entries(recorded.files)) if (!sources.has(name)) sources.set(name, source);
  return { changed, sources, unsupported };
}

export function sourcesText(root: string, sources: Map<string, string>): string {
  const recorded = JSON.parse(readFileSync(join(root, sourcesFile), "utf8")) as { about: string };
  const files = Object.fromEntries([...sources].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])));
  return `${JSON.stringify({ about: recorded.about, files }, null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd(), check = process.argv.includes("--check");
  const { changed, sources, unsupported } = planRewrite(root);
  const listing = sourcesText(root, sources), listingChanged = listing !== readFileSync(join(root, sourcesFile), "utf8");
  for (const [file] of changed) console.log(`${check ? "would rewrite" : "rewrote"} ${relative(root, join(root, file))}`);
  if (listingChanged) console.log(`${check ? "would update" : "updated"} ${sourcesFile} (${sources.size} files)`);
  for (const url of new Set(unsupported)) console.log(`left as is (not a Shopify media file the store keeps): ${url}`);
  if (check) process.exitCode = changed.size || listingChanged ? 1 : 0;
  else {
    for (const [file, text] of changed) writeFileSync(join(root, file), text);
    if (listingChanged) writeFileSync(join(root, sourcesFile), listing);
  }
}
