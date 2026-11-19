import type { HeroCaption, HeroSlide, heroStillKeys } from "@shopmaple/contracts";

/*
 * The homepage hero slider's shared rules, for the storefront (components/hero.tsx) and the admin's slide editor
 * (components/admin/hero-slider-fields.tsx), so both agree on what a slide shows.
 */

export type HeroCollection = "nimbus" | "terra";
export type HeroStillKey = (typeof heroStillKeys)[number];

/**
 * The default slides' stills: the opening still, then the two collections in turn, each photo naming its collection and
 * opening its page (QA report, 16 Nov 2026: every slide spoke for Nimbus and none for Terra). Terra's photos are the
 * Terra page's own placements, so a new photo there shows here too.
 */
export const heroDefaultStills = [
  { key: "home-workshop-poster", name: "Workshop" },
  { key: "nimbus-slide-living", collection: "nimbus", name: "Nimbus living room" },
  { key: "terra-hero", collection: "terra", name: "Terra lobby" },
  { key: "nimbus-slide-bedroom", collection: "nimbus", name: "Nimbus bedroom" },
  { key: "terra-room-1", collection: "terra", name: "Terra lounge" },
  { key: "nimbus-slide-dining", collection: "nimbus", name: "Nimbus dining room" },
] as const satisfies readonly { key: HeroStillKey; collection?: HeroCollection; name: string }[];
export type HeroStill = (typeof heroDefaultStills)[number];
export const heroDefaultStillKeys: HeroStillKey[] = heroDefaultStills.map(still => still.key);

/**
 * Maple's own photo for a slide's place in the slider: the default stills in turn (the seventh slide starts again at the
 * first). An image slide without a picture of its own, and without a photo of Maple's chosen (`still`), shows it.
 */
export const heroStillFor = (index: number): HeroStill => heroDefaultStills[((index % heroDefaultStills.length) + heroDefaultStills.length) % heroDefaultStills.length]!;
export const heroStillCollection = (still: HeroStill): HeroCollection | undefined => ("collection" in still ? still.collection : undefined);
/** The still an image slide without its own picture shows: the one it names, else the one for its place. */
export const heroSlideStill = (slide: Pick<HeroSlide, "still">, index: number): HeroStill =>
  heroDefaultStills.find(still => still.key === slide.still) ?? heroStillFor(index);

/** Where a slide's button leads by default: its collection's page; the opening still and older slides keep the Nimbus page. */
export const heroCollectionPage = (collection: HeroCollection = "nimbus") => `/${collection}-collection`;

/** The theme's own look for a slide's words: middle left, light words over the strong shade, the medium headline. */
export const defaultHeroCaption: HeroCaption = { position: "left", tone: "light", shade: "strong", size: "medium" };
export const heroCaptionOf = (slide: Pick<HeroSlide, "caption">): HeroCaption => slide.caption ?? defaultHeroCaption;

/** How long a slide stays before the next one, unless the shopper hovers or focuses the tile. */
export const heroAutoplayMs = 6000;

/** The words the default slides show, as staff have them now (Homepage > Hero and Site words), to start slides from. */
export type HeroDefaultWords = { headline: string; intro: string; cta: string; labels: Record<HeroCollection, string> };

/**
 * A slide made from Maple's default slide for a place: the same photo, label, words and button, so nothing on the page
 * changes until staff change it (owner, 19 Nov 2026: choosing how many slides starts from the slides already showing).
 */
export function slideFromStill(index: number, words: HeroDefaultWords): HeroSlide {
  const still = heroStillFor(index), collection = heroStillCollection(still);
  const text = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
  const headline = text(words.headline, 120), intro = text(words.intro, 300), label = text(words.cta, 80);
  const eyebrow = collection ? text(words.labels[collection], 60) : "";
  return {
    kind: "image", still: still.key,
    ...(eyebrow ? { eyebrow } : {}), ...(headline ? { headline } : {}), ...(intro ? { intro } : {}),
    button: label ? { label, href: heroCollectionPage(collection) } : null,
  };
}

/**
 * The slides after choosing how many there are: fewer keeps the first ones; more adds slides made from Maple's default ones
 * for their places, with the look of the last slide, so a new slide matches the others; none yet starts from the defaults.
 */
export function resizeHeroSlides(slides: readonly HeroSlide[] | undefined, count: number, words: HeroDefaultWords): HeroSlide[] {
  const current = slides ?? [];
  if (count <= current.length) return current.slice(0, Math.max(1, count));
  const look = current.at(-1)?.caption;
  const added = Array.from({ length: count - current.length }, (_, k) => {
    const slide = slideFromStill(current.length + k, words);
    return look ? { ...slide, caption: { ...look } } : slide;
  });
  return [...current, ...added];
}

/** The same value with its keys in one order and without absent ones, to compare two slides by what they hold. */
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => [key, canonical(item)]))
  : value;

/** Whether a slide holds anything staff chose themselves (a picture, a film, or other words than its place's default). */
export function heroSlideIsOwn(slide: HeroSlide, index: number, words: HeroDefaultWords): boolean {
  const { caption: _look, ...rest } = slide;
  const { caption: _none, ...made } = slideFromStill(index, words);
  return JSON.stringify(canonical(rest)) !== JSON.stringify(canonical({ ...made, still: slide.still ?? made.still }));
}
