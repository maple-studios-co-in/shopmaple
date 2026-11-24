import { z } from "zod";
import { contentImageSchema, contentLinkSchema } from "./content";

/** The policies, blogs and articles imported from the old shop. Staff can edit, hide and restore them, and add their own. */
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
/** A picture uploaded to the media library. */
export const managedUpload = /^\/media\/uploads\/[a-f0-9]{64}\.webp$/;
/** A picture the store serves itself under /media (media library uploads, Keeri photos, campaign art). */
export const storeMedia = (src: string) => src.startsWith("/media/uploads/") ? managedUpload.test(src)
  : src.startsWith("/media/") && !src.includes("..") && contentImageSchema.safeParse(src).success;
/** A policy, blog or article address segment: lowercase letters, numbers and single hyphens. */
export const editorialSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paragraph and heading alignment the rich text editor offers (left is the default and is not stored). */
export const editorialAligns = ["center", "right", "justify"] as const;
export type EditorialAlign = (typeof editorialAligns)[number];
/**
 * Text colours the rich text editor offers: the store's own, each dark enough to read as body text on white (WCAG AA).
 * Stored by name, so the storefront decides the exact colour and no other colour can be saved.
 */
export const editorialColors = {
  maple: { label: "Maple red", hex: "#80241c" },
  gold: { label: "Gold", hex: "#8a5d12" },
  green: { label: "Green", hex: "#2f6b32" },
  grey: { label: "Grey", hex: "#5e574f" },
} as const;
export type EditorialColor = keyof typeof editorialColors;
/** The highlighter's colour (the <mark> tag). */
export const editorialHighlight = "#fbefc8";
export type EditorialNode = string | { tag: string; children: EditorialNode[]; href?: string; src?: string; alt?: string; align?: EditorialAlign; color?: EditorialColor };
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (max: number) => z.string().max(max).refine(value => !controls.test(value), "Control characters are not content");
const heading = (max: number) => text(max).refine(value => value.trim().length > 0, "Use a nonempty title");
const tags = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "mark", "sup", "sub", "br", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "span", "hr", "img"]);
const alignable = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
const allowedKeys = (tag: string) => tag === "a" ? ["tag", "children", "href"] : tag === "img" ? ["tag", "children", "src", "alt"]
  : alignable.has(tag) ? ["tag", "children", "align"] : tag === "span" ? ["tag", "children", "color"] : ["tag", "children"];
/**
 * Maple's own domain. Whether a saved link is a Maple page never depends on one deployment's settings (content valid on
 * one server must not fail on another); which Maple address is this store, and so becomes a local path when shown, is
 * the SITE_URL / SITE_ALIASES setting (site-address.ts).
 */
const mapleDomain = "maplefurnishers.com";
/** Whether an editorial link may be published: store paths, Maple pages (maplefurnishers.com and its subdomains), mailto: and tel: only. */
export function safeLink(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 1000 || /[\s\\%\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.split(/[/?#]/).some(segment => segment === ".." || segment === ".")) return false;
  if (value.startsWith("/")) return contentLinkSchema.safeParse(value).success;
  if (/^mailto:[A-Za-z0-9.!#$&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)) return true;
  if (/^tel:\+?[0-9()-]{3,30}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === mapleDomain || url.hostname.endsWith(`.${mapleDomain}`)) &&
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
    const allowed = allowedKeys(node.tag);
    if (Object.keys(node).some(key => !allowed.includes(key))) return false;
    if (node.align !== undefined && !(editorialAligns as readonly unknown[]).includes(node.align)) return false;
    if (node.color !== undefined && (typeof node.color !== "string" || !Object.hasOwn(editorialColors, node.color))) return false;
    if (node.tag === "a" && !safeLink(node.href)) return false;
    if (node.tag === "img" && (typeof node.src !== "string" || !(node.src.startsWith("https://") || storeMedia(node.src)) || !contentImageSchema.safeParse(node.src).success || (node.alt !== undefined && (typeof node.alt !== "string" || node.alt.length > 200 || controls.test(node.alt))))) return false;
    if (["img", "br", "hr"].includes(node.tag) && node.children.length) return false;
    if (count + stack.length + node.children.length > 2000) return false;
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }
  return new TextEncoder().encode(JSON.stringify(value)).length <= 48 * 1024;
}
/** One policy or article body: allowed tags and links, at most 2000 nodes, 20 levels deep and 48 KiB. */
export const editorialDocumentSchema = z.custom<EditorialNode[]>(validDocument, { error: "Invalid or oversized editorial document", abort: true });
const documentSchema = editorialDocumentSchema;
/** A whole policy or article entry (its text and its details) stays within 56 KiB. */
const fitsEntry = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length <= 56 * 1024;
const slugSchema = z.string().min(1).max(80).regex(editorialSlug, "Use lowercase letters, numbers and single hyphens");
/** A picture with its description, from the store's own media. */
const pictureSchema = z.object({ src: z.string().max(1000).refine(value => contentImageSchema.safeParse(value).success, "Use approved Maple media"), alt: text(200) }).strict();
/** What search engines show for a page, when staff write it; otherwise the page's title and opening words are used. */
export const seoFields = { seoTitle: text(120).optional(), seoDescription: text(300).optional() };
/**
 * A policy page. For an imported policy (`policySlugs`) the entry replaces its title and text; any other slug is a policy
 * staff added. `hidden` takes the page off the site (its address then shows "not found") until it is shown again.
 */
const policySchema = z.object({
  slug: slugSchema, title: heading(160), content: documentSchema, hidden: z.boolean().optional(),
  photo: pictureSchema.nullable().optional(), ...seoFields,
}).strict().refine(fitsEntry, "Editorial document exceeds 56 KiB");
/** A blog. For an imported blog (`blogHandles`) the entry renames or hides it; any other handle is a blog staff added. */
const blogSchema = z.object({ handle: slugSchema, title: heading(160), hidden: z.boolean().optional(), description: text(300).optional() }).strict();
/** Staff's edits to an imported article: its words, its byline, what search engines show, and whether it is on the site. */
const articleSchema = z.object({
  blog: z.literal("recent-stories"), handle: z.enum(articleHandles), title: heading(300), excerpt: text(2000), content: documentSchema,
  hidden: z.boolean().optional(), author: text(80).optional(), ...seoFields,
}).strict().refine(fitsEntry, "Editorial document exceeds 56 KiB");
/** At most this many policies and blogs, the imported ones included. */
export const editorialLimits = { policies: 20, blogs: 16 } as const;
export const editorialContentSchema = z.object({
  policies: z.array(policySchema).max(editorialLimits.policies), blogs: z.array(blogSchema).max(editorialLimits.blogs), articles: z.array(articleSchema).max(articleHandles.length),
}).strict().superRefine((value, ctx) => {
  for (const identities of [value.policies.map(item => item.slug), value.blogs.map(item => item.handle), value.articles.map(item => item.handle)])
    if (new Set(identities).size !== identities.length) ctx.addIssue({ code: "custom", message: "Editorial identities must be unique" });
});
export type EditorialPolicy = z.infer<typeof policySchema>;
export type EditorialBlog = z.infer<typeof blogSchema>;
export type EditorialArticle = z.infer<typeof articleSchema>;
export type EditorialContent = z.infer<typeof editorialContentSchema>;
