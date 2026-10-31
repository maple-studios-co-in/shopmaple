import { z } from "zod";
import { siteChromeSchema } from "./site-chrome";
import { authoredArticlesSchema, authoredBlocksSchema } from "./authored-articles";
import { editorialContentSchema } from "./editorial-content";
import { servicePagesContentSchema } from "./service-pages";
import { categoryPageContentSchema } from "./category-content";
import { campaignScheduleSchema } from "./campaign-schedule";
import { storyPageContentSchema } from "./story-content";
import { homeDetailsSchema } from "./home-details";
import { nimbusPageContentSchema } from "./nimbus-content";
export const homeSectionKeys = [
  "hero",
  "announcement",
  "difference",
  "categories",
  "ticker",
  "offers",
  "nimbus",
  "dining-banner",
  "instagram",
  "bestsellers",
  "seating-banner",
  "chairs",
  "promos",
  "testimonial",
  "newsletter",
  "values",
  "cities",
  "project",
] as const;
export const campaignKeys = [
  "landing-announcement",
  "landing-dining-table",
  "landing-sofa-accent-chair",
  "landing-dining",
  "landing-storage",
  "landing-consoles",
  "sofas-hero",
  "sofas-sale",
  "tables-hero",
  "tables-sale",
  "chairs-hero",
  "chairs-sale",
  "beds-hero",
  "beds-sale",
  "outdoors-hero",
  "tv-units-hero",
] as const;
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Control characters are not content",
    );
