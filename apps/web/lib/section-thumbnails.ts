/**
 * Pure rules for the homepage section builder's thumbnails (components/admin/section-rail.tsx).
 * A thumbnail is the real section rendered from the draft by the staff-only frame route;
 * these decide what that render contains and when a card needs a fresh one.
 */
import type { StorefrontContent } from "@shopmaple/contracts";

export type HomeSectionKey = StorefrontContent["homeSections"][number]["key"];
/** A section's display name, as the editor and the preview's Edit buttons show it. */
export const sectionName = (key: string) => Object.hasOwn(sectionTitles, key) ? sectionTitles[key]! : key.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
/** Names that say what a section is, where the key alone would not. */
const sectionTitles: Record<string, string> = { editorial: "Pull Up A Chair", compare: "Find Your Feel" };

/**
 * The draft as one section's thumbnail renders it: only that section (shown even when the
 * draft hides it, so the add-section picker can picture it), and nothing that moves, since
 * the thumbnail frame runs no scripts to finish a reveal or an autoplay.
 */
export function thumbnailContent<T extends StorefrontContent>(content: T, key: HomeSectionKey): T {
  return {
    ...content,
    homeSections: [{ key, enabled: true }],
    motion: { autoplaySocial: false, autoplayCities: false, autoplayTicker: false, revealSections: false },
  };
}

const campaign = (content: StorefrontContent, ...keys: string[]) => keys.map((key) => content.campaigns.find((item) => item.key === key) ?? null);

/**
 * The parts of the draft each section draws from, mirroring HomePage (components/home-page.tsx).
 * Section order, visibility, reveal effects and autoplay are left out: they never change a section's picture.
 */
const inputs: Record<HomeSectionKey, (content: StorefrontContent) => unknown> = {
  hero: (c) => [c.homeDetails?.hero, c.templateMedia],
  announcement: (c) => campaign(c, "landing-announcement"),
  difference: (c) => [c.homeDetails?.difference, c.templateMedia],
  categories: (c) => [c.homeCopy.categoryHeading, c.homeMerchandising?.categories],
  ticker: (c) => [c.homeCopy.ticker],
  offers: (c) => [c.homeMerchandising?.offers],
  nimbus: (c) => [c.homeDetails?.nimbus, c.templateMedia],
  "dining-banner": (c) => campaign(c, "landing-dining-table"),
  instagram: (c) => [c.instagramPosts, c.homeCopy.socialHeading],
  // Product cards draw their colour dots, rating and New badge from the product highlights.
  bestsellers: (c) => [c.homeMerchandising?.bestsellers, c.homeCopy.bestsellersHeading, c.productHighlights],
  "seating-banner": (c) => campaign(c, "landing-sofa-accent-chair"),
  chairs: (c) => [c.homeMerchandising?.chairs, c.homeCopy.chairsHeading, c.productHighlights],
  promos: (c) => campaign(c, "landing-dining", "landing-storage", "landing-consoles"),
  editorial: (c) => [c.homeDetails?.editorial],
  // The two products' photos come from the catalogue, which a thumbnail cannot see change.
  compare: (c) => [c.homeDetails?.compare],
  testimonial: (c) => [c.homeDetails?.testimonial, c.homeCopy.testimonialHeading, c.homeCopy.testimonialSubheading, c.templateMedia],
  newsletter: (c) => [c.homeDetails?.newsletter],
  values: (c) => [c.homeDetails?.values, c.templateMedia],
  // The numbers band reads its warranty figure from the Difference promises.
  cities: (c) => [c.homeDetails?.cities, c.homeDetails?.difference.promises, c.homeCitiesLayout, c.templateMedia],
  project: (c) => [c.homeDetails?.project],
};

/** Changes exactly when the section's own content does; a card reloads its thumbnail only then. */
export function sectionSignature(content: StorefrontContent, key: HomeSectionKey): string {
  return JSON.stringify(inputs[key](content)) ?? "";
}
