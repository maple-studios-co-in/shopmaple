import { collectionSectionKeys, type CollectionLandingContent, type StorefrontContent, type TemplateMediaKey } from "@shopmaple/contracts";
import { followDesign, promiseArt, type CollectionArt, type CollectionIcon, type CollectionLanding, type CollectionMedia } from "@/lib/collection-landing";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { collectionFilm, withFilm } from "@/lib/template-films";

/**
 * The Terra Collection's words, from the owner's frame (Figma 311:921 "Maple / Terra Collection / Desktop", 10 Nov 2026).
 * Eyebrows, room labels and tags are written in sentence case; the template draws them in capitals. A line break is
 * kept where the design breaks a line by hand. Items match their photo, icon and link by position.
 */
export const defaultTerraPage: CollectionLandingContent = {
  title: "The Terra Collection",
  sections: collectionSectionKeys.map(key => ({ key, enabled: true })),
  hero: {
    eyebrow: "Maple collections / Terra",
    heading: "Grounded in earth.\nMade for belonging.",
    body: "Warm materials. Sculptural forms.\nSpaces that bring you closer to nature.",
    cta: "Explore Terra",
  },
  roomNav: [{ label: "The lobby" }, { label: "The bedroom" }, { label: "The terrace" }],
  philosophy: {
    eyebrow: "The Terra point of view",
    heading: "A world shaped\nby earth.",
    body: "Timber, stone and tactile textures. A warmer connection to nature.",
  },
  origin: {
    eyebrow: "Origin / Terra",
    heading: "From the earth,\ninto everyday life.",
    body: "Inspired by earth, timber and sun-warmed stone. Made for spaces that feel rooted.",
  },
  rooms: {
    eyebrow: "Explore the collection",
    heading: "Three spaces. One grounded spirit.",
    items: [
      { label: "The lobby", heading: "An arrival worth remembering.", body: "Curved seating. Warm walnut. A generous welcome.", tags: "Curved seating / Walnut / Travertine", cta: "Enquire about this setting" },
      { label: "The bedroom", heading: "Rest, close to the earth.", body: "Low leather forms. Soft linen. Restful warmth.", tags: "Leather bed / Linen / Sculpted timber", cta: "Enquire about this setting" },
      { label: "The terrace", heading: "Made for long afternoons.", body: "Woven textures. Olive tones. Open-air living.", tags: "Woven frames / Olive tones / Open air", cta: "Enquire about this setting" },
    ],
  },
  feeling: {
    eyebrow: "How it feels",
    heading: "Grounded. Warm. Connected.",
    items: [
      { title: "Grounded", body: "Calm, generous forms." },
      { title: "Tactile", body: "Texture you can feel." },
      { title: "Open-air living", body: "Woven seating for outdoor spaces." },
    ],
  },
  material: {
    eyebrow: "The details you live with",
    heading: "Honest texture.\nLasting character.",
    body: "Natural materials, chosen around you.",
    notes: [{ label: "Natural timber" }, { label: "Tactile weave" }, { label: "Warm stone" }],
    cta: "Explore customization",
  },
  browse: {
    eyebrow: "Find your piece",
    heading: "Explore by collection.",
    link: "Discover the collection",
    items: [{ title: "Lounge seating" }, { title: "Bedroom" }, { title: "Tables" }, { title: "Outdoor" }],
  },
  pieces: {
    eyebrow: "The Terra edit",
    heading: "Bring the room together.",
    lead: "Terra-inspired furniture concepts. Made to your brief.",
    link: "Discuss this piece",
    items: [
      { title: "Curved lounge sofa", line: "Lobby / Upholstered seating" },
      { title: "Timber-ring lounge chair", line: "Lobby / Accent seating" },
      { title: "Low leather bed", line: "Bedroom / Bed concept" },
      { title: "Woven terrace chair", line: "Outdoor / Lounge seating" },
    ],
  },
  consultation: {
    eyebrow: "Make it unmistakably yours",
    heading: "Bring the feeling\nof Terra to your space.",
    body: "Tell us about your room, your preferred materials and the way you want it to feel.",
    cta: "Start a conversation",
    note: "Custom sizes · Fabrics · Finishes",
  },
  promise: [{ label: "Made around you" }, { label: "Crafted in Delhi" }, { label: "Delivery across India" }],
};

/** The page's own address, for its metadata, the sitemap and the home page's Terra slide. */
export const terraPath = "/terra-collection";

/** The room anchors, in page order: the room navigation jumps to them. */
const roomIds = ["terra-lobby", "terra-bedroom", "terra-terrace"] as const;
/**
 * The collection cards' destinations, checked against the store's own menu (data/navigation.json): the Sofas page, all
 * beds, the Tables page and the outdoor collection.
 */
const browse: readonly { icon: CollectionIcon; href: string }[] = [
  { icon: "armchair", href: "/sofas" },
  { icon: "bed-double", href: "/collections/beds" },
  { icon: "table-2", href: "/tables" },
  { icon: "tree-pine", href: "/collections/outdoor-furnitures" },
];
/** The design's duotone illustrations (Figma 311:921, 12 Nov 2026): a grounded sofa, a woven throw, a terrace chair by a plant; timber, weave and stone. */
const feelingArt: readonly CollectionArt[] = ["/media/collection-icons/terra-grounded.svg", "/media/collection-icons/terra-tactile.svg", "/media/collection-icons/terra-nature.svg"];
const noteArt: readonly CollectionArt[] = ["/media/collection-icons/terra-timber.svg", "/media/collection-icons/terra-weave.svg", "/media/collection-icons/terra-stone.svg"];
/** The four concepts have a photo each; the template's edit allows more cards than Terra has photos for. */
const pieceKeys = ["terra-piece-1", "terra-piece-2", "terra-piece-3", "terra-piece-4"] as const satisfies readonly TemplateMediaKey[];
const roomKeys = ["terra-room-1", "terra-room-2", "terra-room-3"] as const satisfies readonly TemplateMediaKey[];
const browseKeys = ["terra-browse-1", "terra-browse-2", "terra-browse-3", "terra-browse-4"] as const satisfies readonly TemplateMediaKey[];

