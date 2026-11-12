import {
  collectionSectionKeys, type CollectionLandingContent, type CollectionSectionKey, type LegacyNimbusPageContent,
  type NimbusPageContent, type StorefrontContent, type TemplateMediaKey,
} from "@shopmaple/contracts";
import nimbus from "@/data/landing-nimbus.json";
import { followDesign, promiseArt, type CollectionArt, type CollectionIcon, type CollectionLanding, type CollectionMedia } from "@/lib/collection-landing";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { collectionFilm, withFilm } from "@/lib/template-films";

const section = (key: string) => nimbus.sections.find(item => item.key === key)!;
const intro = section("section_E3gzag");
const origin = section("media_with_content_JLVGCA");
const principles = section("section_aGJjhK");
const series = section("section_BBYid8");
const project = section("section_PYMfcR");
const promises = section("section_hrKc6w");

/** The original template's copy, as the live store published it before the redesign (10 Nov 2026). */
export const legacyNimbusPage: LegacyNimbusPageContent = {
  title: "The Nimbus Collection",
  sections: (["hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises"] as const).map(key => ({ key, enabled: true })),
  intro: { heading: intro.texts[0]!, body: intro.texts[1]! },
  roomTiles: [
    { key: "bedroom", title: "Bedroom" },
    { key: "living", title: "Living Room" },
    { key: "dining", title: "Dining Room" },
  ],
  origin: { eyebrow: origin.texts[0]!, heading: origin.texts[1]!, body: origin.texts[2]!.replace("cloud.Nimbus", "cloud.\n\nNimbus") },
  principles: {
    heading: "THE NIMBUS PRINCIPLES",
    items: (["comfort", "silhouettes", "luxury", "spaces"] as const).map((key, index) => ({
      key, title: principles.texts[index * 2]!, body: principles.texts[index * 2 + 1]!,
    })),
  },
  roomSlides: [
    { key: "living", label: "Living room" },
    { key: "bedroom", label: "Bedroom" },
    { key: "dining", label: "Dining room" },
  ],
  series: { eyebrow: series.texts[0]!, heading: series.texts[1]! },
  project: { heading: project.texts[0]!, body: project.texts[1]! },
  promises: (["custom", "delivery", "craft", "warranty"] as const).map((key, index) => ({ key, title: promises.texts[index]! })),
};

/** Nimbus's regions, in the design's order: the collection template's without Terra's rooms. */
const nimbusSections: readonly CollectionSectionKey[] = collectionSectionKeys.filter(key => key !== "rooms");

/**
 * The owner's redesign (Figma 311:548 "Maple / Nimbus Collection / Desktop"; 10 Nov 2026), drawn by the collection
 * template. Eyebrows and room labels are written in sentence case and drawn in capitals; a line break in a heading is
 * the design's own. The eight lines under the edit's cards follow `nimbusPieceHandles`.
 */
