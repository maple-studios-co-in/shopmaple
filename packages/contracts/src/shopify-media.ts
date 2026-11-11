/**
 * The store's own copies of the photos, artwork and films first published on Shopify (owner, 11 Nov 2026: the store
 * moves to shop.maplefurnishers.com, which stops serving Shopify's /cdn/shop/ files, and Shopify's CDN goes when the
 * plan is cancelled). Each Shopify file has one fixed local name, so the repository's rewritten data and the server's
 * download agree without sharing a list:
 *
 *   https://shop.maplefurnishers.com/cdn/shop/files/Chairs_1.png?v=1&width=600
 *   → https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png   (canonical: Shopify's CDN, no query)
 *   → /media/shopify/<first 32 hex of sha256(canonical)>.png
 *
 * The query is dropped: `?v=` only busts Shopify's cache and `?width=`/`?height=` ask Shopify's resizer for a smaller
 * copy of the same original, which the store's own image optimizer now makes. Server-only (node:crypto).
 */
import { createHash } from "node:crypto";
import { shopifyMediaKind, shopifyMediaKinds, type ShopifyMediaExtension } from "./shopify-media-path";
import sources from "../data/shopify-media-sources.json";
export * from "./shopify-media-path";

/**
 * Every Shopify file the repository's data and code name, by local name (written by scripts/rewrite-shopify-media.ts).
 * The server's download starts from it, and the API uses it to reach a file it has not copied yet.
 */
export const repoShopifyMediaSources: Readonly<Record<string, string>> = sources.files;

/** Maple's Shopify store files on Shopify's CDN; shop.maplefurnishers.com/cdn/shop/<kind>/… is the same file here. */
export const mapleShopifyFiles = "https://cdn.shopify.com/s/files/1/0691/8651/9229/";
const shopHost = "shop.maplefurnishers.com";
/**
 * The one address a Shopify media file is fetched from, or null when the value is not a Shopify media file of a kind
 * the store keeps (another host, a port or credentials, a path outside Shopify's file and video areas, an unknown
 * extension). shop.maplefurnishers.com is mapped to Shopify's CDN, because after the move that host is the store itself.
 */
export function canonicalShopifyMediaUrl(value: string): string | null {
  let url: URL;
  // Shopify's theme data writes some addresses protocol-relative ("//cdn.shopify.com/…").
  try { url = new URL(value.startsWith("//") ? `https:${value}` : value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const path = url.pathname.replace(/\/{2,}/g, "/");
  let canonical: string;
  if (url.hostname === "cdn.shopify.com") {
    if (!path.startsWith("/s/files/") && !path.startsWith("/videos/")) return null;
    canonical = `https://cdn.shopify.com${path}`;
  } else if (url.hostname === shopHost && path.startsWith("/cdn/shop/")) {
    const rest = path.slice("/cdn/shop/".length);
    canonical = rest.startsWith("videos/") ? `https://cdn.shopify.com/${rest}` : `${mapleShopifyFiles}${rest}`;
  } else return null;
  const name = canonical.slice(canonical.lastIndexOf("/") + 1);
  if (!name || name.includes("..")) return null;
  return extensionOf(canonical) ? canonical : null;
}

function extensionOf(canonical: string): ShopifyMediaExtension | null {
  const name = canonical.slice(canonical.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return Object.hasOwn(shopifyMediaKinds, extension) ? extension as ShopifyMediaExtension : null;
}

/** The local file name for a Shopify media address, or null when it is not one the store keeps. */
export function shopifyMediaName(value: string): string | null {
  const canonical = canonicalShopifyMediaUrl(value);
  if (!canonical) return null;
  return `${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}.${extensionOf(canonical)}`;
}

/** The store's own address for a Shopify media file (`/media/shopify/<name>`), or null. */
export function shopifyMediaPath(value: string): string | null {
  const name = shopifyMediaName(value);
  return name ? `/media/shopify/${name}` : null;
}

/**
 * The type of a stored copy from its first bytes (read at least the first 4 KiB, so an SVG's prolog fits); a file whose
 * bytes are not of its own kind is never served. Shopify may answer a .webp address with PNG bytes (a converted SVG),
 * so the type comes from the bytes, not the name.
 */
export function sniffMediaType(head: Buffer, filename: string): string | null {
  const ascii = (start: number, end: number) => head.toString("latin1", start, end);
  const kind = shopifyMediaKind(filename);
  if (kind === "video") {
    if (ascii(4, 8) === "ftyp") return "video/mp4";
    if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
    return null;
  }
  if (kind !== "image") return null;
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  // SVG is markup: an optional byte-order mark, then a tag (a prolog, comment or doctype may come first), and an <svg>
  // element within the first bytes. An HTML page is refused earlier, by its content type, when it is downloaded.
  const text = head.toString("utf8");
  if (filename.endsWith(".svg") && /^\ufeff?\s*</.test(text) && /<svg[\s>]/i.test(text) && !/<html[\s>]/i.test(text)) return "image/svg+xml";
  return null;
}
