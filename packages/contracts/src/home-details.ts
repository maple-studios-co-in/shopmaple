import { z } from "zod";
import { catalogueHandleSchema } from "./catalogue-cards";
import { contentImageSchema, contentLinkSchema } from "./content";
import { contentFilmSchema } from "./template-films";
import { bannerFonts } from "./banner-look";

const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);

// Deferred because the content module also contains the document schema that includes this one.
const image = z.lazy(() => contentImageSchema);
const link = z.lazy(() => contentLinkSchema);

/**
 * Where a hero slide's words sit on its picture (owner, 19 Nov 2026: "what and how to put the caption text"): a row (top,
 * middle, bottom) and a column (left, centre, right), so "left" is the middle of the left side, as the theme's own slides
 * have it, and "bottom" the middle of the bottom.
 */
export const heroCaptionPositions = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
/**
 * How a slide's words read over its picture: where they sit, light words over a dark shade or dark words over a light one,
 * how strong that shade is, and how large the headline is. A slide without it looks as the theme's slides do: middle left,
 * light words, the strong shade, the medium headline.
 */
export const heroCaptionSchema = z.object({
  position: z.enum(heroCaptionPositions),
  tone: z.enum(["light", "dark"]),
  shade: z.enum(["none", "soft", "strong"]),
  size: z.enum(["small", "medium", "large"]),
  /** The words' type style, as every banner offers it (banner-look.ts; owner, 25 Nov 2026); absent, the theme's. */
  font: z.enum(bannerFonts).optional(),
}).strict();
/**
 * Maple's own photos a hero slide can show instead of a picture of its own: the default slides' stills (an upload on the
 * Artwork screen, else a Keeri product's photo, else the theme's), in the default slides' order.
 */
export const heroStillKeys = ["home-workshop-poster", "nimbus-slide-living", "terra-hero", "nimbus-slide-bedroom", "terra-room-1", "nimbus-slide-dining"] as const;
/** A slide's own button; `null` on a slide means no button at all. */
export const heroSlideButtonSchema = z.object({ label: text(80), href: link }).strict();

/**
 * One slide of the hero slider (owner, 19 Nov 2026: choose how many slides, an image or a video for each, and the words on
 * it and how they look).
 * - An image slide shows `src`, and on phones `mobileImage` when it has one. Without `src` it shows Maple's own photo
 *   `still`, else the one for its place in the slider (the default slides' photos, in turn), so a slide added before its
 *   picture still shows one, and a slide made from a default one keeps its photo wherever it moves.
 * - A video slide plays the film `src` from the media library, and on screens up to 749px wide its phone film
 *   (`mobileSrc`, owner 12 Nov 2026) when it has one. Its `poster` shows before the film plays and to visitors who ask for
 *   reduced motion; the admin makes one from the film when it is chosen.
 * - Every word is optional: the small label over the headline (`eyebrow`), the headline, the line under it (`intro`) and
 *   the button. A slide from before buttons had one (`button` absent) shows the hero's button to its collection page;
 *   `null` shows none. `alt` describes the picture; without it the picture counts as decoration beside the slide's words.
 */
export const heroSlideSchema = z.object({
  kind: z.enum(["image", "video"]),
  src: image.optional(),
  mobileSrc: contentFilmSchema.optional(),
  mobileImage: image.optional(),
  still: z.enum(heroStillKeys).optional(),
  poster: image.optional(),
  alt: text(200).optional(),
  eyebrow: text(60).optional(),
  headline: text(120).optional(),
  intro: text(300).optional(),
  button: heroSlideButtonSchema.nullable().optional(),
  caption: heroCaptionSchema.optional(),
}).strict().refine(slide => slide.kind !== "video" || slide.src !== undefined, { path: ["src"], message: "A video slide needs a film" })
  .refine(slide => slide.kind === "video" || slide.mobileSrc === undefined, { path: ["mobileSrc"], message: "Only a video slide has a phone film" })
  .refine(slide => slide.kind === "image" || slide.mobileImage === undefined, { path: ["mobileImage"], message: "Only an image slide has a phone picture" })
  .refine(slide => slide.kind === "image" || slide.still === undefined, { path: ["still"], message: "Only an image slide shows one of Maple's photos" });
/** The most slides the hero slider takes (owner, 19 Nov 2026: up to eight). */
export const heroSlideLimit = 8;

/** An extra Nimbus-style collection slide after the base card, which the fields beside `slides` still drive. */
export const nimbusSlideSchema = z.object({
  heading: text(160), tagline: text(300), features: z.array(text(160)).length(4), cta: text(80),
  href: link, image, mobileImage: image.optional(), alt: text(200),
}).strict();
const side = z.object({ handle: catalogueHandleSchema, label: text(80) }).strict();

/** Copy for the fixed homepage template; links, media and commerce stay outside this contract. */
export const homeDetailsSchema = z.object({
  hero: z.object({
    /** The big words over the default photos, editable from the live preview (owner, 16 Nov 2026). Absent keeps the theme's own. */
    headline: text(120).optional(),
    intro: text(300).optional(),
    cta: text(80),
    tiles: z.array(z.object({
      key: z.enum(["sofas", "chairs", "tables", "beds"]),
      label: text(80),
      priceLabel: text(80),
    }).strict()).length(4),
    slides: z.array(heroSlideSchema).min(1).max(heroSlideLimit).optional(),
  }).strict(),
  difference: z.object({
    eyebrow: text(160), heading: text(160), cta: text(80), promises: z.array(text(160)).length(4),
  }).strict(),
  nimbus: z.object({
    heading: text(160), tagline: text(300), features: z.array(text(160)).length(4), cta: text(80),
    slides: z.array(nimbusSlideSchema).max(5).optional(),
  }).strict(),
  testimonial: z.object({
    title: text(160), paragraphs: z.array(text(2000)).min(1).max(6), name: text(120), attribution: text(160),
  }).strict(),
  newsletter: z.object({
    heading: text(160), body: text(2000), signupHeading: text(160),
  }).strict(),
  values: z.array(z.object({
    key: z.enum(["quiet-luxury", "real-living", "ages-beautifully", "strength"]),
    title: text(160), body: text(2000),
  }).strict()).length(4),
  // The promise under the figure was added after the first published documents: absent there, and the storefront then uses its default.
  cities: z.object({ eyebrow: text(160), heading: text(160), description: text(300).optional() }).strict(),
  project: z.object({
    heading: text(160), introBefore: text(1000), responseTime: text(80), introAfter: text(1000), body: text(2000),
  }).strict(),
  // Added after the first published documents: absent there, and the storefront then uses its defaults.
  editorial: z.object({
    title: text(120), text: text(300), cta: text(80), href: link,
    leftImage: image, leftAlt: text(200), rightImage: image, rightAlt: text(200),
  }).strict().optional(),
  compare: z.object({ eyebrow: text(160), heading: text(160), lede: text(300), left: side, right: side }).strict().optional(),
}).strict().superRefine((details, ctx) => {
  for (const [items, path] of [[details.hero.tiles, ["hero", "tiles"]], [details.values, ["values"]]] as const)
    if (new Set(items.map(item => item.key)).size !== items.length)
      ctx.addIssue({ code: "custom", path: [...path], message: "Homepage identities must be unique" });
});
export type HomeDetails = z.infer<typeof homeDetailsSchema>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type HeroCaption = z.infer<typeof heroCaptionSchema>;
export type HeroCaptionPosition = (typeof heroCaptionPositions)[number];
