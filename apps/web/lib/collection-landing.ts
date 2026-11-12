import type { CollectionSectionKey } from "@shopmaple/contracts";

/**
 * The collection landing template (Figma 311:548 "Maple / Nimbus Collection / Desktop" and 311:921 "Maple / Terra
 * Collection / Desktop"; owner, 10 Nov 2026), resolved and ready to draw: every word, link, photo and icon a page shows.
 * `components/collection-landing.tsx` renders it between the site's own header and footer; each page builds one from its
 * staff copy (`CollectionLandingContent` in the contracts), its template-media photos and its fixed links.
 *
 * Words are plain text. A line break ("\n") in a heading is kept where the design breaks the line by hand; eyebrows,
 * room labels and tags are written in sentence case and drawn in capitals. Links are store paths ("/collections/nimbus",
 * "/products/aurevon-sectional-sofa", "/contact?product=…") or an in-page anchor ("#terra-lobby").
 */
export type CollectionLanding = {
  /** The collection's slug ("nimbus", "terra"): the page's `data-collection` hook and the prefix of its anchors. */
  key: string;
  /** The page title ("The Nimbus Collection"): the document title, and the page's heading when the hero is hidden. */
  title: string;
  /** The regions shown, in order; hidden ones are left out. `rooms` draws only when `rooms` below is present. */
  sections: CollectionSectionKey[];

  /** The campaign photo with the opening words over it (760 tall at 1440). Its heading is the page's h1. */
  hero: {
    eyebrow: string;
    heading: string;
    body: string;
    /** The light button ("Discover Nimbus"). */
    cta: CollectionLink;
    media: CollectionMedia;
    /** "Watch collection film / 00:08": opens the film staff chose (Artwork → Nimbus / Terra) over the page; absent without one. */
    film?: CollectionFilm;
    /** The page's own clip, looping muted over the photo (Terra's lobby); absent without one, and the photo stands alone. */
    clip?: CollectionClip;
  };
  /** "01 Living / 02 Dining / 03 Bedroom": numbered from 01 in order. Each goes to a collection or a room below. */
  roomNav: CollectionLink[];
  /** The point of view: eyebrow and heading on the left, the collection's story line on the right. */
  philosophy: CollectionCopy;
  /** The origin photo and its narrative. */
  origin: CollectionCopy & { media: CollectionMedia };
  /** Terra's three settings, the photo alternating sides, numbered "01 / The lobby". Nimbus has none. */
  rooms?: {
    eyebrow: string;
    heading: string;
    items: CollectionRoom[];
  };
  /** "How it feels": three cards, each an illustration, a title and a line. */
  feeling: {
    eyebrow: string;
    heading: string;
    items: { art: CollectionArt; title: string; body: string }[];
  };
  /** The detail photo, the material story, three illustrated notes and a maple button. */
  material: CollectionCopy & {
    media: CollectionMedia;
    notes: { art: CollectionArt; label: string }[];
    cta: CollectionLink;
  };
  /** "Explore by collection": four editorial cards in two rows, wide then narrow, then narrow then wide. */
  browse: {
    eyebrow: string;
    heading: string;
    /** The line under each card's title ("Discover the collection"). */
    linkLabel: string;
    items: { icon: CollectionIcon; title: string; href: string; media: CollectionMedia }[];
  };
  /** The edit: real catalogue products (Nimbus) or furniture concepts to discuss (Terra), four to a row. */
  pieces: CollectionPieces;
  /** The maple band: an invitation, a light button, a note and the store's email. */
  consultation: CollectionCopy & {
    cta: CollectionLink;
    /** "Custom sizes · Fabrics · Finishes". */
    note: string;
    /** The store's customer email (footer settings), drawn as a mailto link. */
    email: string;
  };
  /** The Maple promise strip: three illustrated labels. */
  promise: { art: CollectionArt; label: string }[];
};

/** An eyebrow, a heading and a line of copy. */
export type CollectionCopy = { eyebrow: string; heading: string; body: string };

/** A link with its visible words; the template adds the arrow. */
export type CollectionLink = { label: string; href: string };

/**
 * A photo from a template-media slot. Every photo fills its frame (object-fit: cover), never letterboxed or set on a
 * blurred copy of itself; the frame's shape comes from the design.
 */
