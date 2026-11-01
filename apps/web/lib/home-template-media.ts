import type { TemplateMedia, TemplateMediaItem } from "@shopmaple/contracts";
import { shopFile } from "@/lib/format";

/** Shared storefront defaults, without other page templates or staff labels. */
export const homeTemplateMedia = {
  "home-workshop-poster": { key: "home-workshop-poster", image: shopFile("preview_images/f9239e922cef45df9972f1dac1b89e0a.thumbnail.0000000000.jpg?v=1792990295&width=1600"), alt: "Arranging flowers on a Maple sideboard beside a floral armchair" },
  "home-hero-sofas": { key: "home-hero-sofas", image: shopFile("engaged_5.jpg?v=1767435623"), alt: "" },
  "home-hero-chairs": { key: "home-hero-chairs", image: shopFile("engaged_6_1.jpg?v=1767444019"), alt: "" },
  "home-hero-tables": { key: "home-hero-tables", image: shopFile("engaged_8_1.jpg?v=1767444598"), alt: "" },
  "home-hero-beds": { key: "home-hero-beds", image: shopFile("engaged_9_1.jpg?v=1767448207"), alt: "" },
  "home-nimbus": { key: "home-nimbus", image: shopFile("Chairs_9.svg"), mobileImage: shopFile("Chairs_300_x_600_px.webp?width=900"), alt: "The Nimbus Collection — cloud-like upholstered furniture" },
} satisfies Record<string, TemplateMediaItem>;

export function resolveHomeTemplateMedia(key: keyof typeof homeTemplateMedia, value?: TemplateMedia): TemplateMediaItem {
  return { ...(value?.find(item => item.key === key) ?? homeTemplateMedia[key]) };
}
