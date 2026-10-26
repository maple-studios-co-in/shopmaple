// Server catalogue membership. Import this explicit subpath only where the complete registry is needed.
import { categoryNames, type CollectionProduct } from "./catalogue-collections";
import oldMembership from "../data/collection-membership.json";
import sourceCollections from "../data/source-collections.json";
export { sourceCollections };
const membership: Record<string, string[]> = {
  ...oldMembership,
  ...Object.fromEntries(
    Object.entries(sourceCollections).map(([handle, collection]) => [
      handle,
      collection.handles,
    ]),
  ),
};
export const collectionTitles: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(sourceCollections).map(([handle, collection]) => [
      handle,
      collection.title,
    ]),
  ),
  ...categoryNames,
  "sofas-and-chairs": "Sofas & Chairs",
  "5-seater-sofa": "5 Seater Sofas",
  "7-seater-sofa": "7 Seater Sofas",
  "chair-collection": "Chairs",
  "center-tables-1": "Center Tables",
  "side-table": "Side Tables",
  "sofa-table": "Sofa Tables",
  "bestseller-chairs": "Bestseller Chairs",
  "arm-chair": "Arm Chairs",
  "dining-chair": "Dining Chairs",
  "center-tables": "Center Tables",
  "accent-chair": "Accent Chairs",
  dinings: "Dining Sets",
  "clearance-sale": "Clearance Sale",
  "minimum-60-off": "Minimum 30% Off",
  "best-buy-under-rs-50-000": "Best Buy Under Rs. 50,000",
  "furniture-store-under-rs-25-000": "Furniture Under Rs. 25,000",
  dining: "Dining Tables",
  "console-tables": "Console Tables",
};
export function collectionMembers<T extends CollectionProduct>(products: T[], handle: string) {
  if (handle === "all") return products;
  if (handle === "sofas-and-chairs")
    return products.filter(
      (product) =>
        product.category === "sofas" || product.category === "chairs",
    );
  if (Object.hasOwn(categoryNames, handle))
    return products.filter((product) => product.category === handle);
  if (Object.hasOwn(membership, handle)) {
    const byHandle = new Map(
      products.map((product) => [product.handle, product]),
    );
    return ((membership as Record<string, string[]>)[handle] ?? [])
      .map((member) => byHandle.get(member))
      .filter((product): product is T => Boolean(product));
  }
  return products.filter((product) => product.category === handle);
}
