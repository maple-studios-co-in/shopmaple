import { ownSitePath, siteOrigins } from "@shopmaple/contracts";

/**
 * The store's own addresses (SITE_URL, SITE_ALIASES, WEB_ORIGIN). A build fixes them as STORE_SITE_ORIGINS
 * (next.config.ts), so the browser has them too; outside a build (tests, scripts) they are read from the settings.
 */
export function storeOrigins(): string[] {
  const built = process.env.STORE_SITE_ORIGINS;
  if (built) return built.split(",").filter(Boolean);
  return siteOrigins({ SITE_URL: process.env.SITE_URL, SITE_ALIASES: process.env.SITE_ALIASES, WEB_ORIGIN: process.env.WEB_ORIGIN });
}

/** The local path for a link to one of the store's own addresses, or null for any other link. */
export const storePath = (href: string) => ownSitePath(href, storeOrigins());