export const defaultNimbusPage: CollectionLandingContent = {
  title: "The Nimbus Collection",
  sections: nimbusSections.map(key => ({ key, enabled: true })),
  hero: {
    eyebrow: "Maple collections / Nimbus",
    heading: "A softer way\nto come home.",
    body: "Cloud-like comfort, softly sculpted\nfor the spaces you call your own.",
    cta: "Discover Nimbus",
    film: "Watch collection film",
  },
  roomNav: [{ label: "Living" }, { label: "Dining" }, { label: "Bedroom" }],
  philosophy: {
    eyebrow: "The Nimbus point of view",
    heading: "Comfort is\nthe starting point.",
    body: "Soft forms. Pale textures. Comfort that feels like coming home.",
  },
  origin: {
    eyebrow: "Origin / Nimbus",
    heading: "It began with\nthe feeling of a cloud.",
    body: "Inspired by clouds. Shaped for comfort. Made to let your home breathe.",
  },
  feeling: {
    eyebrow: "How it feels",
    heading: "Soft. Airy. Weightless.",
    items: [
      { title: "Cloud-like comfort", body: "Sink in. Stay awhile." },
      { title: "Room to breathe", body: "Light, open, effortless." },
      { title: "Sculpted silhouettes", body: "Soft curves. Considered proportions." },
    ],
  },
  material: {
    eyebrow: "The details you live with",
    heading: "Softness,\nin every detail.",
    body: "Choose your fabric, finish and fit.",
    notes: [{ label: "Inviting upholstery" }, { label: "Soft silhouettes" }, { label: "Airy neutrals" }],
    cta: "Explore customization",
  },
  browse: {
    eyebrow: "Find your piece",
    heading: "Explore by collection.",
    link: "Discover the collection",
    items: [{ title: "Sofas & sectionals" }, { title: "Accent chairs" }, { title: "Tables & consoles" }, { title: "Beds & benches" }],
  },
  pieces: {
    eyebrow: "The Nimbus edit",
    heading: "Pieces to build your world around.",
    link: "View piece",
    cta: "View the Nimbus collection",
    items: [
      "Living / Sectional seating", "Living / Accent seating", "Living / Centre tables", "Bedroom / Beds",
      "Living / Lounge chairs", "Storage / Consoles", "Bedroom / Benches", "Bedroom / Upholstered beds",
    ].map(line => ({ line })),
  },
  consultation: {
    eyebrow: "Make it unmistakably yours",
    heading: "Your home.\nYour kind of Nimbus.",
    body: "Tell us about your room, your preferred materials and the way you want it to feel.",
    cta: "Start a conversation",
    note: "Custom sizes · Fabrics · Finishes",
  },
  promise: [{ label: "Made around you" }, { label: "Crafted in Delhi" }, { label: "Delivery across India" }],
};

type LegacyKey = LegacyNimbusPageContent["sections"][number]["key"];
/** Where each of the original template's regions went in the redesign; its room slideshow has no successor. */
const successors: Partial<Record<LegacyKey, CollectionSectionKey>> = {
  hero: "hero", "rooms-grid": "room-nav", intro: "philosophy", origin: "origin", principles: "feeling",
  series: "pieces", project: "consultation", promises: "promise",
};
const isLegacy = (value: NimbusPageContent): value is LegacyNimbusPageContent => "intro" in value;

/**
 * An older revision of the original template, in the redesign's terms. Words it still holds exactly as the original
 * template had them (the live store published them unchanged) read as the redesign's; words staff wrote stay, in the
 * region that took their region's place. A region staff hid stays hidden; the redesign's order applies.
 */
function fromLegacy(old: LegacyNimbusPageContent): CollectionLandingContent {
  const page = structuredClone(defaultNimbusPage);
  const was = legacyNimbusPage;
  const keep = (value: string, original: string, redesign: string) => value === original ? redesign : value;
  const tile = (from: LegacyNimbusPageContent, key: "living" | "dining" | "bedroom") => from.roomTiles.find(item => item.key === key)!.title;
  const principle = (from: LegacyNimbusPageContent, key: "comfort" | "silhouettes" | "luxury" | "spaces") => from.principles.items.find(item => item.key === key)!;
  const promise = (from: LegacyNimbusPageContent, key: "custom" | "delivery" | "craft") => from.promises.find(item => item.key === key)!.title;
  page.title = old.title;
  page.sections = page.sections.map(item => {
    const before = old.sections.find(entry => successors[entry.key] === item.key);
    return before ? { key: item.key, enabled: before.enabled } : item;
  });
  page.roomNav = (["living", "dining", "bedroom"] as const).map((key, index) => ({ label: keep(tile(old, key), tile(was, key), page.roomNav[index]!.label) }));
  page.philosophy.heading = keep(old.intro.heading, was.intro.heading, page.philosophy.heading);
  page.philosophy.body = keep(old.intro.body, was.intro.body, page.philosophy.body);
  for (const field of ["eyebrow", "heading", "body"] as const) page.origin[field] = keep(old.origin[field], was.origin[field], page.origin[field]);
  page.feeling.heading = keep(old.principles.heading, was.principles.heading, page.feeling.heading);
  // Cloud comfort, room to breathe and quiet luxury took the comfort, spaces and luxury principles' places; the soft
  // silhouettes principle became a material note.
  page.feeling.items = (["comfort", "spaces", "luxury"] as const).map((key, index) => ({
    title: keep(principle(old, key).title, principle(was, key).title, page.feeling.items[index]!.title),
    body: keep(principle(old, key).body, principle(was, key).body, page.feeling.items[index]!.body),
  }));
  page.material.notes[1] = { label: keep(principle(old, "silhouettes").title, principle(was, "silhouettes").title, page.material.notes[1]!.label) };
  page.pieces.eyebrow = keep(old.series.eyebrow, was.series.eyebrow, page.pieces.eyebrow);
  page.pieces.heading = keep(old.series.heading, was.series.heading, page.pieces.heading);
  page.consultation.heading = keep(old.project.heading, was.project.heading, page.consultation.heading);
  page.consultation.body = keep(old.project.body, was.project.body, page.consultation.body);
  // The redesign keeps three promises: made around you, crafted in Delhi, delivery across India.
  page.promise = (["custom", "craft", "delivery"] as const).map((key, index) => ({ label: keep(promise(old, key), promise(was, key), page.promise[index]!.label) }));
  return page;
}

