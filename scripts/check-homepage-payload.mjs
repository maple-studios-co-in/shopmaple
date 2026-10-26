import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

// Inspect the actual production entry assets, rather than source imports or a
// guessed chunk name. Run from the repository root after `npm run build`.
const context = vm.createContext({});
vm.runInContext(readFileSync("apps/web/.next/server/app/page_client-reference-manifest.js", "utf8"), context, { timeout: 1000 });
const manifest = context.__RSC_MANIFEST["/page"];
const paths = [...new Set(["[project]/apps/web/app/layout", "[project]/apps/web/app/page"].flatMap(key => manifest.entryJSFiles[key]))];
assert.ok(paths.length > 0 && paths.every(path => typeof path === "string" && path.startsWith("static/")), "Homepage build must supply initial script entries");
const unrelated = [
  "slideshow_PnGjbg", "media_with_content_deBkJg", "hero_section_pfEKq3", "Workshop video poster", "Collection origin image",
  // These collection-only products do not appear in homepage or navigation copy.
  "aurum-blossom-dining-set-ivory-gold-floral",
  "elmore-sculpted-console-table-walnut-finish-with-marble-top-mirror",
  "tavira-bistro-outdoor-set",
];
const rows = paths.map(path => {
  const bytes = readFileSync("apps/web/.next/" + path);
  return { path, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, matches: unrelated.filter(value => bytes.includes(value)) };
});
const totalRaw = rows.reduce((sum, row) => sum + row.raw, 0);
const totalGzip = rows.reduce((sum, row) => sum + row.gzip, 0);
console.log(JSON.stringify({ rows, totalRaw, totalGzip }, null, 2));
assert.deepEqual(rows.flatMap(row => row.matches.map(value => ({ path: row.path, value }))), [], "Initial homepage JavaScript must exclude collection membership and unrelated template registries");
// PR42 baseline: 248,961 raw / 75,604 gzip bytes. Leave room for compact-query
// validation and accessibility fixes, while rejecting the measured registry leak.
assert.ok(totalRaw <= 270_000, `Initial homepage JavaScript exceeds the 270,000-byte raw budget: ${totalRaw}`);
assert.ok(totalGzip <= 79_500, `Initial homepage JavaScript exceeds the 79,500-byte gzip budget: ${totalGzip}`);
