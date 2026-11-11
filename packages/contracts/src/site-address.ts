/**
 * The store's public address, from settings rather than code (owner, 11 Nov 2026: the store moves from
 * store.maplefurnishers.com to shop.maplefurnishers.com, and for a while both are its own address).
 *
 * - SITE_URL: the public address used for canonical links, the sitemap and structured data.
 * - SITE_ALIASES: other addresses of this same store, comma-separated (during the move, the other hostname).
 * - WEB_ORIGIN: the browser origin the API accepts changes from; also the store's own address.
 *
 * A link to any of these becomes a path on this store, and its pictures there are the store's own.
 */
export type SiteEnv = { readonly [name: string]: string | undefined };

/** An http(s) origin with no path, credentials or query, or null. */
function origin(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!/^https?:\/\/[^/\s]/.test(text) || !URL.canParse(text)) return null;
  const url = new URL(text);
  return url.username || url.password ? null : url.origin;
}

/** SITE_URL, else WEB_ORIGIN, else the local development address. Never a hard-coded public hostname. */
export function primarySiteUrl(env: SiteEnv): string {
  return origin(env.SITE_URL) ?? origin(env.WEB_ORIGIN) ?? "http://localhost:3000";
}

/** Every address that is this store: SITE_URL first, then SITE_ALIASES, then WEB_ORIGIN, each once. */
export function siteOrigins(env: SiteEnv): string[] {
  const found = [primarySiteUrl(env), ...(env.SITE_ALIASES ?? "").split(","), env.WEB_ORIGIN].map(value => origin(value ?? undefined));
  return [...new Set(found.filter((value): value is string => value !== null))];
}

/** The hostnames (with any port) of those addresses. */
export const siteHosts = (origins: readonly string[]): string[] => origins.map(value => new URL(value).host);

/**
 * The path on this store for a link to one of its own addresses ("/collections/chairs?x#y"), or null for any other
 * link. A path that would read as protocol-relative ("//elsewhere") is never returned.
 */
export function ownSitePath(href: string, origins: readonly string[]): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  if (!siteHosts(origins).includes(url.host) || url.pathname.startsWith("//")) return null;
  return url.pathname + url.search + url.hash;
}
