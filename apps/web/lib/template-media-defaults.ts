import type { TemplateMedia, TemplateMediaItem, TemplateMediaKey } from "@shopmaple/contracts";
import nimbus from "@/data/landing-nimbus.json";
import story from "@/data/landing-story.json";
import { homeTemplateMedia } from "@/lib/home-template-media";

const nimbusSection = (key: string) => nimbus.sections.find(item => item.key === key)!;
const storySection = (key: string) => story.sections.find(item => item.key === key)!;
const rooms = nimbusSection("slideshow_PnGjbg");
const hero = nimbusSection("hero_section_pfEKq3");
type TemplateMediaSlot = TemplateMediaItem & { label: string; group: "Homepage" | "Homepage icons" | "Cities" | "Nimbus" | "Our Story" | "Contact" | "Bulk Enquiry" };

/** Original template assets. Staff-facing labels are never included in published overrides. */
export const templateMediaSlots: TemplateMediaSlot[] = [
  { ...homeTemplateMedia["home-workshop-poster"], label: "Workshop video poster", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-sofas"], label: "Hero sofas tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-chairs"], label: "Hero chairs tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-tables"], label: "Hero tables tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-beds"], label: "Hero beds tile", group: "Homepage" },
  { ...homeTemplateMedia["home-nimbus"], label: "Nimbus collection feature", group: "Homepage" },
  { key: "home-newsletter", label: "Newsletter image", group: "Homepage", image: "/media/shopify/6a1f9eb4ba6d3c3a07c9fe33034665fb.png", alt: "Maple Furnishers" },
  { key: "home-testimonial-poster", label: "Customer testimonial video poster", group: "Homepage", image: "/media/shopify/f6e87cff2aa5d106b180fca8c05ec7ef.jpg", alt: "Maple customer testimonial" },
  { key: "nimbus-room-bedroom", label: "Bedroom room tile", group: "Nimbus", image: "/media/shopify/2f645dfbf3ca451f9fc9db1e5dfbe121.png", alt: "Bedroom" },
  { key: "nimbus-room-living", label: "Living room tile", group: "Nimbus", image: "/media/shopify/bbed2f55984a03cf7de04d8cc50e2612.svg", alt: "Living Room" },
  { key: "nimbus-room-dining", label: "Dining room tile", group: "Nimbus", image: "/media/shopify/487b331e96d4a14f45c95bb34efecad5.svg", alt: "Dining Room" },
  { key: "nimbus-room-collection", label: "Collection room tile", group: "Nimbus", image: "/media/shopify/e3b91f1efae4846d38d9e5a78b11d2d8.png", mobileImage: "/media/shopify/92e67b956ebb2ba8e1f8dec6f1e95011.png", alt: "Nimbus collection" },
  { key: "nimbus-origin", label: "Collection origin image", group: "Nimbus", image: nimbusSection("media_with_content_JLVGCA").images[0]!, alt: "Nimbus sculptural lounge furniture" },
  { key: "nimbus-slide-living", label: "Living room slideshow image", group: "Nimbus", image: rooms.images[1]!, mobileImage: rooms.images[0]!, alt: "Living room" },
  { key: "nimbus-slide-bedroom", label: "Bedroom slideshow image", group: "Nimbus", image: rooms.images[3]!, mobileImage: rooms.images[2]!, alt: "Bedroom" },
  { key: "nimbus-slide-dining", label: "Dining room slideshow image", group: "Nimbus", image: rooms.images[5]!, mobileImage: rooms.images[4]!, alt: "Dining room" },
  { key: "nimbus-project", label: "Project enquiry image", group: "Nimbus", image: nimbusSection("section_PYMfcR").images[0]!, alt: "Maple furniture design details" },
  { key: "nimbus-hero-poster", label: "Collection hero video poster", group: "Nimbus", image: hero.videos[0]!.poster, mobileImage: hero.videos[1]!.poster, alt: "Nimbus collection film" },
  { key: "nimbus-craft-poster", label: "Craftsmanship video poster", group: "Nimbus", image: nimbusSection("blocks_6WyRMx").videos[0]!.poster, alt: "Nimbus furniture craftsmanship" },
  // Our Story's redesign (Figma 293:1093, owner 10 Nov 2026). The opening and belief photos are Maple's own (the belief
  // one is the old film's poster frame); the chapter pictures are the design file's renders, to replace when real ones exist.
  { key: "story-hero", label: "Story hero image", group: "Our Story", image: storySection("media_with_content_be4kK3").images[0]!, alt: "A hand resting on the bouclé seat of a Maple armchair" },
  { key: "story-belief", label: "Belief image", group: "Our Story", image: storySection("media_with_content_deBkJg").videos[0]!.poster, alt: "The hand-woven cord seat of a Maple chair" },
  { key: "story-chapter-1", label: "Journey chapter 1 image", group: "Our Story", image: "/media/our-story/chapter-1.webp", alt: "A walnut chair frame on a workbench strewn with shavings and hand planes" },
  { key: "story-chapter-2", label: "Journey chapter 2 image", group: "Our Story", image: "/media/our-story/chapter-2.webp", alt: "A cream sofa with burgundy cushions in a sunlit Indian living room" },
  { key: "story-chapter-3", label: "Journey chapter 3 image", group: "Our Story", image: "/media/our-story/chapter-3.webp", alt: "A bouclé lounge chair on a walnut frame beneath an arched alcove" },
  { key: "story-chapter-4", label: "Journey chapter 4 image", group: "Our Story", image: "/media/our-story/chapter-4.webp", alt: "An upholsterer fitting burgundy fabric over a chair beside paper patterns" },
  { key: "story-chapter-5", label: "Journey chapter 5 image", group: "Our Story", image: "/media/our-story/chapter-5.webp", alt: "A cream armchair with a burgundy cushion lit for a photo shoot" },
  { key: "story-chapter-6", label: "Journey chapter 6 image", group: "Our Story", image: "/media/our-story/chapter-6.webp", alt: "Cream dining chairs around a round walnut table in a stone-floored room" },
  { key: "story-chapter-7", label: "Journey chapter 7 image", group: "Our Story", image: "/media/our-story/chapter-7.webp", alt: "A craftsman wrapping a walnut sideboard in protective cloth" },
  // The contact page's redesign (Figma 298:511, owner 10 Nov 2026): the design file's two renders, to replace with Maple's own.
  { key: "contact-studio", label: "Introduction photo", group: "Contact", image: "/media/contact/studio.webp", alt: "A walnut dining table between two cream bouclé chairs on a jute rug, a burgundy armchair by the window" },
  { key: "contact-workshop", label: "Delhi workshop photo", group: "Contact", image: "/media/contact/workshop.webp", alt: "A craftsman sanding the curved walnut frame of a chair at a workbench, chisels beside it" },
  // The Bulk Enquiry redesign (Figma 298:924, owner 10 Nov 2026): the design file's renders, to replace with Maple's own.
  { key: "bulk-hero", label: "Opening photo", group: "Bulk Enquiry", image: "/media/bulk-enquiry/hero.webp", alt: "A lounge with a cream sectional sofa, velvet armchairs and a dark marble coffee table" },
  { key: "bulk-step-meet", label: "Meet your designer photo", group: "Bulk Enquiry", image: "/media/bulk-enquiry/step-meet.webp", alt: "A designer sketching on a floor plan with a client, material samples across the table" },
  { key: "bulk-step-design", label: "Refine every detail photo", group: "Bulk Enquiry", image: "/media/bulk-enquiry/step-design.webp", alt: "A designer pointing out a 3D render of a living room to a client beside wood and fabric samples" },
  { key: "bulk-step-deliver", label: "Bring it home photo", group: "Bulk Enquiry", image: "/media/bulk-enquiry/step-deliver.webp", alt: "Maple’s team unpacking, hanging art and arranging cushions in a client’s living room" },
  { key: "bulk-proposal", label: "Proposal photo", group: "Bulk Enquiry", image: "/media/bulk-enquiry/proposal.webp", alt: "Upholstery fabrics, walnut, travertine and a floor plan laid out for a project" },
  { key: "home-difference-1", label: "Difference promise 1", group: "Homepage icons", image: "/media/shopify/810bf424e7f5965dcc4965652150f519.svg", alt: "" },
  { key: "home-difference-2", label: "Difference promise 2", group: "Homepage icons", image: "/media/shopify/42b9439f8a75c7802e6999788a0a24e5.svg", alt: "" },
  { key: "home-difference-3", label: "Difference promise 3", group: "Homepage icons", image: "/media/shopify/3c07f1e8f8eca3f099f998ed76c98ae9.svg", alt: "" },
  { key: "home-difference-4", label: "Difference promise 4", group: "Homepage icons", image: "/media/shopify/5312458c26254d733cd7067921fcd4da.svg", alt: "" },
  { key: "home-value-quiet-luxury", label: "Quiet Luxury icon", group: "Homepage icons", image: "/media/shopify/92d3be8e403dddf68de05a5f1404f9d4.svg", alt: "" },
  { key: "home-value-real-living", label: "Built for Real Living icon", group: "Homepage icons", image: "/media/shopify/4ef943542c1f7a6948ae8af5cc0f7f58.svg", alt: "" },
  { key: "home-value-ages-beautifully", label: "Ages Beautifully icon", group: "Homepage icons", image: "/media/shopify/8a4d8dfa23cb366a932e3020010e74a8.svg", alt: "" },
  { key: "home-value-strength", label: "Strength You Don’t See icon", group: "Homepage icons", image: "/media/shopify/a4a985392ec76c0175aba4f59c879ede.svg", alt: "" },
  { key: "home-city-delhi", label: "Delhi city artwork", group: "Cities", image: "/media/cities/delhi.webp", alt: "Delhi" },
  { key: "home-city-kolkata", label: "Kolkata city artwork", group: "Cities", image: "/media/cities/kolkata.webp", alt: "Kolkata" },
  { key: "home-city-hyderabad", label: "Hyderabad city artwork", group: "Cities", image: "/media/cities/hyderabad.webp", alt: "Hyderabad" },
  { key: "home-city-varanasi", label: "Varanasi city artwork", group: "Cities", image: "/media/cities/varanasi.webp", alt: "Varanasi" },
  { key: "home-city-mumbai", label: "Mumbai city artwork", group: "Cities", image: "/media/cities/mumbai.webp", alt: "Mumbai" },
  { key: "home-city-jaipur", label: "Jaipur city artwork", group: "Cities", image: "/media/cities/jaipur.webp", alt: "Jaipur" },
  { key: "home-city-bengaluru", label: "Bengaluru city artwork", group: "Cities", image: "/media/cities/bengaluru.webp", alt: "Bengaluru" },
  { key: "home-city-chennai", label: "Chennai city artwork", group: "Cities", image: "/media/cities/chennai.webp", alt: "Chennai" },
  { key: "home-city-gujarat", label: "Gujarat city artwork", group: "Cities", image: "/media/cities/gujarat.webp", alt: "Gujarat" },
  { key: "home-city-artwork-1", label: "City artwork 1", group: "Cities", image: "/media/shopify/9f0133efbb387f0f88791864e7a27773.svg", alt: "" },
  { key: "home-city-artwork-2", label: "City artwork 2", group: "Cities", image: "/media/shopify/f31ecae8be1fb47df55a2ca398c3d1e6.svg", alt: "" },
  { key: "home-city-artwork-3", label: "City artwork 3", group: "Cities", image: "/media/shopify/8880fe84ee809a72d7f0850fbc829067.svg", alt: "" },
  { key: "home-city-artwork-4", label: "City artwork 4", group: "Cities", image: "/media/shopify/2774449bb413ac0707583d7855a20257.svg", alt: "" },
  { key: "home-city-artwork-5", label: "City artwork 5", group: "Cities", image: "/media/shopify/310e8c5bee99349cb2518705193441df.svg", alt: "" },
  { key: "home-city-artwork-6", label: "City artwork 6", group: "Cities", image: "/media/shopify/0e03d90f650a697f9653bde630feefc4.svg", alt: "" },
  { key: "home-city-artwork-7", label: "City artwork 7", group: "Cities", image: "/media/shopify/36acb01ec777dabbbcdd7a466446313b.svg", alt: "" },
  { key: "home-city-artwork-8", label: "City artwork 8", group: "Cities", image: "/media/shopify/d976f5f8269ae89a987b74a4d94eded2.svg", alt: "" },
  { key: "home-city-agra", label: "Agra city artwork", group: "Cities", image: "/media/cities/agra.webp", alt: "Agra" },
];

export function resolveTemplateMedia(key: TemplateMediaKey, value?: TemplateMedia, fallbackAlt?: string): TemplateMediaItem {
  const override = value?.find(item => item.key === key);
  if (override) return { ...override };
  const { label: _label, group: _group, ...asset } = templateMediaSlots.find(item => item.key === key)!;
  return { ...asset, alt: fallbackAlt ?? asset.alt };
}
