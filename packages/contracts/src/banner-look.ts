import { z } from "zod";

/**
 * The type styles a banner's words can take (owner, 25 Nov 2026: "add an option to change the font style of the text").
 * They are built from the store's own two typefaces (DM Sans and Red Hat Display) and a classic serif every device already
 * has, so a banner never waits for another font file. Each says how the headline is set; the smaller lines follow its face.
 */
export const bannerFonts = ["modern", "modern-light", "modern-bold", "display", "serif", "serif-italic", "capitals"] as const;
export type BannerFont = (typeof bannerFonts)[number];
/** Each type style's name in the admin, written in its own style there. */
export const bannerFontNames: Record<BannerFont, string> = {
  modern: "Modern", "modern-light": "Modern light", "modern-bold": "Modern bold", display: "Rounded",
  serif: "Classic serif", "serif-italic": "Serif italic", capitals: "Capitals",
};
/** The shade behind a banner's words: none, a soft one, or the theme's strong brand shade. */
export const bannerShades = ["none", "soft", "strong"] as const;
/** Light words over a dark shade, or dark words over a light one. */
export const bannerTones = ["light", "dark"] as const;
export const bannerSizes = ["small", "medium", "large"] as const;

/**
 * How a campaign banner shows over its picture (owner, 25 Nov 2026: "gradient, texts, cta all should be completely editable
 * if the person wants can keep it else remove it"): whether its words and its button are drawn at all, the shade behind the
 * words, light or dark words, the headline's size and the type style. A picture that already has its own words and button
 * goes without them; the banner then links to the campaign's destination as a whole. Without a look of its own a banner
 * looks as the theme's banners do (`defaultBannerLook`).
 */
export const bannerLookSchema = z.object({
  words: z.boolean(),
  button: z.boolean(),
  shade: z.enum(bannerShades),
  tone: z.enum(bannerTones),
  size: z.enum(bannerSizes),
  font: z.enum(bannerFonts),
}).strict();
export type BannerLook = z.infer<typeof bannerLookSchema>;
export const defaultBannerLook: BannerLook = { words: true, button: true, shade: "strong", tone: "light", size: "medium", font: "modern" };
/** A banner's look: its own, or the theme's where it has none. */
export const bannerLookOf = (look?: Partial<BannerLook> | null): BannerLook => ({ ...defaultBannerLook, ...(look ?? {}) });

/**
 * How a collection page's name and line read over a photo staff chose for its banner. The words are the page's own heading,
 * so they always show; to show a finished banner without them, staff choose "the whole banner" on the Artwork screen.
 */
export const collectionBannerLookSchema = z.object({
  shade: z.enum(bannerShades),
  tone: z.enum(bannerTones),
  size: z.enum(bannerSizes),
  font: z.enum(bannerFonts),
}).strict();
export type CollectionBannerLook = z.infer<typeof collectionBannerLookSchema>;
export const defaultCollectionBannerLook: CollectionBannerLook = { shade: "strong", tone: "light", size: "medium", font: "modern" };
