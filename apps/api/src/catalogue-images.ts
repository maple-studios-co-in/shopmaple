import { siteHosts } from "@shopmaple/contracts";
import { storeOrigins } from "./site.js";
/**
 * A catalogue photo the store may show: a Keeri photo (/media/keeri/<id>.webp) on one of the store's own addresses
 * (SITE_URL, SITE_ALIASES). Keeri is the store's only product source (owner, 11 Nov 2026), so no other host is a product
 * photo, Shopify's included.
 */
export function approvedCatalogueImage(value: string) {
  if (!URL.canParse(value)) return false;
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.port &&
    siteHosts(storeOrigins()).includes(u.host) &&
    /^\/media\/keeri\/[A-Za-z0-9_-]{1,64}\.webp$/.test(u.pathname) &&
    !u.search &&
    !u.hash
  );
}
