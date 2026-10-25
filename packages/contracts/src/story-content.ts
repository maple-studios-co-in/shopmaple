import { z } from "zod";

export const storySectionKeys = ["hero", "belief-film", "journey", "cities"] as const;
export const storyChapterKeys = [
  "chapter-1", "chapter-2", "chapter-3", "chapter-4", "chapter-5", "chapter-6", "chapter-7",
] as const;
const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);
const heading = z.array(text(160)).min(1).max(3);

/** Fixed existing template: no route, media, HTML or commerce fields. */
export const storyPageContentSchema = z.object({
  title: text(160),
  heroHeading: heading,
  tagline: text(300),
  beliefEyebrow: text(160),
  beliefHeading: heading,
  beliefBody: text(8000),
  filmHeading: heading,
  journeyHeading: text(160),
  sections: z.array(z.object({
    key: z.enum(storySectionKeys), enabled: z.boolean(),
  }).strict()).length(4),
  timeline: z.array(z.object({
    key: z.enum(storyChapterKeys), date: text(80), title: text(160), body: text(3000),
  }).strict()).length(7),
}).strict().superRefine((page, ctx) => {
  for (const key of ["sections", "timeline"] as const)
    if (new Set(page[key].map(item => item.key)).size !== page[key].length)
      ctx.addIssue({ code: "custom", path: [key], message: "Story identities must be unique" });
});
export type StoryPageContent = z.infer<typeof storyPageContentSchema>;
export type StorySectionKey = StoryPageContent["sections"][number]["key"];
