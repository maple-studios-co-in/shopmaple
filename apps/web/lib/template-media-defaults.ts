import type { TemplateMedia, TemplateMediaItem, TemplateMediaKey } from "@shopmaple/contracts";
import { homeTemplateMedia } from "@/lib/home-template-media";

/**
 * A placement's original artwork. `image` is a file bundled with the store, or "" where there is none: the artwork
 * first published on Shopify left the store (owner, 11 Nov 2026). Such a placement shows, until staff upload their own,
 * the first photo of `product` (a Keeri product the store lists) or, without one, nothing at all.
 */
export type TemplateMediaSlot = TemplateMediaItem & { product?: string; label: string; group: "Homepage" | "Homepage icons" | "Cities" | "Nimbus" | "Our Story" | "Contact" | "Bulk Enquiry" };

/** Original template assets. Staff-facing labels are never included in published overrides. */
export const templateMediaSlots: TemplateMediaSlot[] = [
  { ...homeTemplateMedia["home-workshop-poster"], product: "arbor-sofa", label: "Workshop video poster", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-sofas"], label: "Hero sofas tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-chairs"], label: "Hero chairs tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-tables"], label: "Hero tables tile", group: "Homepage" },
  { ...homeTemplateMedia["home-hero-beds"], label: "Hero beds tile", group: "Homepage" },
  { ...homeTemplateMedia["home-nimbus"], label: "Nimbus collection feature", group: "Homepage" },
  { key: "home-newsletter", label: "Newsletter image", group: "Homepage", image: "", alt: "Maple Furnishers" },
  { key: "home-testimonial-poster", label: "Customer testimonial video poster", group: "Homepage", image: "", alt: "Maple customer testimonial" },
  { key: "nimbus-room-bedroom", label: "Bedroom room tile", group: "Nimbus", image: "", product: "elara-bed", alt: "Bedroom" },
  { key: "nimbus-room-living", label: "Living room tile", group: "Nimbus", image: "", product: "alpine", alt: "Living Room" },
  { key: "nimbus-room-dining", label: "Dining room tile", group: "Nimbus", image: "", product: "radiance-table", alt: "Dining Room" },
  { key: "nimbus-room-collection", label: "Collection room tile", group: "Nimbus", image: "", product: "virelle-chair", alt: "Nimbus collection" },
  { key: "nimbus-origin", label: "Collection origin image", group: "Nimbus", image: "", product: "virelle", alt: "Nimbus sculptural lounge furniture" },
  { key: "nimbus-slide-living", label: "Living room slideshow image", group: "Nimbus", image: "", product: "aurevo", alt: "Living room" },
  { key: "nimbus-slide-bedroom", label: "Bedroom slideshow image", group: "Nimbus", image: "", product: "altura-table", alt: "Bedroom" },
  { key: "nimbus-slide-dining", label: "Dining room slideshow image", group: "Nimbus", image: "", product: "meridian-table", alt: "Dining room" },
  { key: "nimbus-project", label: "Project enquiry image", group: "Nimbus", image: "", product: "mela", alt: "Maple furniture design details" },
  { key: "nimbus-hero-poster", label: "Collection hero video poster", group: "Nimbus", image: "", product: "geometric-grotto", alt: "The Nimbus collection" },
  { key: "nimbus-craft-poster", label: "Craftsmanship video poster", group: "Nimbus", image: "", product: "aether-table", alt: "Nimbus furniture craftsmanship" },
  // Our Story's redesign (Figma 293:1093, owner 10 Nov 2026). The opening and belief photos stand in from Keeri products
  // until staff upload Maple's own; the chapter pictures are the design file's renders, to replace when real ones exist.
  { key: "story-hero", label: "Story hero image", group: "Our Story", image: "", product: "luca", alt: "A Maple armchair" },
  { key: "story-belief", label: "Belief image", group: "Our Story", image: "", product: "varin", alt: "A Maple dining chair" },
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
  { key: "home-difference-1", label: "Difference promise 1", group: "Homepage icons", image: "", alt: "" },
  { key: "home-difference-2", label: "Difference promise 2", group: "Homepage icons", image: "", alt: "" },
  { key: "home-difference-3", label: "Difference promise 3", group: "Homepage icons", image: "", alt: "" },
  { key: "home-difference-4", label: "Difference promise 4", group: "Homepage icons", image: "", alt: "" },
  { key: "home-value-quiet-luxury", label: "Quiet Luxury icon", group: "Homepage icons", image: "", alt: "" },
  { key: "home-value-real-living", label: "Built for Real Living icon", group: "Homepage icons", image: "", alt: "" },
  { key: "home-value-ages-beautifully", label: "Ages Beautifully icon", group: "Homepage icons", image: "", alt: "" },
  { key: "home-value-strength", label: "Strength You Don’t See icon", group: "Homepage icons", image: "", alt: "" },
  { key: "home-city-delhi", label: "Delhi city artwork", group: "Cities", image: "/media/cities/delhi.webp", alt: "Delhi" },
  { key: "home-city-kolkata", label: "Kolkata city artwork", group: "Cities", image: "/media/cities/kolkata.webp", alt: "Kolkata" },
  { key: "home-city-hyderabad", label: "Hyderabad city artwork", group: "Cities", image: "/media/cities/hyderabad.webp", alt: "Hyderabad" },
  { key: "home-city-varanasi", label: "Varanasi city artwork", group: "Cities", image: "/media/cities/varanasi.webp", alt: "Varanasi" },
  { key: "home-city-mumbai", label: "Mumbai city artwork", group: "Cities", image: "/media/cities/mumbai.webp", alt: "Mumbai" },
  { key: "home-city-jaipur", label: "Jaipur city artwork", group: "Cities", image: "/media/cities/jaipur.webp", alt: "Jaipur" },
  { key: "home-city-bengaluru", label: "Bengaluru city artwork", group: "Cities", image: "/media/cities/bengaluru.webp", alt: "Bengaluru" },
  { key: "home-city-chennai", label: "Chennai city artwork", group: "Cities", image: "/media/cities/chennai.webp", alt: "Chennai" },
  { key: "home-city-gujarat", label: "Gujarat city artwork", group: "Cities", image: "/media/cities/gujarat.webp", alt: "Gujarat" },
  { key: "home-city-artwork-1", label: "City artwork 1", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-2", label: "City artwork 2", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-3", label: "City artwork 3", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-4", label: "City artwork 4", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-5", label: "City artwork 5", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-6", label: "City artwork 6", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-7", label: "City artwork 7", group: "Cities", image: "", alt: "" },
  { key: "home-city-artwork-8", label: "City artwork 8", group: "Cities", image: "", alt: "" },
  { key: "home-city-agra", label: "Agra city artwork", group: "Cities", image: "/media/cities/agra.webp", alt: "Agra" },
];

export function resolveTemplateMedia(key: TemplateMediaKey, value?: TemplateMedia, fallbackAlt?: string): TemplateMediaItem {
  const override = value?.find(item => item.key === key);
  if (override) return { ...override };
  const { label: _label, group: _group, product: _product, ...asset } = templateMediaSlots.find(item => item.key === key)!;
  return { ...asset, alt: fallbackAlt ?? asset.alt };
}

/** Each listed product's first photo, by handle (lib/product-photos.ts reads them for a page). */
export type ProductPhotos = ReadonlyMap<string, string>;

/** The Keeri products whose photos stand in for these placements, where staff have not uploaded their own. */
export function artworkProducts(keys: readonly TemplateMediaKey[], value?: TemplateMedia): string[] {
  return keys.flatMap(key => {
    if (resolveTemplateMedia(key, value).image) return [];
    const product = templateMediaSlots.find(item => item.key === key)?.product;
    return product ? [product] : [];
  });
}

/**
 * The artwork to draw for a placement: staff's upload, else the bundled original, else the stand-in product's photo
 * (desktop and mobile alike), else null, and the placement is left out.
 */
export function resolveArtwork(key: TemplateMediaKey, value: TemplateMedia | undefined, photos: ProductPhotos | undefined, fallbackAlt?: string): TemplateMediaItem | null {
  const artwork = resolveTemplateMedia(key, value, fallbackAlt);
  if (artwork.image) return artwork;
  const product = templateMediaSlots.find(item => item.key === key)?.product;
  const photo = product ? photos?.get(product) : undefined;
  return photo ? { ...artwork, image: photo, mobileImage: photo } : null;
}
