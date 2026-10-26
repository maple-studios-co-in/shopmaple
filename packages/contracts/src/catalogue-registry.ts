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
  "3-seater-sofa": "3 Seater Sofas",
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
// Functional collections augment Shopify membership from explicit Keeri taxonomy.
// Campaigns, bestsellers and price promotions retain their curated membership.
function taxonomyMember(product: CollectionProduct, handle: string) {
  const t = product.sourceTaxonomy;
  if (!t) return false;
  const normalize = (value: string | null) => (value ?? "").trim().toLowerCase();
  const type = normalize(t.productType).replace(/s$/, "");
  const category = normalize(t.category), sub = normalize(t.subCategory);
  switch (handle) {
    case "chair-collection": return type === "chair";
    case "dining-chair": case "dining-chairs-1": return type === "chair" && category === "dining";
    case "arm-chair": return type === "chair" && category === "arm";
    case "accent-chair": return type === "chair" && category === "accent";
    case "rocking-chair": case "rocking-chairs": return type === "chair" && category === "rocking";
    case "lounge-wing-chair": return type === "chair" && (category === "lounge" || category === "accent" && ["lou", "win"].includes(sub));
    case "wing-chair": return type === "chair" && category === "accent" && sub === "win";
    case "dining": case "dinings": return type === "table" && category === "dining";
    case "center-tables": case "center-tables-1": case "sofa-table": return type === "table" && category === "sofa/coffee table";
    case "side-table": return type === "table" && category === "side";
    case "console-tables": case "consoles": return type === "console" || type === "table" && category === "console";
    case "tv-media-units": return type === "table" && category === "tv & media units";
    case "fabric-beds": return type === "bed" && sub === "fabric beds";
    case "solid-wood-beds": return type === "bed" && sub === "solid wood beds";
    case "3-seater-sofa": return type === "sofa" && category === "3 seater";
    case "5-seater-sofa": return type === "sofa" && category === "5 seater";
    case "7-seater-sofa": return type === "sofa" && ["7 seater", "7+ seater"].includes(category);
    default: return false;
  }
}
export function collectionMembers<T extends CollectionProduct>(products: T[], handle: string) {
  if (handle === "all") return products;
  if (handle === "sofas-and-chairs")
    return products.filter(
      (product) =>
        product.category === "sofas" || product.category === "chairs",
    );
  if (Object.hasOwn(categoryNames, handle))
    return products.filter((product) => product.category === handle);
  if (Object.hasOwn(membership, handle) || Object.hasOwn(collectionTitles, handle)) {
    const byHandle = new Map(
      products.map((product) => [product.handle, product]),
    );
    const original = ((membership as Record<string, string[]>)[handle] ?? [])
      .map((member) => byHandle.get(member))
      .filter((product): product is T => Boolean(product));
    const combined = [...original, ...products.filter(product => taxonomyMember(product, handle))];
    return [...new Map(combined.map(product => [product.handle, product])).values()];
  }
  return products.filter((product) => product.category === handle);
}
