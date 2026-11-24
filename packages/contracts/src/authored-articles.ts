import { z } from "zod";
import { contentImageSchema, contentLinkSchema } from "./content";
import { articleHandles, editorialDocumentSchema, editorialSlug, seoFields, type EditorialNode } from "./editorial-content";
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
export const authoredBlocksSchema = z.array(blockSchema).min(1).max(60).refine(blocks => new Set(blocks.map(block => block.id)).size === blocks.length, "Block identities must be unique");
/** At most this many articles staff write themselves. */
export const authoredArticleLimit = 50;
/**
 * An article staff wrote. Its text is rich text (`content`, owner, 24 Nov 2026); articles written before then keep their
 * `blocks` until they are next edited. `blog` is an imported blog or one staff added; an article whose blog is gone or
 * hidden is not shown. `hidden` keeps it off the site (and gives it no publication date) until it is shown.
 */
const articleSchema = z.object({
  blog: z.string().max(80).regex(editorialSlug), handle: z.string().max(120).regex(editorialSlug),
  title: nonblank(300), excerpt: text(2000),
  cover: z.object({ src: image, alt: nonblank(200) }).strict().nullable().optional(),
  content: editorialDocumentSchema.optional(),
  blocks: authoredBlocksSchema.optional(),
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  hidden: z.boolean().optional(),
  author: text(80).optional(),
  ...seoFields,
}).strict().superRefine((article, ctx) => {
  if (article.content === undefined && article.blocks === undefined) ctx.addIssue({ code: "custom", path: ["content"], message: "Write the article's text" });
  if (article.blog === "recent-stories" && (articleHandles as readonly string[]).includes(article.handle)) ctx.addIssue({ code: "custom", path: ["handle"], message: "This source article route is reserved" });
  if (new TextEncoder().encode(JSON.stringify(article)).length > 56 * 1024) ctx.addIssue({ code: "custom", message: "Article exceeds 56 KiB" });
});
export const authoredArticlesSchema = z.array(articleSchema).max(authoredArticleLimit).refine(articles => new Set(articles.map(article => `${article.blog}/${article.handle}`)).size === articles.length, "Article routes must be unique");
export type AuthoredArticle = z.infer<typeof articleSchema>;
export type AuthoredBlock = z.infer<typeof blockSchema>;

/**
 * An article written in blocks, as rich text: what the rich text editor opens, so an older article reads the same once
 * edited. Paragraphs, headings, lists, quotes, links (as a linked line) and pictures keep their order and words.
 */
export function blocksToEditorial(blocks: readonly AuthoredBlock[]): EditorialNode[] {
  return blocks.map((block): EditorialNode => {
    switch (block.type) {
      case "paragraph": return { tag: "p", children: [block.text] };
      case "quote": return { tag: "blockquote", children: [{ tag: "p", children: [block.text] }] };
      case "heading": return { tag: `h${block.level}`, children: [block.text] };
      case "list": return { tag: block.ordered ? "ol" : "ul", children: block.items.map(item => ({ tag: "li", children: [{ tag: "p", children: [item] }] })) };
      case "link": return { tag: "p", children: [{ tag: "a", href: block.href, children: [block.text] }] };
      case "image": return { tag: "img", src: block.src, alt: block.alt, children: [] };
    }
  });
}
/** One article and one block on their own, so the admin can tell which of a draft's are ready to save. */
export { articleSchema as authoredArticleSchema, blockSchema as authoredBlockSchema };
