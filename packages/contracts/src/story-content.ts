import { z } from "zod";

/** The page's regions in their default order. The redesign (owner, 10 Nov 2026) added the principles and the invitation. */
export const storySectionKeys = ["hero", "principles", "belief-film", "journey", "cities", "invitation"] as const;
/** The original template's four regions: older revisions list only these, and still validate. */
export const legacyStorySectionKeys = ["hero", "belief-film", "journey", "cities"] as const;
export const storyChapterKeys = [
  "chapter-1", "chapter-2", "chapter-3", "chapter-4", "chapter-5", "chapter-6", "chapter-7",
] as const;
/** The three value cards under the opening; each keeps its drawn icon. */
export const storyPrincipleKeys = ["handmade", "unique-designs", "bespoke-pieces"] as const;
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
  // The film left the page in the redesign; older revisions still carry its heading.
  filmHeading: heading,
  journeyHeading: text(160),
  sections: z.array(z.object({
    key: z.enum(storySectionKeys), enabled: z.boolean(),
  }).strict()).min(legacyStorySectionKeys.length).max(storySectionKeys.length),
  timeline: z.array(z.object({
    key: z.enum(storyChapterKeys), date: text(80), title: text(160), body: text(3000),
  }).strict()).length(7),
  // The redesign's own words (Figma 293:1093). Older revisions omit them and show the design's copy.
  heroEyebrow: text(160).optional(),
  heroBody: text(600).optional(),
  heroCta: text(60).optional(),
  principles: z.array(z.object({
    key: z.enum(storyPrincipleKeys), title: text(80), body: text(200),
  }).strict()).length(storyPrincipleKeys.length).optional(),
  journeyEyebrow: text(160).optional(),
  invitationHeading: text(200).optional(),
  invitationBody: text(400).optional(),
  invitationCta: text(60).optional(),
}).strict().superRefine((page, ctx) => {
  for (const key of ["sections", "timeline", "principles"] as const) {
    const keys = (page[key] ?? []).map(item => item.key);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", path: [key], message: "Story identities must be unique" });
  }
  const listed = new Set<string>(page.sections.map(item => item.key));
  if (legacyStorySectionKeys.some(key => !listed.has(key)))
    ctx.addIssue({ code: "custom", path: ["sections"], message: "List every Our Story section" });
});
export type StoryPageContent = z.infer<typeof storyPageContentSchema>;
export type StorySectionKey = StoryPageContent["sections"][number]["key"];
export type StoryPrincipleKey = typeof storyPrincipleKeys[number];
