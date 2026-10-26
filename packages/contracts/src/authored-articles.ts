import { z } from "zod";
import { contentImageSchema, contentLinkSchema } from "./content";
import { articleHandles, blogHandles } from "./editorial-content";
const text = (max: number) => z.string().max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Control characters are not content");
const nonblank = (max: number) => text(max).refine(value => value.trim().length > 0, "Use nonblank text");
const id = z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
// Resolve shared validators at parse time to avoid circular module initialization.
const image = z.string().max(1000).refine(value => contentImageSchema.safeParse(value).success, "Use approved Maple media");
const link = z.string().max(500).refine(value => contentLinkSchema.safeParse(value).success, "Use a canonical store link");
const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("paragraph"), text: nonblank(8000) }).strict(),
  z.object({ id, type: z.literal("quote"), text: nonblank(8000) }).strict(),
  z.object({ id, type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: nonblank(300) }).strict(),
  z.object({ id, type: z.literal("list"), ordered: z.boolean(), items: z.array(nonblank(2000)).min(1).max(20) }).strict(),
  z.object({ id, type: z.literal("link"), text: nonblank(300), href: link }).strict(),
  z.object({ id, type: z.literal("image"), src: image, alt: nonblank(200) }).strict(),
]);
const articleSchema = z.object({
  blog: z.enum(blogHandles), handle: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: nonblank(300), excerpt: text(2000),
  cover: z.object({ src: image, alt: nonblank(200) }).strict().nullable().optional(),
  blocks: z.array(blockSchema).min(1).max(60).refine(blocks => new Set(blocks.map(block => block.id)).size === blocks.length, "Block identities must be unique"),
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict().superRefine((article, ctx) => {
  if (article.blog === "recent-stories" && (articleHandles as readonly string[]).includes(article.handle)) ctx.addIssue({ code: "custom", path: ["handle"], message: "This source article route is reserved" });
  if (new TextEncoder().encode(JSON.stringify(article)).length > 48 * 1024) ctx.addIssue({ code: "custom", message: "Article exceeds 48 KiB" });
});
export const authoredArticlesSchema = z.array(articleSchema).max(20).refine(articles => new Set(articles.map(article => `${article.blog}/${article.handle}`)).size === articles.length, "Article routes must be unique");
export type AuthoredArticle = z.infer<typeof articleSchema>;
export type AuthoredBlock = z.infer<typeof blockSchema>;
