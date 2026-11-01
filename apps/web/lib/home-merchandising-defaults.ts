import type { HomeMerchandising } from "@shopmaple/contracts";

/** Original homepage selections, retained for revisions saved before merchandising controls. */
export const defaultHomeMerchandising: HomeMerchandising = {
  bestsellers: ["aera-swivel-lounge-chair", "aero-dining-chair", "aileron-signature-bed", "aileron-upholstered-bench", "alcyone-7-seater-sofa", "alina-7-seater-sofa"],
  chairs: ["caro", "ario", "nola", "tara", "arno", "rollo"],
  categories: [
    { key: "sofas", title: "Sofas", collectionHandle: "sofas", image: "/media/home/category-sofas.webp", alt: "Sofas", enabled: true },
    { key: "dining-chair", title: "Dining Chair", collectionHandle: "dining-chair", image: "/media/home/category-dining-chair.webp", alt: "Dining Chair", enabled: true },
    { key: "center-tables", title: "Coffee Tables", collectionHandle: "center-tables", image: "/media/home/category-center-tables.webp", alt: "Coffee Tables", enabled: true },
    { key: "accent-chair", title: "Accent Chair", collectionHandle: "accent-chair", image: "/media/home/category-accent-chair.webp", alt: "Accent Chair", enabled: true },
    { key: "beds", title: "Beds", collectionHandle: "beds", image: "/media/home/category-beds.webp", alt: "Beds", enabled: true },
    { key: "dinings", title: "Dinings", collectionHandle: "dinings", image: "/media/home/category-dinings.webp", alt: "Dinings", enabled: true },
  ],
  offers: [
    { key: "clearance-sale", title: "Clearance Sale", collectionHandle: "clearance-sale", image: "/media/home/offer-clearance-sale.webp", alt: "Clearance Sale", enabled: true },
    { key: "minimum-60-off", title: "Minimum 30% Off", collectionHandle: "minimum-60-off", image: "/media/home/offer-minimum-30.webp", alt: "Minimum 30% Off", enabled: true },
    { key: "best-buy-under-rs-50-000", title: "Best Buy Under Rs.50,000", collectionHandle: "best-buy-under-rs-50-000", image: "/media/home/offer-best-buy-50k.webp", alt: "Best Buy Under Rs.50,000", enabled: true },
    { key: "furniture-store-under-rs-25-000", title: "Furniture Store under Rs. 25,000", collectionHandle: "furniture-store-under-rs-25-000", image: "/media/home/offer-furniture-25k.webp", alt: "Furniture Store under Rs. 25,000", enabled: true },
  ],
};

export function resolveHomeMerchandising(value?: HomeMerchandising): HomeMerchandising {
  return structuredClone(value ?? defaultHomeMerchandising);
}
