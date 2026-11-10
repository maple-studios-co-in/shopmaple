import type { TemplateMedia, TemplateMediaItem, TemplateMediaKey } from "@shopmaple/contracts";
import nimbus from "@/data/landing-nimbus.json";
import story from "@/data/landing-story.json";
import { homeTemplateMedia } from "@/lib/home-template-media";
import { shopFile } from "@/lib/format";

const storySection = (key: string) => story.sections.find(item => item.key === key)!;
const rooms = nimbus.sections.find(item => item.key === "slideshow_PnGjbg")!;
type TemplateMediaSlot = TemplateMediaItem & { label: string; group: "Homepage" | "Homepage icons" | "Cities" | "Nimbus" | "Our Story" | "Contact" | "Bulk Enquiry" | "Terra" };

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
  // The Nimbus redesign (Figma 311:548, owner 10 Nov 2026): the design file's renders, to replace with Maple's own. Each photo
  // keeps the original template's slot whose role it took; the project photo is retired (its key stays valid for older
  // revisions). The room slideshow's photos stay: the homepage hero shows them until staff add slides.
  { key: "nimbus-hero-poster", label: "Opening photo", group: "Nimbus", image: "/media/nimbus-collection/hero.webp", mobileImage: "/media/nimbus-collection/hero-mobile.webp", alt: "A cream sofa, bouclé lounge chairs and a marble nesting table set on a bank of soft cloud" },
  { key: "nimbus-origin", label: "Origin photo", group: "Nimbus", image: "/media/nimbus-collection/origin.webp", alt: "A travertine archway opening onto a sea of cloud at sunrise" },
  { key: "nimbus-craft-poster", label: "Details photo", group: "Nimbus", image: "/media/nimbus-collection/detail.webp", alt: "The piped arm of a cream bouclé armchair, close up" },
  { key: "nimbus-room-living", label: "Sofas & sectionals photo", group: "Nimbus", image: "/media/nimbus-collection/sofas.webp", alt: "A cream modular sectional around a round travertine table in a sunlit room above the clouds" },
  { key: "nimbus-room-collection", label: "Accent chairs photo", group: "Nimbus", image: "/media/nimbus-collection/accent-chairs.webp", mobileImage: "/media/nimbus-collection/accent-chairs.webp", alt: "A cream bouclé accent chair on walnut legs beside a bronze side table" },
  { key: "nimbus-room-dining", label: "Tables & consoles photo", group: "Nimbus", image: "/media/nimbus-collection/tables.webp", alt: "Two fluted travertine nesting tables on a woven rug, a walnut console behind them" },
  { key: "nimbus-room-bedroom", label: "Beds & benches photo", group: "Nimbus", image: "/media/nimbus-collection/beds.webp", alt: "A cream upholstered bed and bench in a bedroom whose arches open onto the clouds" },
  { key: "nimbus-slide-living", label: "Living room slideshow image", group: "Nimbus", image: rooms.images[1]!, mobileImage: rooms.images[0]!, alt: "Living room" },
  { key: "nimbus-slide-bedroom", label: "Bedroom slideshow image", group: "Nimbus", image: rooms.images[3]!, mobileImage: rooms.images[2]!, alt: "Bedroom" },
  { key: "nimbus-slide-dining", label: "Dining room slideshow image", group: "Nimbus", image: rooms.images[5]!, mobileImage: rooms.images[4]!, alt: "Dining room" },
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
  // The Terra Collection (Figma 311:921, owner 10 Nov 2026): the design file's renders, to replace with Maple's own. Rooms,
  // collection cards and concepts follow the page's order, so a photo stays with its card when staff rename it.
  { key: "terra-hero", label: "Opening photo", group: "Terra", image: "/media/terra-collection/hero.webp", mobileImage: "/media/terra-collection/hero-mobile.webp", alt: "A curved olive sofa, a round travertine table and a walnut lounge chair in a sunlit lobby open to an olive garden" },
  { key: "terra-origin", label: "Origin photo", group: "Terra", image: "/media/terra-collection/origin.webp", alt: "An old olive tree and weathered limestone boulders in a sunlit stone courtyard" },
  { key: "terra-room-1", label: "Room 1 photo (the lobby)", group: "Terra", image: "/media/terra-collection/room-lobby.webp", alt: "A curved olive sofa, two timber-ringed lounge chairs and a round walnut table in a travertine lobby" },
  { key: "terra-room-2", label: "Room 2 photo (the bedroom)", group: "Terra", image: "/media/terra-collection/room-bedroom.webp", alt: "A low leather bed with white linen and sculpted timber bedside tables, a garden beyond the glass" },
  { key: "terra-room-3", label: "Room 3 photo (the terrace)", group: "Terra", image: "/media/terra-collection/room-terrace.webp", alt: "Olive woven armchairs, a cream sofa and a round rope coffee table on a shaded poolside terrace" },
  { key: "terra-detail", label: "Material detail photo", group: "Terra", image: "/media/terra-collection/detail.webp", alt: "A walnut armrest wrapped in olive woven cord beside a travertine side table" },
  { key: "terra-browse-1", label: "Collection card 1 photo (lounge seating)", group: "Terra", image: "/media/terra-collection/browse-lounge.webp", alt: "A curved olive sofa, a round walnut table and a timber-ringed lounge chair under travertine arches" },
  { key: "terra-browse-2", label: "Collection card 2 photo (bedroom)", group: "Terra", image: "/media/terra-collection/browse-bedroom.webp", alt: "A leather bed with cream linen beside a carved walnut bedside table" },
  { key: "terra-browse-3", label: "Collection card 3 photo (tables)", group: "Terra", image: "/media/terra-collection/browse-tables.webp", alt: "A round walnut coffee table with a stone bowl beside a travertine side table" },
  { key: "terra-browse-4", label: "Collection card 4 photo (outdoor)", group: "Terra", image: "/media/terra-collection/browse-outdoor.webp", alt: "Woven olive armchairs and a cream sofa around a rope table beside a pool, olive trees beyond" },
  { key: "terra-piece-1", label: "Concept 1 photo (sofa)", group: "Terra", image: "/media/terra-collection/concept-sofa.webp", alt: "A curved three-seat sofa in olive bouclé" },
  { key: "terra-piece-2", label: "Concept 2 photo (lounge chair)", group: "Terra", image: "/media/terra-collection/concept-chair.webp", alt: "A lounge chair with walnut ring arms and leaf-print upholstery" },
  { key: "terra-piece-3", label: "Concept 3 photo (bed)", group: "Terra", image: "/media/terra-collection/concept-bed.webp", alt: "A low tan leather bed made up with cream linen" },
  { key: "terra-piece-4", label: "Concept 4 photo (terrace chair)", group: "Terra", image: "/media/terra-collection/concept-terrace-chair.webp", alt: "An armchair woven in olive cord on a teak frame, with cream cushions" },
  { key: "home-difference-1", label: "Difference promise 1", group: "Homepage icons", image: shopFile("Custom_F.svg"), alt: "" },
  { key: "home-difference-2", label: "Difference promise 2", group: "Homepage icons", image: shopFile("Del_mf.svg"), alt: "" },
  { key: "home-difference-3", label: "Difference promise 3", group: "Homepage icons", image: shopFile("Icon_homepage.svg"), alt: "" },
  { key: "home-difference-4", label: "Difference promise 4", group: "Homepage icons", image: shopFile("Maple_Banner_5.svg"), alt: "" },
  { key: "home-value-quiet-luxury", label: "Quiet Luxury icon", group: "Homepage icons", image: shopFile("Icon_maple_3.svg"), alt: "" },
  { key: "home-value-real-living", label: "Built for Real Living icon", group: "Homepage icons", image: shopFile("Cover_Image_Maple_2.svg"), alt: "" },
  { key: "home-value-ages-beautifully", label: "Ages Beautifully icon", group: "Homepage icons", image: shopFile("Icon_maple_1.svg"), alt: "" },
  { key: "home-value-strength", label: "Strength You Don’t See icon", group: "Homepage icons", image: shopFile("Cover_Image_Maple_5.svg"), alt: "" },
  { key: "home-city-delhi", label: "Delhi city artwork", group: "Cities", image: "/media/cities/delhi.webp", alt: "Delhi" },
  { key: "home-city-kolkata", label: "Kolkata city artwork", group: "Cities", image: "/media/cities/kolkata.webp", alt: "Kolkata" },
  { key: "home-city-hyderabad", label: "Hyderabad city artwork", group: "Cities", image: "/media/cities/hyderabad.webp", alt: "Hyderabad" },
  { key: "home-city-varanasi", label: "Varanasi city artwork", group: "Cities", image: "/media/cities/varanasi.webp", alt: "Varanasi" },
  { key: "home-city-mumbai", label: "Mumbai city artwork", group: "Cities", image: "/media/cities/mumbai.webp", alt: "Mumbai" },
  { key: "home-city-jaipur", label: "Jaipur city artwork", group: "Cities", image: "/media/cities/jaipur.webp", alt: "Jaipur" },
  { key: "home-city-bengaluru", label: "Bengaluru city artwork", group: "Cities", image: "/media/cities/bengaluru.webp", alt: "Bengaluru" },
  { key: "home-city-chennai", label: "Chennai city artwork", group: "Cities", image: "/media/cities/chennai.webp", alt: "Chennai" },
  { key: "home-city-gujarat", label: "Gujarat city artwork", group: "Cities", image: "/media/cities/gujarat.webp", alt: "Gujarat" },
  { key: "home-city-artwork-1", label: "City artwork 1", group: "Cities", image: shopFile("engaged_3_2d4f6db1-cb60-497e-b2a1-061b5886d0ec.svg"), alt: "" },
  { key: "home-city-artwork-2", label: "City artwork 2", group: "Cities", image: shopFile("engaged_5.svg"), alt: "" },
  { key: "home-city-artwork-3", label: "City artwork 3", group: "Cities", image: shopFile("engaged_4.svg"), alt: "" },
  { key: "home-city-artwork-4", label: "City artwork 4", group: "Cities", image: shopFile("engaged_11.svg"), alt: "" },
  { key: "home-city-artwork-5", label: "City artwork 5", group: "Cities", image: shopFile("engaged_9.svg"), alt: "" },
  { key: "home-city-artwork-6", label: "City artwork 6", group: "Cities", image: shopFile("engaged_10.svg"), alt: "" },
  { key: "home-city-artwork-7", label: "City artwork 7", group: "Cities", image: shopFile("engaged_12.svg"), alt: "" },
  { key: "home-city-artwork-8", label: "City artwork 8", group: "Cities", image: shopFile("engaged_2_f055519a-d518-4ed3-9409-2b2a8924295a.svg"), alt: "" },
  { key: "home-city-agra", label: "Agra city artwork", group: "Cities", image: "/media/cities/agra.webp", alt: "Agra" },
];

export function resolveTemplateMedia(key: TemplateMediaKey, value?: TemplateMedia, fallbackAlt?: string): TemplateMediaItem {
  const override = value?.find(item => item.key === key);
  if (override) return { ...override };
  const { label: _label, group: _group, ...asset } = templateMediaSlots.find(item => item.key === key)!;
  return { ...asset, alt: fallbackAlt ?? asset.alt };
}
