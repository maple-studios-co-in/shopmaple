import sourceNavigation from "../data/navigation.json";
import membership from "../data/collection-membership.json";

export const navigation = sourceNavigation;
export type NavigationLink =
  (typeof navigation)[number]["columns"][number]["links"][number];
const localCollections = new Set([
  "all",
  "sofas",
  "chairs",
  "tables",
  "beds",
  "storage",
  ...Object.keys(membership),
]);

/** Preserve Shopify destinations until their catalogue is migrated; repair its dead anchors. */
export function navigationHref(href: string, title: string): string {
  if (href === "#") {
    if (title === "Beds" || title === "By Size") return "/collections/beds";
    if (title === "Dining Table") return "/collections/dining";
    return `/pages/contact?product=${encodeURIComponent(title)}`;
  }
  if (
    href.startsWith("/collections/") &&
    !localCollections.has(href.split("/")[2]!)
  )
    return `https://shop.maplefurnishers.com${href}`;
  return href;
}
