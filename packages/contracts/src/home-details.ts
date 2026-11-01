import { z } from "zod";
import { catalogueHandleSchema } from "./catalogue-cards";
import { contentImageSchema, contentLinkSchema } from "./content";

const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);

// Resolved at parse time: content.ts imports this file, so the shared validators are not ready when it loads.
const image = z.string().max(1000).refine(value => contentImageSchema.safeParse(value).success, "Use approved Maple media");
const link = z.string().max(500).refine(value => contentLinkSchema.safeParse(value).success, "Use a canonical store link");
const side = z.object({ handle: catalogueHandleSchema, label: text(80) }).strict();

/** Copy for the fixed homepage template; links, media and commerce stay outside this contract. */
export const homeDetailsSchema = z.object({
  hero: z.object({
    cta: text(80),
    tiles: z.array(z.object({
      key: z.enum(["sofas", "chairs", "tables", "beds"]),
      label: text(80),
      priceLabel: text(80),
    }).strict()).length(4),
  }).strict(),
  difference: z.object({
    eyebrow: text(160), heading: text(160), cta: text(80), promises: z.array(text(160)).length(4),
  }).strict(),
  nimbus: z.object({
    heading: text(160), tagline: text(300), features: z.array(text(160)).length(4), cta: text(80),
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
  cities: z.object({ eyebrow: text(160), heading: text(160) }).strict(),
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
