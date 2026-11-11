import { z } from "zod";

/** Nonblank plain text without control characters (a line break is kept). Shared by the collection pages' copy. */
export const copyText = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);

/**
 * The collection landing template's regions in their default order (Figma 311:548 Nimbus, 311:921 Terra; owner,
 * 10 Nov 2026). A page lists the regions it has: `rooms` is Terra's.
 */
export const collectionSectionKeys = [
  "hero", "room-nav", "philosophy", "origin", "rooms", "feeling", "material", "browse", "pieces", "consultation", "promise",
] as const;
export type CollectionSectionKey = (typeof collectionSectionKeys)[number];

// Room for the words an older Nimbus revision carries over (its eyebrows took 300 characters, its paragraphs 2000).
const line = copyText(160);
const para = copyText(2000);
const head = { eyebrow: copyText(300), heading: line };
const block = <S extends z.ZodRawShape>(shape: S) => z.object({ ...head, ...shape }).strict();
const list = <S extends z.ZodRawShape>(shape: S, min: number, max = min) => z.array(z.object(shape).strict()).min(min).max(max);

/**
 * A collection page's words (Nimbus, Terra). Items are matched to their photo, icon and link by position; links, photos
 * and products stay with the page. A line break in a heading is kept.
 */
export const collectionLandingContentSchema = z.object({
  title: line,
  sections: z.array(z.object({ key: z.enum(collectionSectionKeys), enabled: z.boolean() }).strict())
    .min(1).max(collectionSectionKeys.length)
    .refine(items => new Set(items.map(item => item.key)).size === items.length, "List each section once"),
  hero: block({ body: para, cta: line, film: line.optional() }),
  roomNav: list({ label: line }, 3),
  philosophy: block({ body: para }),
  origin: block({ body: para }),
  rooms: block({ items: list({ label: line, heading: line, body: para, tags: line, cta: line }, 3) }).optional(),
  feeling: block({ items: list({ title: line, body: para }, 3) }),
  material: block({ body: para, notes: list({ label: line }, 3), cta: line }),
  browse: block({ link: line, items: list({ title: line }, 4) }),
  pieces: block({ lead: para.optional(), link: line, cta: line.optional(), items: list({ title: line.optional(), line }, 1, 8) }),
  consultation: block({ body: para, cta: line, note: line }),
  promise: list({ label: line }, 3),
}).strict();
export type CollectionLandingContent = z.infer<typeof collectionLandingContentSchema>;
