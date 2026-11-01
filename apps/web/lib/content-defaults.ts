import { defaultServicePages } from "./service-page-defaults";
import campaigns from "@/data/diwali-campaigns.json";
import { defaultCategoryPages } from "./category-content-defaults";
import { defaultStoryPage } from "./story-content-defaults";
import { defaultHomeDetails } from "./home-details-defaults";
import { defaultNimbusPage } from "./nimbus-content-defaults";
import posts from "@/data/instagram-posts.json";
import type { StorefrontContent } from "@shopmaple/contracts";

/** The "Maple / Impact Layout" frame's order. Its design has no newsletter band; it stays last, and staff can hide it in the section builder. */
const homeSectionOrder: StorefrontContent["homeSections"][number]["key"][] = [
  "hero", "announcement", "difference", "categories", "ticker", "offers", "nimbus", "dining-banner", "instagram", "bestsellers",
  "seating-banner", "chairs", "promos", "cities", "testimonial", "project", "values", "newsletter",
];

// These placements originally scrolled to the product grid on their own collection page.
const collectionCampaignDestinations: Partial<
  Record<keyof typeof campaigns, string>
> = {
  "beds-hero": "/collections/beds#collection-products",
  "beds-sale": "/collections/beds#collection-products",
  "outdoors-hero": "/collections/outdoor-furnitures#collection-products",
  "tv-units-hero": "/collections/tv-media-units#collection-products",
};

/** The "Always Together" strip under the hero, as the Impact Layout frame has it (photo cropped from the frame's own raster). */
const alwaysTogether: StorefrontContent["campaigns"][number] = {
  key: "landing-announcement",
  label: "",
  headline: ["Always Together"],
  supporting: "For every laugh, fight, and memory.",
  offer: [],
  eligibility: "",
  cta: "Celebrate Together",
  href: "/collections/all",
  artwork: {
    desktopImage: "/media/home/strip-always-together.webp",
    mobileImage: "/media/home/strip-always-together.webp",
    alt: "A brass thali of flowers and lit lamps on a wooden table, with a wrapped gift beside it",
  },
};

/** Original bundled copy is the explicit starting draft, never auto-published. */
export const defaultStorefrontContent: StorefrontContent = {
  schemaVersion: 1,
  servicePages: defaultServicePages,
  landingPages: defaultCategoryPages,
  storyPage: defaultStoryPage,
  homeDetails: defaultHomeDetails,
  nimbusPage: defaultNimbusPage,
  homeSections: homeSectionOrder.map((key) => ({ key, enabled: true })),
  homeCopy: {
    categoryHeading: "Shop By Category",
    bestsellersHeading: "Bestsellers",
    chairsHeading: "Chairs",
    socialHeading: "Our Social Proof",
    ticker: "Elegance isn’t found. At Maple, it is crafted.",
    testimonialHeading: "Why They Love Us",
    testimonialSubheading: "Thoughtful designs. Exceptional service.",
  },
  campaigns: Object.entries(campaigns).map(([key, c]) => (key === "landing-announcement" ? alwaysTogether : {
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
