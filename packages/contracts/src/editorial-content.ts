import { z } from "zod";
import { contentImageSchema, contentLinkSchema } from "./content";

export const policySlugs = ["privacy-policy", "refund-policy", "shipping-policy", "terms-of-service"] as const;
export const blogHandles = ["news", "buying-guidelines", "life-culture", "recent-stories"] as const;
export const articleHandles = [
  "space-saving-furniture-ideas-for-small-homes",
  "how-to-identify-quality-furniture-before-you-buy",
  "luxury-furniture-trends-2026-what-defined-the-first-half-of-the-year-and-what-will-shape-the-months-ahead",
  "why-every-successful-cafe-has-three-types-of-seating",
  "how-luxury-hotels-design-seating-that-makes-guests-stay-longer",
  "standard-dining-table-size-guide-for-indian-homes",
  "best-wood-for-furniture-in-indian-climate-humidity-heat-and-maintenance",
  "furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door",
  "what-should-be-finalised-first-furniture-flooring-or-lighting",
  "how-to-measure-furniture-before-ordering-online",
] as const;
/** A picture uploaded to the media library (pages can show these; imported policies never have them). */
export const managedUpload = /^\/media\/uploads\/[a-f0-9]{64}\.webp$/;
export type EditorialNode = string | { tag: string; children: EditorialNode[]; href?: string; src?: string; alt?: string };
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (max: number) => z.string().max(max).refine(value => !controls.test(value), "Control characters are not content");
const heading = (max: number) => text(max).refine(value => value.trim().length > 0, "Use a nonempty title");
const tags = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "b", "em", "i", "u", "br", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "span", "hr", "img"]);
/** Whether an editorial link may be published: store paths, Maple pages, mailto: and tel: only. */
export function safeLink(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 1000 || /[\s\\%\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.split(/[/?#]/).some(segment => segment === ".." || segment === ".")) return false;
  if (value.startsWith("/")) return contentLinkSchema.safeParse(value).success;
  if (/^mailto:[A-Za-z0-9.!#$&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)) return true;
  if (/^tel:\+?[0-9()-]{3,30}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["maplefurnishers.com", "www.maplefurnishers.com", "store.maplefurnishers.com", "shop.maplefurnishers.com"].includes(url.hostname) &&
      contentLinkSchema.safeParse(url.pathname + url.search + url.hash).success;
  } catch { return false; }
}

/** Validate iteratively before serialization: deeply nested or cyclic input never enters recursive parsing. */
function validDocument(value: unknown): value is EditorialNode[] {
  if (!Array.isArray(value) || value.length > 2000) return false;
  const stack = value.map(node => ({ node, depth: 1 }));
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > 2000 || depth > 20) return false;
    if (typeof node === "string") {
      if (node.length > 16000 || controls.test(node)) return false;
      continue;
    }
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    if (typeof node.tag !== "string" || !tags.has(node.tag) || !Array.isArray(node.children)) return false;
    const allowed = node.tag === "a" ? ["tag", "children", "href"] : node.tag === "img" ? ["tag", "children", "src", "alt"] : ["tag", "children"];
    if (Object.keys(node).some(key => !allowed.includes(key))) return false;
    if (node.tag === "a" && !safeLink(node.href)) return false;
    if (node.tag === "img" && (typeof node.src !== "string" || !(node.src.startsWith("https://") || managedUpload.test(node.src)) || !contentImageSchema.safeParse(node.src).success || (node.alt !== undefined && (typeof node.alt !== "string" || node.alt.length > 200 || controls.test(node.alt))))) return false;
    if (["img", "br", "hr"].includes(node.tag) && node.children.length) return false;
    if (count + stack.length + node.children.length > 2000) return false;
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }
  return new TextEncoder().encode(JSON.stringify(value)).length <= 48 * 1024;
}
/** One policy or article body: allowed tags and links, at most 2000 nodes, 20 levels deep and 48 KiB. */
export const editorialDocumentSchema = z.custom<EditorialNode[]>(validDocument, { error: "Invalid or oversized editorial document", abort: true });
const documentSchema = editorialDocumentSchema;
const fitsDocument = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length <= 48 * 1024;
const policySchema = z.object({ slug: z.enum(policySlugs), title: heading(160), content: documentSchema }).strict().refine(fitsDocument, "Editorial document exceeds 48 KiB");
const blogSchema = z.object({ handle: z.enum(blogHandles), title: heading(160) }).strict();
const articleSchema = z.object({ blog: z.literal("recent-stories"), handle: z.enum(articleHandles), title: heading(300), excerpt: text(2000), content: documentSchema }).strict().refine(fitsDocument, "Editorial document exceeds 48 KiB");
export const editorialContentSchema = z.object({
  policies: z.array(policySchema).max(4), blogs: z.array(blogSchema).max(4), articles: z.array(articleSchema).max(10),
}).strict().superRefine((value, ctx) => {
  for (const identities of [value.policies.map(item => item.slug), value.blogs.map(item => item.handle), value.articles.map(item => item.handle)])
    if (new Set(identities).size !== identities.length) ctx.addIssue({ code: "custom", message: "Editorial identities must be unique" });
});
export type EditorialPolicy = z.infer<typeof policySchema>;
export type EditorialBlog = z.infer<typeof blogSchema>;
export type EditorialArticle = z.infer<typeof articleSchema>;
export type EditorialContent = z.infer<typeof editorialContentSchema>;
