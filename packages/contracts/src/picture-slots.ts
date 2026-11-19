/**
 * Storefront pictures that were fixed in code until the owner's decision of 12 Nov 2026 (staff replace every storefront
 * picture from the admin): the main menu, the sofas, tables and chairs pages, the blog, the product page banner, the
 * homepage's editorial flip frames, the Help pages and the sign-in pages. Each is a template media slot (content.ts),
 * edited on the admin's Artwork screen; until staff upload one, the store keeps showing what it showed before.
 */

/** The desktop mega menu: each room's feature photo and the photo beside each discovery link, by its link id. */
export const menuPictureKeys = [
  "menu-living-feature", "menu-bedroom-feature", "menu-discovery-new", "menu-discovery-bestsellers", "menu-discovery-look",
] as const;

/** The wide banners between the rails of the sofas, tables and chairs pages (`<page>-<section key>`). */
export const landingBannerKeys = [
  "sofas-outdoor-banner", "sofas-bedroom-banner", "sofas-living-banner",
  "tables-outdoor-banner", "tables-bedroom-banner", "tables-living-banner", "tables-dining-banner",
  "chairs-outdoor-banner", "chairs-bedroom-banner", "chairs-living-banner",
] as const;

/** Each category circle on those pages (`<page>-tile-<tile key>`). */
export const landingTileKeys = [
  "sofas-tile-sofa-set-designs", "sofas-tile-wooden-sofas", "sofas-tile-sofa-cum-beds", "sofas-tile-recliners", "sofas-tile-l-shape-sofa", "sofas-tile-fabric-sofas", "sofas-tile-chesterfield-sofas", "sofas-tile-3-seater-sofas", "sofas-tile-2-seater-sofas", "sofas-tile-bedroom-sofa",
  "tables-tile-side-table", "tables-tile-dinings", "tables-tile-bar", "tables-tile-consoles", "tables-tile-sofa-table", "tables-tile-tv-media-units",
  "chairs-tile-accent-chair", "chairs-tile-bedroom-chair", "chairs-tile-dining-chair", "chairs-tile-iconic-bar-chair", "chairs-tile-lounge-wing-chair", "chairs-tile-rocking-chair",
] as const;

/** An optional icon above each "Maple Difference" value on those pages (`<page>-value-<value key>`). */
export const landingValueKeys = [
  "sofas-value-grain", "sofas-value-edge", "sofas-value-fabric", "sofas-value-polish",
  "tables-value-quiet-luxury", "tables-value-built-for-real-living", "tables-value-ages-beautifully", "tables-value-strength",
  "chairs-value-quiet-luxury", "chairs-value-built-for-real-living", "chairs-value-ages-beautifully", "chairs-value-strength",
] as const;

/** The cover that replaces an imported article's own picture, by the article's handle (editorial-content.ts). */
export const blogCoverKeys = {
  "space-saving-furniture-ideas-for-small-homes": "blog-cover-small-homes",
  "how-to-identify-quality-furniture-before-you-buy": "blog-cover-quality-furniture",
  "luxury-furniture-trends-2026-what-defined-the-first-half-of-the-year-and-what-will-shape-the-months-ahead": "blog-cover-trends-2026",
  "why-every-successful-cafe-has-three-types-of-seating": "blog-cover-cafe-seating",
  "how-luxury-hotels-design-seating-that-makes-guests-stay-longer": "blog-cover-hotel-seating",
  "standard-dining-table-size-guide-for-indian-homes": "blog-cover-dining-table-sizes",
  "best-wood-for-furniture-in-indian-climate-humidity-heat-and-maintenance": "blog-cover-best-wood",
  "furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door": "blog-cover-delivery-access",
  "what-should-be-finalised-first-furniture-flooring-or-lighting": "blog-cover-finalise-first",
  "how-to-measure-furniture-before-ordering-online": "blog-cover-measure-furniture",
} as const;

/** The blog's article covers, then the two photos beside its product rows. */
export const blogPictureKeys = [
  "blog-cover-small-homes", "blog-cover-quality-furniture", "blog-cover-trends-2026", "blog-cover-cafe-seating",
  "blog-cover-hotel-seating", "blog-cover-dining-table-sizes", "blog-cover-best-wood", "blog-cover-delivery-access",
  "blog-cover-finalise-first", "blog-cover-measure-furniture",
  "blog-bestsellers-promo", "blog-collections-photo",
] as const;

/** The product page's banner, the homepage editorial's flip frames, the Help pages' photos and the sign-in pages'. */
export const otherPictureKeys = [
  "product-banner",
  "home-editorial-flip-1", "home-editorial-flip-2", "home-editorial-flip-3", "home-editorial-flip-4",
  "policy-privacy-policy", "policy-refund-policy", "policy-shipping-policy", "policy-terms-of-service", "policy-return-exchange",
  "auth-login", "auth-sign-up",
] as const;

/** Icons and the logo, fixed in code until the owner asked for them in the live preview too (16 Nov 2026). */
export const iconPictureKeys = [
  "site-logo", "icon-footer-map", "icon-footer-phone", "icon-footer-mail", "icon-footer-phone-light", "icon-footer-mail-light", "icon-footer-marketplace",
  "icon-contact-phone", "icon-contact-mail", "icon-contact-pin",
  "icon-story-handmade", "icon-story-unique-designs", "icon-story-bespoke-pieces",
  "icon-bulk-custom", "icon-bulk-materials", "icon-bulk-quality", "icon-bulk-delivery", "icon-bulk-price",
  "icon-nimbus-feeling-1", "icon-nimbus-feeling-2", "icon-nimbus-feeling-3", "icon-nimbus-note-1", "icon-nimbus-note-2", "icon-nimbus-note-3",
  "icon-terra-feeling-1", "icon-terra-feeling-2", "icon-terra-feeling-3", "icon-terra-note-1", "icon-terra-note-2", "icon-terra-note-3",
  "icon-collection-promise-1", "icon-collection-promise-2", "icon-collection-promise-3",
] as const;