/**
 * The contact form with a subject, as the store's other enquiry links write it ("Your enquiry is about …"), opened at the
 * form as Nimbus's are. The subject is staff copy, bounded well inside the 500 characters the contact page keeps.
 */
export function terraEnquiryHref(subject: string): string {
  return `/contact?${new URLSearchParams({ product: subject.replace(/\s+/g, " ").trim().slice(0, 200) })}#contact-enquiry`;
}
/** "Curved seating / Walnut / Travertine" → its three tags. */
const splitTags = (tags: string) => tags.split("/").map(tag => tag.trim()).filter(Boolean);

/** Terra's saved words, or the frame's for revisions saved before the page existed. */
export function resolveTerraPageContent(value?: CollectionLandingContent): CollectionLandingContent {
  const page = structuredClone(value ?? defaultTerraPage);
  // The third feeling card was "Connected" until the design changed on 12 Nov 2026.
  followDesign(page.feeling.items[2], { title: "Connected", body: "Closer to the outdoors." }, defaultTerraPage.feeling.items[2]!);
  return page;
}

/**
 * The Terra page, ready for the collection template: staff words, the Terra artwork slots (Admin → Artwork → Terra), the
 * store's customer email from the footer settings, and the fixed links and icons.
 */
export function resolveTerraLanding(site: Pick<StorefrontContent, "terraPage" | "templateMedia" | "templateFilms" | "siteChrome">): CollectionLanding {
  const page = resolveTerraPageContent(site.terraPage);
  const media = (key: TemplateMediaKey): CollectionMedia => {
    const { image, mobileImage, alt } = resolveTemplateMedia(key, site.templateMedia);
    return { src: image, ...(mobileImage ? { mobileSrc: mobileImage } : {}), alt };
  };
  const about = (thing: string) => terraEnquiryHref(`${page.title}: ${thing}`);
  const rooms = page.rooms ?? defaultTerraPage.rooms!;
  // The film is the one staff chose under Artwork → Terra; without one the opening has no film link.
  const { film: filmLabel, ...hero } = page.hero, opening = media("terra-hero");
  return {
    key: "terra",
    title: page.title,
    sections: page.sections.filter(section => section.enabled).map(section => section.key),
    // "Explore Terra" glides to the three settings (the template's rooms region carries "terra-rooms").
    hero: {
      ...hero, cta: { label: hero.cta, href: "#terra-rooms" }, media: opening,
      ...withFilm(collectionFilm("terra-hero", site.templateFilms, { label: filmLabel ?? "Watch collection film", title: `${page.title} film`, poster: opening.src })),
    },
    roomNav: page.roomNav.map((item, index) => ({ label: item.label, href: `#${roomIds[index]}` })),
    philosophy: { ...page.philosophy },
    origin: { ...page.origin, media: media("terra-origin") },
    rooms: {
      eyebrow: rooms.eyebrow,
      heading: rooms.heading,
      items: rooms.items.map((room, index) => ({
        id: roomIds[index]!,
        label: room.label,
        heading: room.heading,
        body: room.body,
        tags: splitTags(room.tags),
        cta: { label: room.cta, href: about(room.label) },
        media: media(roomKeys[index]!),
      })),
    },
    feeling: { ...page.feeling, items: page.feeling.items.map((item, index) => ({ ...item, art: feelingArt[index]! })) },
    material: {
      ...page.material,
      media: media("terra-detail"),
      notes: page.material.notes.map((note, index) => ({ art: noteArt[index]!, label: note.label })),
      // A customization enquiry, as Nimbus's same button asks about "Nimbus customization".
      cta: { label: page.material.cta, href: terraEnquiryHref("Terra customization") },
    },
    browse: {
      eyebrow: page.browse.eyebrow,
      heading: page.browse.heading,
      linkLabel: page.browse.link,
      items: page.browse.items.map((item, index) => ({ ...browse[index]!, title: item.title, media: media(browseKeys[index]!) })),
    },
    pieces: {
      mode: "concepts",
      eyebrow: page.pieces.eyebrow,
      heading: page.pieces.heading,
      ...(page.pieces.lead ? { lead: page.pieces.lead } : {}),
      linkLabel: page.pieces.link,
      items: page.pieces.items.slice(0, pieceKeys.length).map((item, index) => {
        const title = item.title ?? defaultTerraPage.pieces.items[index]!.title!;
        return { title, line: item.line, href: about(title), media: media(pieceKeys[index]!) };
      }),
    },
    consultation: {
      ...page.consultation,
      cta: { label: page.consultation.cta, href: terraEnquiryHref(page.title) },
      email: resolveSiteChrome(site.siteChrome).footer.customerEmail,
    },
    promise: page.promise.map((item, index) => ({ art: promiseArt[index]!, label: item.label })),
  };
}
