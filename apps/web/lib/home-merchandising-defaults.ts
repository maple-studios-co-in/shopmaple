import type { HomeMerchandising } from "@shopmaple/contracts";

/** Original homepage selections, retained for revisions saved before merchandising controls. */
export const defaultHomeMerchandising: HomeMerchandising = {
  bestsellers: ["aera-swivel-lounge-chair", "aero-dining-chair", "aileron-signature-bed", "aileron-upholstered-bench", "alcyone-7-seater-sofa", "alina-7-seater-sofa"],
  chairs: ["caro", "ario", "nola", "tara", "arno", "rollo"],
  categories: [
    { key: "sofas", title: "Sofas", collectionHandle: "sofas", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_6.svg?v=1778649785", alt: "Sofas", enabled: true },
    { key: "dining-chair", title: "Dining Chair", collectionHandle: "dining-chair", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Dining_Chairs_bac53a57-f5ab-4af0-beec-7ca279851dc3.png?v=1776235600", alt: "Dining Chair", enabled: true },
    { key: "center-tables", title: "Coffee Tables", collectionHandle: "center-tables", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_7.svg?v=1778649944", alt: "Coffee Tables", enabled: true },
    { key: "accent-chair", title: "Accent Chair", collectionHandle: "accent-chair", image: "https://shop.maplefurnishers.com/cdn/shop/collections/ChatGPTImageJun18_2025_08_27_31PM.png?v=1776235338", alt: "Accent Chair", enabled: true },
    { key: "beds", title: "Beds", collectionHandle: "beds", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_8.svg?v=1778650094", alt: "Beds", enabled: true },
    { key: "dinings", title: "Dinings", collectionHandle: "dinings", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_10.svg?v=1780689685", alt: "Dinings", enabled: true },
  ],
  offers: [
    { key: "clearance-sale", title: "Clearance Sale", collectionHandle: "clearance-sale", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Clearance_Sale.webp?v=1778257635", alt: "Clearance Sale", enabled: true },
    { key: "minimum-60-off", title: "Minimum 30% Off", collectionHandle: "minimum-60-off", image: "https://shop.maplefurnishers.com/cdn/shop/collections/min_30_off_sale_banner.webp?v=1778255612", alt: "Minimum 30% Off", enabled: true },
    { key: "best-buy-under-rs-50-000", title: "Best Buy Under Rs.50,000", collectionHandle: "best-buy-under-rs-50-000", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Maple_Banner_1.webp?v=1778268771", alt: "Best Buy Under Rs.50,000", enabled: true },
    { key: "furniture-store-under-rs-25-000", title: "Furniture Store under Rs. 25,000", collectionHandle: "furniture-store-under-rs-25-000", image: "https://shop.maplefurnishers.com/cdn/shop/collections/Maple_Banner_2.webp?v=1778269923", alt: "Furniture Store under Rs. 25,000", enabled: true },
  ],
};

export function resolveHomeMerchandising(value?: HomeMerchandising): HomeMerchandising {
  return structuredClone(value ?? defaultHomeMerchandising);
}
