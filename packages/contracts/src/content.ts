import { z } from "zod";
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
  !value.split(/[/?#]/).includes("..");
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
  .strict();
export const storefrontContentSchema = z
  .object({
    schemaVersion: z.literal(1),
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
    // Legacy revisions retain the original Nimbus collection template copy.
    nimbusPage: nimbusPageContentSchema.optional(),
    motion: z
      .object({
        autoplaySocial: z.boolean(),
        autoplayCities: z.boolean(),
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
