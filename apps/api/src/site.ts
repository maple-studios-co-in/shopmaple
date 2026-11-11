import { siteOrigins } from "@shopmaple/contracts";

let cached: { key: string; origins: string[] } | undefined;
/**
 * The store's own addresses from the API's settings (SITE_URL, SITE_ALIASES, WEB_ORIGIN; see
 * packages/contracts/src/site-address.ts). During the move both store. and shop. are listed.
 */
export function storeOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const key = `${env.SITE_URL ?? ""}\n${env.SITE_ALIASES ?? ""}\n${env.WEB_ORIGIN ?? ""}`;
  if (cached?.key !== key) cached = { key, origins: siteOrigins(env) };
  return cached.origins;
}
