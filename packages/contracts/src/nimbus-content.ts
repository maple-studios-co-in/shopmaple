import { z } from "zod";
import { collectionLandingContentSchema, copyText as text } from "./collection-landing";

/** The original template's nine regions, before the redesign (Figma 311:548; owner, 10 Nov 2026). */
export const legacyNimbusSectionKeys = [
  "hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises",
] as const;

/** The original template's copy and order, which the live store published; older revisions still validate. */
export const legacyNimbusPageContentSchema = z.object({
  title: text(160),
  sections: z.array(z.object({ key: z.enum(legacyNimbusSectionKeys), enabled: z.boolean() }).strict()).length(9),
  intro: z.object({ heading: text(160), body: text(2000) }).strict(),
  roomTiles: z.array(z.object({ key: z.enum(["bedroom", "living", "dining"]), title: text(160) }).strict()).length(3),
  origin: z.object({ eyebrow: text(160), heading: text(160), body: text(8000) }).strict(),
  principles: z.object({
    heading: text(160),
    items: z.array(z.object({ key: z.enum(["comfort", "silhouettes", "luxury", "spaces"]), title: text(160), body: text(2000) }).strict()).length(4),
  }).strict(),
  roomSlides: z.array(z.object({ key: z.enum(["living", "bedroom", "dining"]), label: text(160) }).strict()).length(3),
  series: z.object({ eyebrow: text(300), heading: text(160) }).strict(),
  project: z.object({ heading: text(160), body: text(2000) }).strict(),
  promises: z.array(z.object({ key: z.enum(["custom", "delivery", "craft", "warranty"]), title: text(160) }).strict()).length(4),
}).strict().superRefine((page, ctx) => {
  for (const key of ["sections", "roomTiles", "roomSlides", "promises"] as const)
    if (new Set(page[key].map(item => item.key)).size !== page[key].length)
      ctx.addIssue({ code: "custom", path: [key], message: "Nimbus identities must be unique" });
  if (new Set(page.principles.items.map(item => item.key)).size !== page.principles.items.length)
    ctx.addIssue({ code: "custom", path: ["principles", "items"], message: "Nimbus identities must be unique" });
});
export type LegacyNimbusPageContent = z.infer<typeof legacyNimbusPageContentSchema>;

/** The Nimbus page's words: the collection template's (shared with Terra), or an older revision of the original's, which
    reads as the redesign. Routes, photos and products stay with the page. */
export const nimbusPageContentSchema = z.union([collectionLandingContentSchema, legacyNimbusPageContentSchema]);
export type NimbusPageContent = z.infer<typeof nimbusPageContentSchema>;
