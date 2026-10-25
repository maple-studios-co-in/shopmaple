import campaigns from "@/data/diwali-campaigns.json";
import { defaultCategoryPages } from "./category-content-defaults";
import { defaultStoryPage } from "./story-content-defaults";
import { defaultHomeDetails } from "./home-details-defaults";
import posts from "@/data/instagram-posts.json";
import { homeSectionKeys, type StorefrontContent } from "@shopmaple/contracts";

// These placements originally scrolled to the product grid on their own collection page.
const collectionCampaignDestinations: Partial<
  Record<keyof typeof campaigns, string>
> = {
  "beds-hero": "/collections/beds#collection-products",
  "beds-sale": "/collections/beds#collection-products",
  "outdoors-hero": "/collections/outdoor-furnitures#collection-products",
  "tv-units-hero": "/collections/tv-media-units#collection-products",
};

/** Original bundled copy is the explicit starting draft, never auto-published. */
export const defaultStorefrontContent: StorefrontContent = {
  schemaVersion: 1,
  landingPages: defaultCategoryPages,
  storyPage: defaultStoryPage,
  homeDetails: defaultHomeDetails,
  homeSections: homeSectionKeys.map((key) => ({ key, enabled: true })),
  homeCopy: {
    categoryHeading: "Shop By Category",
    bestsellersHeading: "Bestsellers",
    socialHeading: "Our Social Proof",
    ticker: "Elegance isn't found. At Maple, it is custom-built.",
    testimonialHeading: "Why They Love Us",
    testimonialSubheading: "Thoughtful designs. Exceptional service.",
  },
  campaigns: Object.entries(campaigns).map(([key, c]) => ({
    key: key as StorefrontContent["campaigns"][number]["key"],
    label: c.label,
    artwork: null,
    headline: c.headline,
    supporting: c.supporting ?? "",
    offer: c.offer,
    eligibility: c.eligibility,
    cta: c.cta,
    href:
      collectionCampaignDestinations[key as keyof typeof campaigns] ?? c.href,
  })),
  instagramPosts: posts.map((p) => ({
    ...p,
    alt: p.alt ?? "Maple on Instagram",
  })),
  pages: [],
  motion: { autoplaySocial: true, autoplayCities: true, revealSections: false },
};
