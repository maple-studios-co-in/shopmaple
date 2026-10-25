import sourceNavigation from "../data/navigation.json";
export const navigation = sourceNavigation;
export type NavigationLink =
  (typeof navigation)[number]["columns"][number]["links"][number];
/** Keep source menu destinations within the migrated storefront. */
export function navigationHref(href: string, title: string): string {
  if (href === "#") {
    if (title === "Beds" || title === "By Size") return "/collections/beds";
    if (title === "Dining Table") return "/collections/dining";
    return `/pages/contact?product=${encodeURIComponent(title)}`;
  }
  return href;
}