const cleanUrl = (value: string) =>
  !/[\s\\%\u0000-\u001f\u007f]/.test(value) &&
  !value.split(/[/?#]/).some(segment => segment === "." || segment === "..") &&
  !value.replace(/^https:\/\//i, "").split(/[?#]/)[0]!.includes("//");
export const contentLinkSchema = z
  .string()
  .max(500)
  .refine(
    (value) =>
      cleanUrl(value) &&
      /^\/(?:collections\/[a-z0-9-]+|products\/[a-z0-9-]+|pages\/[a-z0-9-]+|blogs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?|policies\/[a-z0-9-]+)?(?:#[a-z0-9-]+)?$/.test(
        value,
      ),
    "Use a canonical store link",
  );
export const contentImageSchema = z
  .string()
  .max(1000)
  .refine((value) => {
    if (!cleanUrl(value)) return false;
    if (/^\/media\/[a-zA-Z0-9_./-]+$/.test(value)) return true;
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        !u.hash &&
        ((u.hostname === "cdn.shopify.com" &&
          u.pathname.startsWith("/s/files/")) ||
          (u.hostname === "shop.maplefurnishers.com" &&
            u.pathname.startsWith("/cdn/shop/")))
      );
    } catch {
      return false;
    }
  }, "Use approved Maple media");
export const templateMediaKeys = [
  "home-workshop-poster", "home-hero-sofas", "home-hero-chairs", "home-hero-tables", "home-hero-beds",
  "home-nimbus", "home-newsletter", "home-testimonial-poster",
  "nimbus-room-bedroom", "nimbus-room-living", "nimbus-room-dining", "nimbus-room-collection",
  "nimbus-origin", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining", "nimbus-project",
  "nimbus-hero-poster", "nimbus-craft-poster", "story-hero", "story-film-poster",
  "home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4",
  "home-value-quiet-luxury", "home-value-real-living", "home-value-ages-beautifully", "home-value-strength",
  "home-city-delhi", "home-city-kolkata", "home-city-hyderabad", "home-city-varanasi", "home-city-mumbai",
  "home-city-jaipur", "home-city-bengaluru", "home-city-chennai", "home-city-gujarat",
  "home-city-artwork-1", "home-city-artwork-2", "home-city-artwork-3", "home-city-artwork-4",
  "home-city-artwork-5", "home-city-artwork-6", "home-city-artwork-7", "home-city-artwork-8", "home-city-agra",
] as const;
export const templateMediaDecorativeKeys = [
  "home-hero-sofas", "home-hero-chairs", "home-hero-tables", "home-hero-beds",
  "home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4",
  "home-value-quiet-luxury", "home-value-real-living", "home-value-ages-beautifully", "home-value-strength",
  "home-city-artwork-1", "home-city-artwork-2", "home-city-artwork-3", "home-city-artwork-4",
  "home-city-artwork-5", "home-city-artwork-6", "home-city-artwork-7", "home-city-artwork-8",
] as const;
export const homeCityKeys = [
  "delhi", "kolkata", "hyderabad", "varanasi", "mumbai", "jaipur", "bengaluru", "chennai", "gujarat",
  "artwork-1", "artwork-2", "artwork-3", "artwork-4", "artwork-5", "artwork-6", "artwork-7", "artwork-8", "agra",
] as const;
export type HomeCityKey = typeof homeCityKeys[number];
export const homeCitiesLayoutSchema = z.array(z.object({
  key: z.enum(homeCityKeys),
  enabled: z.boolean(),
}).strict()).length(homeCityKeys.length).refine(
  items => new Set(items.map(item => item.key)).size === items.length,
  "City placements must include every identity exactly once",
);
export type HomeCitiesLayout = z.infer<typeof homeCitiesLayoutSchema>;
export const templateMediaResponsiveKeys = [
  "home-nimbus", "nimbus-room-collection", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining", "nimbus-hero-poster",
] as const;
export type TemplateMediaKey = typeof templateMediaKeys[number];
const templateMediaItemSchema = z.object({
  key: z.enum(templateMediaKeys),
  image: contentImageSchema,
  mobileImage: contentImageSchema.optional(),
  alt: z.string().max(200).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use text without control characters"),
}).strict().superRefine((value, ctx) => {
  const responsive = (templateMediaResponsiveKeys as readonly string[]).includes(value.key);
  if (responsive !== (value.mobileImage !== undefined))
    ctx.addIssue({ code: "custom", path: ["mobileImage"], message: responsive ? "Choose both desktop and mobile artwork" : "This artwork has one image" });
  if (!value.alt.trim() && !(templateMediaDecorativeKeys as readonly string[]).includes(value.key))
    ctx.addIssue({ code: "custom", path: ["alt"], message: "Describe this artwork" });
});
export const templateMediaSchema = z.array(templateMediaItemSchema).max(templateMediaKeys.length).refine(
  items => new Set(items.map(item => item.key)).size === items.length, "Artwork placements must be unique",
);
export type TemplateMediaItem = z.infer<typeof templateMediaItemSchema>;
export type TemplateMedia = z.infer<typeof templateMediaSchema>;
const merchandisingSlug = (max: number) => z.string().max(max).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const merchandisingText = (max: number) => z.string().max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value),
  "Use nonblank text without control characters",
);
export const homeCollectionTileSchema = z.object({
  key: merchandisingSlug(80),
  title: merchandisingText(120),
  collectionHandle: merchandisingSlug(200),
  image: contentImageSchema,
  alt: merchandisingText(200),
  enabled: z.boolean(),
}).strict();
const productRailSchema = z.array(merchandisingSlug(200)).max(12).refine(
  handles => new Set(handles).size === handles.length, "Product handles must be unique",
);
const collectionRailSchema = z.array(homeCollectionTileSchema).max(12).refine(
  tiles => new Set(tiles.map(tile => tile.key)).size === tiles.length, "Collection tile keys must be unique",
);
export const homeMerchandisingSchema = z.object({
  bestsellers: productRailSchema,
  chairs: productRailSchema,
  categories: collectionRailSchema,
  offers: collectionRailSchema,
}).strict();
/** Staff-entered card highlights: colours for option names, and per-product New flags and review ratings. */
export const productHighlightsSchema = z.object({
  swatches: z.array(z.object({ name: text(80).refine(name => name.trim().length > 0, "A colour needs a name"), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict()).max(200),
  products: z.array(z.object({
    handle: merchandisingSlug(200),
    isNew: z.boolean(),
    // The average and count of real customer reviews; never estimated.
    rating: z.object({ value: z.number().min(1).max(5), count: z.number().int().min(1).max(100_000) }).strict().nullable(),
  }).strict()).max(300),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.swatches.map(swatch => swatch.name.trim().toLowerCase())).size !== value.swatches.length)
    ctx.addIssue({ code: "custom", message: "Swatch names must be unique" });
  if (new Set(value.products.map(product => product.handle)).size !== value.products.length)
    ctx.addIssue({ code: "custom", message: "Product handles must be unique" });
});
export type ProductHighlights = z.infer<typeof productHighlightsSchema>;
export type HomeCollectionTile = z.infer<typeof homeCollectionTileSchema>;
export type HomeMerchandising = z.infer<typeof homeMerchandisingSchema>;
const socialLink = z
  .string()
  .max(300)
  .regex(/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/$/);