/**
 * The Nimbus page's words as the page and its editor use them: the redesign's, an older revision of the original
 * template read in the redesign's terms, or the design's own copy where nothing was saved. Always a fresh copy.
 */
export function resolveNimbusPageContent(value?: NimbusPageContent): CollectionLandingContent {
  if (!value) return structuredClone(defaultNimbusPage);
  if (isLegacy(value)) return fromLegacy(value);
  const page = structuredClone(value);
  // Nimbus's own regions, each once: one a list lacks joins where the design has it, shown.
  page.sections = page.sections.filter(item => nimbusSections.includes(item.key));
  nimbusSections.forEach((key, index) => {
    if (!page.sections.some(item => item.key === key)) page.sections.splice(Math.min(index, page.sections.length), 0, { key, enabled: true });
  });
  delete page.rooms;
  page.hero.film ??= defaultNimbusPage.hero.film;
  page.pieces.cta ??= defaultNimbusPage.pieces.cta;
  // The third feeling card was "Quiet luxury" until the design changed on 12 Nov 2026.
  followDesign(page.feeling.items[2], { title: "Quiet luxury", body: "Refined in every detail." }, defaultNimbusPage.feeling.items[2]!);
  page.pieces.items = defaultNimbusPage.pieces.items.map((item, index) => ({ line: page.pieces.items[index]?.line ?? item.line }));
  return page;
}

/** The edit's eight real pieces, in the design's order. The table's catalogue name is "Avelon Marble Nesting Center Table". */
// Keeri products (owner, 11 Nov 2026: the store lists Keeri's catalogue only): the Keeri pieces that replaced the design's
// Shopify listings, in the design's order (data/retired-products.json, `replacements`).
export const nimbusPieceHandles = [
  "cloudblock", "virelle-chair", "avelon-table", "aileron",
  "nova-chair", "meridian-console", "aileron-bench", "elara-bed",
] as const;
/** A piece as the catalogue has it: its own name, photo and page. */
export type NimbusPiece = { title: string; image: string; href: string };

/** The rooms' own Nimbus collections (data/navigation.json, the source collections). */
const roomLinks = ["/collections/living-room-nimbus", "/collections/dining-room-nimbus", "/collections/bedroom-nimbus"];
/**
 * The collection cards: the store's sofas, accent chairs, tables and beds. Their photos keep the original template's
 * room-tile slots, whose role they took (Admin → Artwork → Nimbus).
 */
const browse: readonly { icon: CollectionIcon; href: string; media: TemplateMediaKey }[] = [
  { icon: "sofa", href: "/collections/sofas", media: "nimbus-room-living" },
  { icon: "armchair", href: "/collections/accent-chair", media: "nimbus-room-collection" },
  { icon: "table-2", href: "/collections/tables", media: "nimbus-room-dining" },
  { icon: "bed-double", href: "/collections/beds", media: "nimbus-room-bedroom" },
];
/** The design's duotone illustrations (Figma 311:548, 12 Nov 2026): comfort, air and a sculpted chair; fabric, chair and swatch. */
const feelingArt: readonly CollectionArt[] = ["/media/collection-icons/nimbus-comfort.svg", "/media/collection-icons/nimbus-airy.svg", "/media/collection-icons/nimbus-quiet.svg"];
const noteArt: readonly CollectionArt[] = ["/media/collection-icons/nimbus-fabric.svg", "/media/collection-icons/nimbus-chair.svg", "/media/collection-icons/nimbus-swatch.svg"];
/** The contact form, opened at the enquiry with its subject ("Your enquiry is about …"). */
const enquiry = (subject: string) => `/contact?${new URLSearchParams({ product: subject })}#contact-enquiry`;

