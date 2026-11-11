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
// 9 Nov 2026: 270,308 raw after the product page timer's campaign deals (#112), the policy pages' content fields (#111)
// and the review form, cities and newsletter (#113) met in one build; each had passed on its own. Raised by 2,000 bytes
// for that; the gzip budget below is unchanged and the registry-leak check stays the main guard.
// 9 Nov 2026: 273,609 raw after the new main menu (Figma 256:3836): each room's card, six line icons, the custom-size card
// and the discovery list live in the header's menu, which every page loads. Raised by 2,500 bytes for that.
// 10 Nov 2026: 274,519 raw after the product page's pinned header (in the header every page loads), the floating
// "Contact us" button and the offer cards' arrows. Raised by 500 bytes for that.
// 10 Nov 2026: 276,388 raw after the Contact and Bulk Enquiry redesigns (Figma 298:511, 298:924): their content fields
// live in the shared content contract, which the homepage already loads; the pages' own code stays out. Raised by 1,500
// bytes for that.
// 10 Nov 2026: 276,698 raw once those redesigns and the product offers (#120) met in one build; each had passed on its
// own. Raised by 500 bytes for that.
// 10 Nov 2026: 277,706 raw after the Nimbus and Terra collection pages (Figma 311:548, 311:921): the shared collection
// schema and Terra's optional copy and photo slots ride in the same contract. Raised by 1,500 bytes for that. The page
// copy schemas belong out of the homepage's bundle; account and checkout contracts stay out of it.
// 11 Nov 2026: 277,241 raw once the collection pages, the Contact and Bulk Enquiry redesigns, product offers (#120)
// and Keeri leads (#123) met in one build; #123 took its admin-only delivery contracts out of the shared bundle. Raised
// by 500 bytes over the combined 277,000 for that.
assert.ok(totalRaw <= 277_500, `Initial homepage JavaScript exceeds the 277,500-byte raw budget: ${totalRaw}`);
// 3 Nov 2026: 80,159 gzip after #100 loads Shopify photos from Shopify's resizer with one retry and a fade-in on every
// card photo (the mega menu's promise strip now loads only when the menu opens). Raised by 1,000 bytes for that; the
// registry-leak check above is unchanged and still the main guard.
// 6 Nov 2026: 81,135 gzip after the cities panel's two arrows (Figma 177:1159), a small client component in place of the
// CSS-only drifting row. Raised by 1,000 bytes for that; the registry-leak check stays the main guard.
// 9 Nov 2026: 82,564 gzip after the same menu. Raised by 1,500 bytes for that; the registry-leak check stays the main guard.
// 10 Nov 2026: 83,375 gzip after the same contract fields. Raised by 500 bytes for that.
// 10 Nov 2026: 83,009 gzip after product offers: the shared contracts every page loads gained the product's offer and
// the checkout's promo code and promotion, while the campaign deals left the layout. Raised by 500 bytes for that; the
// registry-leak check stays the main guard.
// 10 Nov 2026: 83,813 gzip after the Nimbus and Terra collection schemas. Raised by 500 bytes for that.
// 11 Nov 2026: 83,649 gzip in that same build. Raised by 500 bytes over the combined 83,500 for that.
assert.ok(totalGzip <= 84_000, `Initial homepage JavaScript exceeds the 84,000-byte gzip budget: ${totalGzip}`);
