import type { TemplateMedia, TemplateMediaItem } from "@shopmaple/contracts";

/** Shared storefront defaults, without other page templates or staff labels. */
export const homeTemplateMedia = {
  "home-workshop-poster": { key: "home-workshop-poster", image: "/media/shopify/f8c5b1f5a169bfa954286564273ea1ae.jpg", alt: "Arranging flowers on a Maple sideboard beside a floral armchair" },
  "home-hero-sofas": { key: "home-hero-sofas", image: "/media/home/hero-sofas.webp", alt: "" },
  "home-hero-chairs": { key: "home-hero-chairs", image: "/media/home/hero-chairs.webp", alt: "" },
  "home-hero-tables": { key: "home-hero-tables", image: "/media/home/hero-tables.webp", alt: "" },
  "home-hero-beds": { key: "home-hero-beds", image: "/media/home/hero-beds.webp", alt: "" },
  "home-nimbus": { key: "home-nimbus", image: "/media/home/nimbus-clouds.webp", mobileImage: "/media/home/nimbus-clouds.webp", alt: "The Nimbus Collection — cloud-like upholstered furniture" },
} satisfies Record<string, TemplateMediaItem>;

export function resolveHomeTemplateMedia(key: keyof typeof homeTemplateMedia, value?: TemplateMedia): TemplateMediaItem {
  return { ...(value?.find(item => item.key === key) ?? homeTemplateMedia[key]) };
}