/**
 * The Nimbus page, ready for the collection template: the staff words, the Nimbus artwork slots, the film staff chose
 * (Artwork → Nimbus; the Shopify films left with Shopify, so without one there is no film link), the store's customer email
 * from the footer settings and the edit's pieces as the catalogue has them.
 */
export function resolveNimbusLanding(site: Pick<StorefrontContent, "nimbusPage" | "templateMedia" | "templateFilms" | "siteChrome">, pieces: readonly (NimbusPiece | null)[] = []): CollectionLanding {
  const page = resolveNimbusPageContent(site.nimbusPage);
  const media = (key: TemplateMediaKey): CollectionMedia => {
    const { image, mobileImage, alt } = resolveTemplateMedia(key, site.templateMedia);
    return { src: image, ...(mobileImage ? { mobileSrc: mobileImage } : {}), alt };
  };
  const sections = page.sections.filter(item => item.enabled).map(item => item.key);
  const hero = media("nimbus-hero-poster");
  return {
    key: "nimbus",
    title: page.title,
    sections,
    hero: {
      eyebrow: page.hero.eyebrow,
      heading: page.hero.heading,
      body: page.hero.body,
      // "Discover Nimbus" glides to the edit; with the edit hidden it opens the whole collection.
      cta: { label: page.hero.cta, href: sections.includes("pieces") ? "#nimbus-pieces" : "/collections/nimbus" },
      media: hero,
      ...withFilm(collectionFilm("nimbus-hero", site.templateFilms, { label: page.hero.film ?? defaultNimbusPage.hero.film!, title: `${page.title} film`, poster: hero.src })),
    },
    roomNav: page.roomNav.map((item, index) => ({ label: item.label, href: roomLinks[index]! })),
    philosophy: { ...page.philosophy },
    origin: { ...page.origin, media: media("nimbus-origin") },
    feeling: { ...page.feeling, items: page.feeling.items.map((item, index) => ({ ...item, art: feelingArt[index]! })) },
    material: {
      eyebrow: page.material.eyebrow,
      heading: page.material.heading,
      body: page.material.body,
      media: media("nimbus-craft-poster"),
      notes: page.material.notes.map((note, index) => ({ art: noteArt[index]!, label: note.label })),
      cta: { label: page.material.cta, href: enquiry("Nimbus customization") },
    },
    browse: {
      eyebrow: page.browse.eyebrow,
      heading: page.browse.heading,
      linkLabel: page.browse.link,
      items: page.browse.items.map((item, index) => ({ icon: browse[index]!.icon, title: item.title, href: browse[index]!.href, media: media(browse[index]!.media) })),
    },
    pieces: {
      mode: "products",
      eyebrow: page.pieces.eyebrow,
      heading: page.pieces.heading,
      linkLabel: page.pieces.link,
      // A piece the catalogue no longer lists is left out, and each card keeps the line saved for its place.
      items: pieces.flatMap((piece, index) => (piece ? [{
        title: piece.title,
        line: page.pieces.items[index]!.line,
        href: piece.href,
        media: { src: piece.image, alt: piece.title },
      }] : [])),
      cta: { label: page.pieces.cta!, href: "/collections/nimbus" },
    },
    consultation: {
      ...page.consultation,
      cta: { label: page.consultation.cta, href: enquiry(page.title) },
      email: resolveSiteChrome(site.siteChrome).footer.customerEmail,
    },
    promise: page.promise.map((item, index) => ({ art: promiseArt[index]!, label: item.label })),
  };
}
