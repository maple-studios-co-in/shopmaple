import type { TemplateMedia, TemplateMediaItem } from "@shopmaple/contracts";

/** Shared storefront defaults, without other page templates or staff labels. */
export const homeTemplateMedia = {
  // The hero's first still. Its original (the shop film's poster) was on Shopify; until staff upload one the hero shows
  // a Keeri product's photo instead (template-media-defaults.ts, `product`).
  "home-workshop-poster": { key: "home-workshop-poster", image: "", alt: "Maple furniture" },
  "home-hero-sofas": { key: "home-hero-sofas", image: "/media/home/hero-sofas.webp", alt: "" },
  "home-hero-chairs": { key: "home-hero-chairs", image: "/media/home/hero-chairs.webp", alt: "" },
  "home-hero-tables": { key: "home-hero-tables", image: "/media/home/hero-tables.webp", alt: "" },
  "home-hero-beds": { key: "home-hero-beds", image: "/media/home/hero-beds.webp", alt: "" },
  "home-nimbus": { key: "home-nimbus", image: "/media/home/nimbus-clouds.webp", mobileImage: "/media/home/nimbus-clouds.webp", alt: "The Nimbus Collection — cloud-like upholstered furniture" },
} satisfies Record<string, TemplateMediaItem>;

export function resolveHomeTemplateMedia(key: keyof typeof homeTemplateMedia, value?: TemplateMedia): TemplateMediaItem {
  return { ...(value?.find(item => item.key === key) ?? homeTemplateMedia[key]) };
}
