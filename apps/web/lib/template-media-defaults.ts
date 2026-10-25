import type { TemplateMedia, TemplateMediaItem, TemplateMediaKey } from "@shopmaple/contracts";
import nimbus from "@/data/landing-nimbus.json";
import story from "@/data/landing-story.json";
import { shopFile } from "@/lib/format";

const nimbusSection = (key: string) => nimbus.sections.find(item => item.key === key)!;
const storySection = (key: string) => story.sections.find(item => item.key === key)!;
const rooms = nimbusSection("slideshow_PnGjbg");
const hero = nimbusSection("hero_section_pfEKq3");
type TemplateMediaSlot = TemplateMediaItem & { label: string; group: "Homepage" | "Nimbus" | "Our Story" };

/** Original template assets. Staff-facing labels are never included in published overrides. */
export const templateMediaSlots: TemplateMediaSlot[] = [
  { key: "home-workshop-poster", label: "Workshop video poster", group: "Homepage", image: "/media/workshop-poster.webp", alt: "Furniture craftsmanship at Maple" },
  { key: "home-hero-sofas", label: "Hero sofas tile", group: "Homepage", image: shopFile("engaged_5.jpg?v=1767435623"), alt: "" },
  { key: "home-hero-chairs", label: "Hero chairs tile", group: "Homepage", image: shopFile("engaged_6_1.jpg?v=1767444019"), alt: "" },
  { key: "home-hero-tables", label: "Hero tables tile", group: "Homepage", image: shopFile("engaged_8_1.jpg?v=1767444598"), alt: "" },
  { key: "home-hero-beds", label: "Hero beds tile", group: "Homepage", image: shopFile("engaged_9_1.jpg?v=1767448207"), alt: "" },
  { key: "home-nimbus", label: "Nimbus collection feature", group: "Homepage", image: shopFile("Chairs_9.svg"), mobileImage: shopFile("Chairs_300_x_600_px.webp?width=900"), alt: "The Nimbus Collection — cloud-like upholstered furniture" },
  { key: "home-newsletter", label: "Newsletter image", group: "Homepage", image: shopFile("Cover_Image_Maple_1.png"), alt: "Maple Furnishers" },
  { key: "home-testimonial-poster", label: "Customer testimonial video poster", group: "Homepage", image: shopFile("preview_images/aee33cd277cb42e7804bfce64be22297.thumbnail.0000000000.jpg?v=1778852379&width=960"), alt: "Maple customer testimonial" },
  { key: "nimbus-room-bedroom", label: "Bedroom room tile", group: "Nimbus", image: shopFile("ChatGPT_Image_Apr_24_2026_03_29_31_AM.png"), alt: "Bedroom" },
  { key: "nimbus-room-living", label: "Living room tile", group: "Nimbus", image: shopFile("Untitled_design_6.svg"), alt: "Living Room" },
  { key: "nimbus-room-dining", label: "Dining room tile", group: "Nimbus", image: shopFile("Chairs.svg"), alt: "Dining Room" },
  { key: "nimbus-room-collection", label: "Collection room tile", group: "Nimbus", image: shopFile("Chairs_1.png"), mobileImage: shopFile("Chairs_3.png"), alt: "Nimbus collection" },
  { key: "nimbus-origin", label: "Collection origin image", group: "Nimbus", image: nimbusSection("media_with_content_JLVGCA").images[0]!, alt: "Nimbus sculptural lounge furniture" },
  { key: "nimbus-slide-living", label: "Living room slideshow image", group: "Nimbus", image: rooms.images[1]!, mobileImage: rooms.images[0]!, alt: "Living room" },
  { key: "nimbus-slide-bedroom", label: "Bedroom slideshow image", group: "Nimbus", image: rooms.images[3]!, mobileImage: rooms.images[2]!, alt: "Bedroom" },
  { key: "nimbus-slide-dining", label: "Dining room slideshow image", group: "Nimbus", image: rooms.images[5]!, mobileImage: rooms.images[4]!, alt: "Dining room" },
  { key: "nimbus-project", label: "Project enquiry image", group: "Nimbus", image: nimbusSection("section_PYMfcR").images[0]!, alt: "Maple furniture design details" },
  { key: "nimbus-hero-poster", label: "Collection hero video poster", group: "Nimbus", image: hero.videos[0]!.poster, mobileImage: hero.videos[1]!.poster, alt: "Nimbus collection film" },
  { key: "nimbus-craft-poster", label: "Craftsmanship video poster", group: "Nimbus", image: nimbusSection("blocks_6WyRMx").videos[0]!.poster, alt: "Nimbus furniture craftsmanship" },
  { key: "story-hero", label: "Story hero image", group: "Our Story", image: storySection("media_with_content_be4kK3").images[0]!, alt: "Maple furniture craftsmanship" },
  { key: "story-film-poster", label: "Workshop film poster", group: "Our Story", image: storySection("media_with_content_deBkJg").videos[0]!.poster, alt: "The Maple workshop" },
];

export function resolveTemplateMedia(key: TemplateMediaKey, value?: TemplateMedia, fallbackAlt?: string): TemplateMediaItem {
  const override = value?.find(item => item.key === key);
  if (override) return { ...override };
  const { label: _label, group: _group, ...asset } = templateMediaSlots.find(item => item.key === key)!;
  return { ...asset, alt: fallbackAlt ?? asset.alt };
}
