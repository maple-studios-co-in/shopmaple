import type { EditorialNode } from "@shopmaple/contracts";
import index from "@/data/blog-index.json";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

/** The blog pages as Figma 268:4185 (listing) and 268:4825 (article) draw them (owner, 10 Nov 2026). */
export type BlogRecord = ReturnType<typeof resolveEditorialContent>["blogs"][number];
export type BlogPost = BlogRecord["articles"][number];

/** The store signs an article that names no author: in full on the pages, as "Maple" in the narrow sidebar list. */
export const blogAuthor = "Maple Furnishers";
export const blogAuthorShort = "Maple";
/** The newest stories in the listing's slider, and the cards shown before each Load more. */
export const blogFeaturedCount = 3;
export const blogCardsStep = 6;
/**
 * The real pieces the article design names: its sidebar's Related Products, and the four tiles under
 * "Explore our collections". Read from the catalogue, so their photos and prices are always the live ones.
 */
export const blogRelatedProducts = ["seren-mpl-ch-acc-seren-bgcgsg", "arven", "avelia"] as const;
export const blogCollectionTiles = ["seren-mpl-ch-acc-seren-bgcgsg", "arven", "avelia", "vellora"] as const;

export type BlogImage = { src: string; alt: string; width: number; height: number; source: "artwork" | "cover" };
const presentation = index as Record<string, Record<string, { image: { src: string; alt: string; width: number; height: number } }>>;

/** An article's picture: the one staff chose for an authored article, else the imported article's own artwork. */
export function blogImage(blog: string, post: Pick<BlogPost, "handle" | "title" | "cover">): BlogImage | null {
  if (post.cover) return { src: post.cover.src, alt: post.cover.alt, width: 1200, height: 800, source: "cover" };
  const art = presentation[blog]?.[post.handle]?.image;
  return art ? { ...art, source: "artwork" } : null;
}

const plain = (node: EditorialNode): string => typeof node === "string" ? node : node.children.map(plain).join("");

/**
 * The author an article signs off with, and its text without that sign-off. Some imported articles end with a rule,
 * the author's name as a small heading and "Author | Maple Furnishers"; the design names the author in the byline
 * instead, so the name moves there and is not printed twice. An article with no sign-off has no named author.
 */
export function signOff(post: Pick<BlogPost, "content" | "blocks">): { author: string | null; content: EditorialNode[] } {
  const { content } = post;
  if (post.blocks) return { author: null, content };
  const elements = content.flatMap((node, at) => typeof node === "string" ? [] : [{ node, at }]);
  const [rule, name, role] = elements.slice(-3);
  if (!name || !role || !/^h[2-6]$/.test(name.node.tag) || !/^\s*Author\s*\|/i.test(plain(role.node))) return { author: null, content };
  const author = plain(name.node).replace(/\s+/g, " ").trim();
  if (!author || author.length > 60) return { author: null, content };
  return { author, content: content.slice(0, rule?.node.tag === "hr" ? rule.at : name.at) };
}

/** Newest publication first; the imported list itself is never reordered. */
export function newestFirst<T extends { publishedAt: string | null }>(articles: readonly T[]): T[] {
  return [...articles].sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0));
}

/** Dates as the store's customers read them, in India: "July 13, 2026" in lists, "Jul 13, 2026" in bylines. */
const long = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
export const longDate = (iso: string) => long.format(new Date(iso));
export const shortDate = (iso: string) => short.format(new Date(iso));

/** A tile's short name: "Seren - Burgundy Suede" is shown as "Seren". */
export const tileName = (title: string) => title.split(/\s+[-–—]\s+/)[0]!.trim();
