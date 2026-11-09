// Warms the store's image resizer after a deploy (owner, 9 Nov 2026: the photos were slow to appear on opening the site).
// Every photo on the store is resized by Next.js at /_next/image, which keeps what it has made in the release's own
// .next/cache. A new release starts with that cache empty, so each photo's first visitor after a deploy waited the two to
// three seconds the small server takes to make it. This reads the main pages, then asks for every resized photo they name
// (each width in their srcset, up to a limit), a few at a time, so visitors find them made. It only reads: GET requests
// to the address it is given, nothing else.
//
//   node deploy/warm-image-cache.mjs https://store.maplefurnishers.com [--max-width=1920] [--concurrency=2]
import { pathToFileURL } from "node:url";

/** The pages most visitors open first: the homepage and the four rooms its hero tiles lead to, then the full range. */
export const warmPages = ["/", "/pages/sofas", "/pages/chairs", "/pages/tables", "/collections/beds", "/collections/all"];

/** Every resized-photo address a page names in a src, srcset or imagesrcset, made absolute, once each, up to `maxWidth`. */
export function imageUrls(html, base, maxWidth = 1920) {
  const found = new Set();
  // React writes srcSet and imageSrcSet; HTML attribute names ignore case.
  for (const [, value] of html.matchAll(/\s(?:src|srcset|imagesrcset)="([^"]+)"/gi)) {
    // The resizer's own addresses carry the photo's address percent-encoded, so a comma only ever separates candidates.
    for (const candidate of value.replaceAll("&amp;", "&").split(",")) {
      const address = candidate.trim().split(/\s+/)[0];
      if (!address?.startsWith("/_next/image?")) continue;
      const url = new URL(address, base);
      const width = Number(url.searchParams.get("w"));
      if (url.searchParams.get("url") && Number.isInteger(width) && width > 0 && width <= maxWidth) found.add(url.href);
    }
  }
  return [...found];
}

const agent = "MapleImageCacheWarmer/1.0";

async function warm(base, { maxWidth, concurrency }) {
  const urls = new Set();
  let pagesRead = 0;
  for (const path of warmPages) {
    try {
      const response = await fetch(new URL(path, base), { headers: { "User-Agent": agent } });
      if (!response.ok) { console.log(`page ${response.status} ${path}`); continue; }
      const found = imageUrls(await response.text(), base, maxWidth);
      found.forEach((url) => urls.add(url));
      pagesRead += 1;
      console.log(`page ${path}: ${found.length} resized photos`);
    } catch (error) {
      console.log(`page failed ${path}: ${error.message}`);
    }
  }
  const queue = [...urls];
  const tally = { made: 0, ready: 0, failed: 0 };
  const started = Date.now();
  const next = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const response = await fetch(url, { headers: { "User-Agent": agent, Accept: "image/webp,image/*,*/*;q=0.8" } });
        await response.arrayBuffer();
        if (!response.ok) { tally.failed += 1; console.log(`photo ${response.status} ${url}`); continue; }
        // HIT: already made; MISS: made for this request; STALE: served while being remade.
        if (response.headers.get("x-nextjs-cache") === "MISS") tally.made += 1; else tally.ready += 1;
      } catch (error) {
        tally.failed += 1;
        console.log(`photo failed ${url}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, next));
  console.log(`${urls.size} photos from ${pagesRead} pages in ${Math.round((Date.now() - started) / 1000)}s: ${tally.made} made now, ${tally.ready} already made, ${tally.failed} failed`);
  return pagesRead;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const base = args.find((arg) => !arg.startsWith("--"));
  const option = (name, fallback) => Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
  if (!base || !/^https?:\/\//.test(base)) {
    console.error("Usage: node deploy/warm-image-cache.mjs https://store.maplefurnishers.com [--max-width=1920] [--concurrency=2]");
    process.exit(2);
  }
  // Two at a time by default: the resizer shares the small server with the store itself.
  const pagesRead = await warm(base, { maxWidth: option("max-width", 1920), concurrency: option("concurrency", 2) });
  process.exit(pagesRead ? 0 : 1);
}
