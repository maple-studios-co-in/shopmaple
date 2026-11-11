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

export const pictureSlotKeys = [
  ...menuPictureKeys, ...landingBannerKeys, ...landingTileKeys, ...landingValueKeys, ...blogPictureKeys, ...otherPictureKeys,
] as const;

/** The landing banners are wide on larger screens and square on phones, so each takes a desktop and a mobile image. */
export const pictureSlotResponsiveKeys = landingBannerKeys;

/** Pictures that only decorate (their link or heading speaks for them), which may have no description. */
export const pictureSlotDecorativeKeys = [
  "menu-discovery-new", "menu-discovery-bestsellers", "menu-discovery-look",
  ...landingValueKeys,
  "blog-bestsellers-promo", "blog-collections-photo",
  ...otherPictureKeys,
] as const;
