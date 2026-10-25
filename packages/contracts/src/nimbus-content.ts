import { z } from "zod";

export const nimbusSectionKeys = [
  "hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises",
] as const;
const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);

/** Copy and order for the existing template; routes, media and commerce remain fixed. */
export const nimbusPageContentSchema = z.object({
  title: text(160),
  sections: z.array(z.object({ key: z.enum(nimbusSectionKeys), enabled: z.boolean() }).strict()).length(9),
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
export type NimbusPageContent = z.infer<typeof nimbusPageContentSchema>;
export type NimbusSectionKey = NimbusPageContent["sections"][number]["key"];