export const campaignContentSchema = z
  .object({
    key: z.enum(campaignKeys),
    label: text(120),
    headline: z.array(text(120)).min(1).max(3),
    supporting: text(300),
    offer: z.array(text(120)).max(3),
    eligibility: text(300),
    cta: text(80),
    href: contentLinkSchema,
    schedule: campaignScheduleSchema.nullable().optional(),
    artwork: z
      .object({
        desktopImage: contentImageSchema,
        mobileImage: contentImageSchema,
        alt: text(200).min(1),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export const contentPageSchema = z
  .object({
    slug: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .refine(
        (s) =>
          ![
            "contact",
            "bulk-enquiry",
            "chairs",
            "tables",
            "sofas",
            "nimbus-collection",
            "our-story",
            "returns",
            "admin",
            "account",
            "cart",
            "checkout",
          ].includes(s),
        "This page route is reserved",
      ),
    title: text(160).min(1),
    description: text(300),
    body: text(8000),
    blocks: authoredBlocksSchema.optional(),
    banner: z
      .object({
        desktopImage: contentImageSchema,
        mobileImage: contentImageSchema,
        alt: text(200).min(1),
        href: contentLinkSchema,
        label: text(80).min(1),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((page, ctx) => {
    if (page.blocks !== undefined && new TextEncoder().encode(JSON.stringify(page)).length > 48 * 1024)
      ctx.addIssue({ code: "custom", message: "Page exceeds 48 KiB" });
  });
export const storefrontContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    // Legacy snapshots retain source navigation and footer defaults.
    siteChrome: siteChromeSchema.optional(),
    editorialContent: editorialContentSchema.optional(),
    authoredArticles: authoredArticlesSchema.optional(),
    homeSections: z
      .array(
        z
          .object({ key: z.enum(homeSectionKeys), enabled: z.boolean() })
          .strict(),
      )
      .min(1)
      .max(18),
    homeCopy: z
      .object({
        categoryHeading: text(160),
        bestsellersHeading: text(160),
        chairsHeading: text(160).optional(),
        socialHeading: text(160),
        ticker: text(600),
        testimonialHeading: text(160),
        testimonialSubheading: text(300),
      })
      .strict(),
    campaigns: z.array(campaignContentSchema).max(16),
    instagramPosts: z
      .array(
        z
          .object({
            href: socialLink,
            src: contentImageSchema,
            alt: text(200).min(1),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    pages: z.array(contentPageSchema).max(20),
    landingPages: z.array(categoryPageContentSchema).max(3).default([]),
    // Legacy revisions omit this field and retain the original Our Story template.
    storyPage: storyPageContentSchema.optional(),
    // Legacy revisions retain the original homepage template copy.
    homeDetails: homeDetailsSchema.optional(),
    // Absent in legacy revisions, preserving the original city order and visibility.
    homeCitiesLayout: homeCitiesLayoutSchema.optional(),
    homeMerchandising: homeMerchandisingSchema.optional(),
    productHighlights: productHighlightsSchema.optional(),
    templateMedia: templateMediaSchema.optional(),
    // Legacy revisions retain the original Nimbus collection template copy.
    nimbusPage: nimbusPageContentSchema.optional(),
    // Legacy revisions retain the original service page templates.
    servicePages: servicePagesContentSchema.optional(),
    motion: z
      .object({
        autoplaySocial: z.boolean(),
        autoplayCities: z.boolean(),
        autoplayTicker: z.boolean().optional(),
        revealSections: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const list of [
      value.homeSections.map((s) => s.key),
      value.campaigns.map((c) => c.key),
      value.instagramPosts.map((p) => p.href.replace("www.", "")),
      value.pages.map((p) => p.slug),
      value.landingPages.map((p) => p.slug),
    ])
      if (new Set(list).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Content identities must be unique",
        });
    if (new TextEncoder().encode(JSON.stringify(value)).length > 128 * 1024)
      ctx.addIssue({ code: "custom", message: "Content exceeds 128 KiB" });
  });
export type StorefrontContent = z.infer<typeof storefrontContentSchema>;
export type CampaignContent = z.infer<typeof campaignContentSchema>;
export type ContentPage = z.infer<typeof contentPageSchema>;