/**
 * The wide photo at the top of every collection page (/collections/<handle>), editable since the owner found the Tables,
 * Beds and Collections pages' heroes could not be changed (19 Nov 2026). By handle and page name, as the catalogue
 * registry (catalogue-registry.ts, server only) lists the collections; a test keeps the two in step. Until staff upload
 * one, a hero shows its collection's first product photo, as it always has.
 */
export const collectionHeroPages = [
  ["all", "All Furniture"], ["sofas", "Sofas"], ["chairs", "Chairs"], ["tables", "Tables"], ["beds", "Beds"], ["storage", "Storage"],
  ["outdoor-furnitures", "Outdoor Furnitures"], ["outdoors", "Outdoors"], ["tv-media-units", "TV & Media Units"], ["clearance-sale", "Clearance Sale"],
  ["minimum-60-off", "Minimum 30% Off"], ["best-buy-under-rs-50-000", "Best Buy Under Rs. 50,000"], ["furniture-store-under-rs-25-000", "Furniture Under Rs. 25,000"],
  ["bestseller-chairs", "Bestseller Chairs"], ["frontpage", "Home page"], ["chair-collection", "Chairs"], ["living-room", "Living Room"],
  ["bedroom-accents", "Bedroom Accents"], ["l-shape-sofa-set", "L Shape Sofa Set"], ["luxe-velvet-hotel-lounge", "Luxe Velvet, Hotel Lounge"],
  ["console-tables", "Console Tables"], ["center-tables", "Center Tables"], ["center-tables-1", "Center Tables"], ["bed-room", "Bed Room"],
  ["office-suite", "Office Suite"], ["hotel-luxury", "Hotel Luxury"], ["bentley-chair", "Bentley Chair"], ["dining-chair", "Dining Chairs"],
  ["sleek-chair", "Sleek Chair"], ["bedroom-chair", "Bedroom Chair"], ["arm-chair", "Arm Chairs"], ["accent-chair", "Accent Chairs"],
  ["lounge-wing-chair", "Lounge/Wing Chair"], ["rocking-chair", "Rocking Chair"], ["iconic-bar-chair", "Iconic/Bar Chair"], ["bentley", "bentley"],
  ["sofa-set-designs", "Designer Sofa Sets"], ["wooden-sofas", "Wooden Sofas"], ["fabric-sofas", "Fabric Sofas"], ["l-shape-sofa", "L Shape Sofa"],
  ["chesterfield-sofas", "Chesterfield Sofas"], ["sofa-cum-beds", "Sofa Cum Beds"], ["recliners", "Recliners"], ["3-seater-sofas", "3 Seater Sofas"],
  ["2-seater-sofas", "2 Seater Sofas"], ["dining-chairs-1", "Dining-Chairs"], ["rocking-chairs", "Rocking Chairs"], ["wing-chair", "Wing Chair"],
  ["bedroom-sofa", "Bedroom Sofa"], ["5-seater-sofa", "5 Seater Sofas"], ["7-seater-sofa", "7 Seater Sofas"], ["sofa-sets", "Sofa Sets"],
  ["sofa-chairs", "Sofa Chairs"], ["bedroom-nimbus", "Bedroom-Nimbus"], ["dining-room-nimbus", "Dining Room - Nimbus"], ["living-room-nimbus", "Living Room Nimbus"],
  ["dining", "Dining Tables"], ["bar", "Bar"], ["sofa-table", "Sofa Tables"], ["side-table", "Side Tables"], ["dinings", "Dining Sets"], ["consoles", "Consoles"],
  ["nimbus", "Nimbus"], ["king-size-beds", "King Size Beds"], ["queen-size-beds", "Queen Size Beds"], ["double-size-beds", "Double Size Beds"],
  ["single-size-beds", "Single Size Beds"], ["solid-wood-beds", "Solid Wood Beds"], ["fabric-beds", "Fabric Beds"], ["sofas-and-chairs", "Sofas & Chairs"],
  ["3-seater-sofa", "3 Seater Sofas"], ["kids-beds", "Kids Beds"], ["office-chairs", "Office Chairs"], ["benches", "Benches & Ottomans"],
] as const;
type HeroKeys<T extends readonly (readonly [string, string])[]> = { [K in keyof T]: T[K] extends readonly [infer Handle extends string, string] ? `collection-hero-${Handle}` : never };
/** `collection-hero-<handle>`, one placement per collection page. */
export const collectionHeroKeys = collectionHeroPages.map(([handle]) => `collection-hero-${handle}`) as unknown as HeroKeys<typeof collectionHeroPages>;

export const pictureSlotKeys = [
  ...menuPictureKeys, ...landingBannerKeys, ...landingTileKeys, ...landingValueKeys, ...blogPictureKeys, ...otherPictureKeys, ...iconPictureKeys,
  ...collectionHeroKeys,
] as const;

/** The landing banners are wide on larger screens and square on phones, so each takes a desktop and a mobile image. */
export const pictureSlotResponsiveKeys = landingBannerKeys;

/** Pictures that only decorate (their link or heading speaks for them), which may have no description. */
export const pictureSlotDecorativeKeys = [
  "menu-discovery-new", "menu-discovery-bestsellers", "menu-discovery-look",
  ...landingValueKeys,
  "blog-bestsellers-promo", "blog-collections-photo",
  ...otherPictureKeys,
  ...iconPictureKeys,
  // A hero photo sits behind the collection's name, which speaks for it.
  ...collectionHeroKeys,
] as const;
