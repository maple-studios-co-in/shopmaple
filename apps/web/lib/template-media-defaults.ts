import type { TemplateMedia, TemplateMediaItem, TemplateMediaKey } from "@shopmaple/contracts";
import nimbus from "@/data/landing-nimbus.json";
import story from "@/data/landing-story.json";
import { homeTemplateMedia } from "@/lib/home-template-media";
import { shopFile } from "@/lib/format";

const nimbusSection = (key: string) => nimbus.sections.find(item => item.key === key)!;
const storySection = (key: string) => story.sections.find(item => item.key === key)!;
const rooms = nimbusSection("slideshow_PnGjbg");
const hero = nimbusSection("hero_section_pfEKq3");
type TemplateMediaSlot = TemplateMediaItem & { label: string; group: "Homepage" | "Homepage icons" | "Cities" | "Nimbus" | "Our Story" };

/** Original template assets. Staff-facing labels are never included in published overrides. */
export const templateMediaSlots: TemplateMediaSlot[] = [
  { ...homeTemplateMedia["home-workshop-poster"], label: "Workshop video poster", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-sofas"], label: "Hero sofas tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-chairs"], label: "Hero chairs tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-tables"], label: "Hero tables tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-beds"], label: "Hero beds tile", group: "Homepage" },
  { ...homeTemplateMedia["home-nimbus"], label: "Nimbus collection feature", group: "Homepage" },
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
  { key: "home-difference-1", label: "Difference promise 1", group: "Homepage icons", image: shopFile("Custom_F.svg"), alt: "" },
  { key: "home-difference-2", label: "Difference promise 2", group: "Homepage icons", image: shopFile("Del_mf.svg"), alt: "" },
  { key: "home-difference-3", label: "Difference promise 3", group: "Homepage icons", image: shopFile("Icon_homepage.svg"), alt: "" },
  { key: "home-difference-4", label: "Difference promise 4", group: "Homepage icons", image: shopFile("Maple_Banner_5.svg"), alt: "" },
  { key: "home-value-quiet-luxury", label: "Quiet Luxury icon", group: "Homepage icons", image: shopFile("Icon_maple_3.svg"), alt: "" },
  { key: "home-value-real-living", label: "Built for Real Living icon", group: "Homepage icons", image: shopFile("Cover_Image_Maple_2.svg"), alt: "" },
  { key: "home-value-ages-beautifully", label: "Ages Beautifully icon", group: "Homepage icons", image: shopFile("Icon_maple_1.svg"), alt: "" },
  { key: "home-value-strength", label: "Strength You Don’t See icon", group: "Homepage icons", image: shopFile("Cover_Image_Maple_5.svg"), alt: "" },
  { key: "home-city-delhi", label: "Delhi city artwork", group: "Cities", image: shopFile("Delhi.svg"), alt: "Delhi" },
  { key: "home-city-kolkata", label: "Kolkata city artwork", group: "Cities", image: shopFile("Kolkata.svg"), alt: "Kolkata" },
  { key: "home-city-hyderabad", label: "Hyderabad city artwork", group: "Cities", image: shopFile("Hyderabad.svg"), alt: "Hyderabad" },
  { key: "home-city-varanasi", label: "Varanasi city artwork", group: "Cities", image: shopFile("VARANASI1.svg"), alt: "Varanasi" },
  { key: "home-city-mumbai", label: "Mumbai city artwork", group: "Cities", image: shopFile("Mumbai.svg"), alt: "Mumbai" },
  { key: "home-city-jaipur", label: "Jaipur city artwork", group: "Cities", image: shopFile("jaipur.svg"), alt: "Jaipur" },
  { key: "home-city-bengaluru", label: "Bengaluru city artwork", group: "Cities", image: shopFile("bengaluru_5d95b443-519f-4637-9d23-0cbbf2838908.svg"), alt: "Bengaluru" },
  { key: "home-city-chennai", label: "Chennai city artwork", group: "Cities", image: shopFile("chennai.svg"), alt: "Chennai" },
  { key: "home-city-gujarat", label: "Gujarat city artwork", group: "Cities", image: shopFile("gujrat.svg"), alt: "Gujarat" },
  { key: "home-city-artwork-1", label: "City artwork 1", group: "Cities", image: shopFile("engaged_3_2d4f6db1-cb60-497e-b2a1-061b5886d0ec.svg"), alt: "" },
  { key: "home-city-artwork-2", label: "City artwork 2", group: "Cities", image: shopFile("engaged_5.svg"), alt: "" },
  { key: "home-city-artwork-3", label: "City artwork 3", group: "Cities", image: shopFile("engaged_4.svg"), alt: "" },
  { key: "home-city-artwork-4", label: "City artwork 4", group: "Cities", image: shopFile("engaged_11.svg"), alt: "" },
  { key: "home-city-artwork-5", label: "City artwork 5", group: "Cities", image: shopFile("engaged_9.svg"), alt: "" },
  { key: "home-city-artwork-6", label: "City artwork 6", group: "Cities", image: shopFile("engaged_10.svg"), alt: "" },
  { key: "home-city-artwork-7", label: "City artwork 7", group: "Cities", image: shopFile("engaged_12.svg"), alt: "" },
  { key: "home-city-artwork-8", label: "City artwork 8", group: "Cities", image: shopFile("engaged_2_f055519a-d518-4ed3-9409-2b2a8924295a.svg"), alt: "" },
  { key: "home-city-agra", label: "Agra city artwork", group: "Cities", image: shopFile("Agra.svg"), alt: "Agra" },
];

export function resolveTemplateMedia(key: TemplateMediaKey, value?: TemplateMedia, fallbackAlt?: string): TemplateMediaItem {
  const override = value?.find(item => item.key === key);
  if (override) return { ...override };
  const { label: _label, group: _group, ...asset } = templateMediaSlots.find(item => item.key === key)!;
  return { ...asset, alt: fallbackAlt ?? asset.alt };
}