export type CollectionMedia = {
  /** A local `/media/...` file: one bundled with the store or an image from the media library. */
  src: string;
  /** A narrower crop for phones (up to 749px wide), when the slot has one. */
  mobileSrc?: string;
  /** From the content; an empty string marks a decorative photo. */
  alt: string;
  /** CSS object-position for the crop ("50% 40%"); centred when omitted. */
  focus?: string;
};

/** The collection film, played over the page with the browser's own controls. */
export type CollectionFilm = {
  /** "Watch collection film". */
  label: string;
  /** The running time as shown ("00:08"), when the film's file states it. */
  duration?: string;
  /** The dialog's accessible name ("The Nimbus collection film"). */
  title: string;
  /** The film from the media library (`/media/uploads/<sha>.mp4` or `.webm`). */
  src: string;
  /** A portrait cut for phones (up to 749px wide). */
  mobileSrc?: string;
  /** The still shown before the film plays: the page's opening photo. */
  poster: string;
};

/**
 * The opening's clip (owner, 12 Nov 2026): a short, silent, single shot that loops muted over the opening photo, which
 * stays beneath it as the still. It is not the collection film: that one may carry the logo and titles, and opens over
 * the page from its link. Bundled with the page (`/media/<page>-collection/opening.mp4`, public/media/PROVENANCE.md).
 */
export type CollectionClip = {
  /** The landscape clip, for screens wider than a phone. */
  src: string;
  /** A 9:16 cut for phones (up to 749px wide), as the opening photo has its phone crop. */
  mobileSrc?: string;
};

/** One of Terra's settings: photo, number and label, heading, line, tags and an enquiry button. */
export type CollectionRoom = {
  /** The anchor the room navigation can point at ("terra-lobby"). */
  id: string;
  /** "The lobby", shown as "01 / THE LOBBY". */
  label: string;
  heading: string;
  body: string;
  /** "Curved seating", "Walnut", "Travertine": shown in capitals, set apart by slashes. */
  tags: string[];
  /** "Enquire about this setting", usually to the contact form with the setting as its subject. */
  cta: CollectionLink;
  media: CollectionMedia;
};

/**
 * The edit, in one of two modes:
 * - `products` (Nimbus): real catalogue pieces, each card the product's own name, photo and `/products/<handle>` page,
 *   on white, with a maple button to the whole collection (`cta`).
 * - `concepts` (Terra): pieces made to a brief, each card leading to an enquiry about it, on sand, with a lead line.
 */
export type CollectionPieces = {
  mode: "products" | "concepts";
  eyebrow: string;
  heading: string;
  /** The line under the heading ("Terra-inspired furniture concepts. Made to your brief."). */
  lead?: string;
  /** Each card's link words ("View piece", "Discuss this piece"). */
  linkLabel: string;
  items: CollectionPiece[];
  /** The button after the cards ("View the Nimbus collection"). */
  cta?: CollectionLink;
};

/** A card in the edit: square photo, name, "Living / Sectional seating", link. */
export type CollectionPiece = {
  /** The product's name from the catalogue, or the concept's. */
  title: string;
  /** Where it sits ("Living / Sectional seating"). */
  line: string;
  href: string;
  media: CollectionMedia;
};

/** The collection cards' line icons (Lucide shapes drawn at 1.3px, as the design's "Icon / sofa" layers are). */
export type CollectionIcon = "armchair" | "bed-double" | "sofa" | "table-2" | "tree-pine";

/**
 * One of the design's duotone illustrations ("Maple / Editorial duotone", Figma 311:548 and 311:921; owner, 12 Nov 2026):
 * a maple-and-sand SVG bundled under public/media/collection-icons, decorative beside the words it illustrates.
 */
export type CollectionArt = `/media/collection-icons/${string}.svg`;
/** The promise strip's three illustrations, the same on every collection page. */
export const promiseArt: readonly CollectionArt[] = [
  "/media/collection-icons/promise-bespoke.svg", "/media/collection-icons/promise-craft.svg", "/media/collection-icons/promise-delivery.svg",
];

/**
 * A saved card whose words are still an earlier design's follows the design's current words; a word staff changed stays.
 * Field by field, so a card whose title staff rewrote still takes the new line under it.
 */
export function followDesign<T extends Record<string, string>>(item: T | undefined, was: T, now: T) {
  if (!item) return;
  for (const key of Object.keys(was) as (keyof T)[]) if (item[key] === was[key]) item[key] = now[key];
}
