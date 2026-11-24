/**
 * Policies, blogs and articles as the admin lists and changes them (owner, 24 Nov 2026: "there should be all CRUD
 * operations properly functional that is all delete add new articles and all"). Every change returns a new storefront
 * draft; nothing reaches the site until the draft is published.
 *
 * The policies, blogs and articles imported from the old shop are never deleted: staff edit, hide and restore them, so
 * they can always come back. What staff add (policies, blogs, articles) can be edited, hidden, duplicated and deleted.
 * An imported page back to its original words and shown needs no draft entry, so it carries none.
 *
 * Hiding or deleting a page turns off the navigation and footer links to it (publishing refuses a link to a page that is
 * not on the site); showing it again turns them back on. A deleted page's footer and menu links are removed where a list
 * allows it. Links written into page or article text cannot be changed for staff: `textLinksTo` names them instead.
 */
import {
  articleHandles, authoredArticleLimit, authoredArticleSchema, blocksToEditorial, editorialLimits, editorialSlug,
  type AuthoredArticle, type EditorialArticle, type EditorialBlog, type EditorialContent, type EditorialNode, type EditorialPolicy,
  type SiteChrome, type StorefrontContent,
} from "@shopmaple/contracts";
import blogIndex from "@/data/blog-index.json";
import { importedBlogs, importedPolicies } from "@/lib/editorial-content-defaults";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";

export type EditResult<T = object> = ({ ok: true; content: StorefrontContent } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const none: EditorialContent = { policies: [], blogs: [], articles: [] };
const editorial = (content: StorefrontContent) => content.editorialContent ?? none;
const authored = (content: StorefrontContent) => content.authoredArticles ?? [];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const withEditorial = (content: StorefrontContent, patch: Partial<EditorialContent>): StorefrontContent =>
  ({ ...content, editorialContent: { ...editorial(content), ...patch } });
/** Replaces the matching item where it is (so lists keep their order), appends a new one, or removes it (`null`). */
function upsert<T>(items: readonly T[], match: (item: T) => boolean, next: T | null): T[] {
  const index = items.findIndex(match);
  if (index === -1) return next ? [...items, next] : [...items];
  return next ? items.map((item, at) => at === index ? next : item) : items.filter((_, at) => at !== index);
}
/** An entry without its unset details: blank optional words, `hidden: false` and a removed picture are not stored. */
function tidy<T extends object>(entry: T): T {
  const out = { ...entry } as Record<string, unknown>;
  for (const key of ["seoTitle", "seoDescription", "author", "description"]) if (key in out && !String(out[key] ?? "").trim()) delete out[key];
  for (const key of ["hidden", "photo", "cover"]) if (key in out && !out[key]) delete out[key];
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out as T;
}

/** An address segment from words: lowercase letters, numbers and single hyphens ("Return & refunds" → "return-and-refunds"). */
export function slugify(words: string, max = 80): string {
  return words.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
}
/** `base`, or `base-2`, `base-3`… whichever is free. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, max = 80): string {
  const root = base || "untitled";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, max - `-${n}`.length).replace(/-+$/, "")}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
const validSlug = (value: string, max: number) => value.length > 0 && value.length <= max && editorialSlug.test(value);
const slugError = "Use lowercase letters, numbers and single hyphens for the address.";

/** Whether a rich-text document has anything to read or see. */
export function hasText(nodes: readonly EditorialNode[]): boolean {
  return nodes.some(node => typeof node === "string" ? node.trim().length > 0 : node.tag === "img" || hasText(node.children));
}

// ---------- Links in the navigation, the footer and the text ----------

const linkPath = (href: string) => href.split("#")[0]!.split("?")[0]!;
type Toggle = "disable" | "enable" | "remove";
/** The site chrome after `change`; a draft that kept the default chrome keeps it when nothing changed. */
function withChrome(content: StorefrontContent, change: (chrome: SiteChrome) => SiteChrome): StorefrontContent {
  const current = resolveSiteChrome(content.siteChrome);
  const next = change(resolveSiteChrome(current));
  return same(next, current) ? content : { ...content, siteChrome: next };
}
/**
 * Turns the navigation and footer links to `paths` off or back on, or removes them. Menu items and the announcement are
 * never removed (a menu column needs its links, the bar its words): they are turned off instead.
 */
function relink(content: StorefrontContent, paths: readonly string[], action: Toggle): StorefrontContent {
  const targets = new Set(paths);
  const hits = (link: { href: string }) => targets.has(linkPath(link.href));
  const flip = <T extends { href: string; enabled: boolean }>(link: T): T => hits(link) ? { ...link, enabled: action === "enable" } : link;
  const list = <T extends { href: string; enabled: boolean }>(links: T[]): T[] => action === "remove" ? links.filter(link => !hits(link)) : links.map(flip);
  return withChrome(content, chrome => ({
    ...chrome,
    announcement: flip(chrome.announcement),
    utilityLinks: list(chrome.utilityLinks),
    desktopDiscovery: list(chrome.desktopDiscovery),
    mobileQuickLinks: list(chrome.mobileQuickLinks),
    navigation: chrome.navigation.map(item => ({ ...flip(item), columns: item.columns.map(column => ({ ...column, links: column.links.map(flip) })) })),
    footer: { ...chrome.footer, shopLinks: list(chrome.footer.shopLinks), helpLinks: list(chrome.footer.helpLinks), policyLinks: list(chrome.footer.policyLinks) },
  }));
}
/**
 * Points every link to a moved page at its new address: the navigation and footer, and the links written into pages,
 * articles and policies, so a changed address never leaves a link that publishing would refuse.
 */
function movePaths(content: StorefrontContent, moves: ReadonlyMap<string, string>): StorefrontContent {
  const href = (value: string) => { const path = linkPath(value), to = moves.get(path); return to ? to + value.slice(path.length) : value; };
  const move = <T extends { href: string }>(link: T): T => href(link.href) === link.href ? link : { ...link, href: href(link.href) };
  const text = (nodes: EditorialNode[]): EditorialNode[] => nodes.map(node => typeof node === "string" ? node
    : { ...node, ...(node.tag === "a" && node.href ? { href: href(node.href) } : {}), children: text(node.children) });
  const blocks = <T extends { type: string }>(items: T[]): T[] => items.map(item => item.type === "link" && "href" in item && typeof item.href === "string" ? { ...item, href: href(item.href) } : item);
  const writing = <T extends { content?: EditorialNode[]; blocks?: { type: string }[] }>(item: T): T => ({
    ...item, ...(item.content ? { content: text(item.content) } : {}), ...(item.blocks ? { blocks: blocks(item.blocks) } : {}),
  });
  const moved = withChrome(content, chrome => ({
    ...chrome,
    announcement: move(chrome.announcement),
    utilityLinks: chrome.utilityLinks.map(move), desktopDiscovery: chrome.desktopDiscovery.map(move), mobileQuickLinks: chrome.mobileQuickLinks.map(move),
    navigation: chrome.navigation.map(item => ({ ...move(item), columns: item.columns.map(column => ({ ...column, links: column.links.map(move) })) })),
    footer: { ...chrome.footer, shopLinks: chrome.footer.shopLinks.map(move), helpLinks: chrome.footer.helpLinks.map(move), policyLinks: chrome.footer.policyLinks.map(move) },
  }));
  const entries = editorial(moved);
  return {
    ...moved,
    pages: moved.pages.map(writing),
    ...(moved.authoredArticles ? { authoredArticles: moved.authoredArticles.map(writing) } : {}),
    ...(moved.editorialContent ? { editorialContent: { ...entries, policies: entries.policies.map(writing), articles: entries.articles.map(writing) } } : {}),
  };
}
/** How many navigation and footer links go to `paths`. */
export function chromeLinksTo(content: StorefrontContent, paths: readonly string[]): number {
  const chrome = resolveSiteChrome(content.siteChrome), targets = new Set(paths);
  const links = [chrome.announcement, ...chrome.utilityLinks, ...chrome.desktopDiscovery, ...chrome.mobileQuickLinks,
    ...chrome.navigation.flatMap(item => [item, ...item.columns.flatMap(column => column.links)]),
    ...chrome.footer.shopLinks, ...chrome.footer.helpLinks, ...chrome.footer.policyLinks];
  return links.filter(link => targets.has(linkPath(link.href))).length;
}
function documentLinks(nodes: readonly EditorialNode[]): string[] {
  return nodes.flatMap(node => typeof node === "string" ? [] : [...(node.tag === "a" && node.href ? [node.href] : []), ...documentLinks(node.children)]);
}
/**
 * The pages and articles whose text links to `paths`: publishing refuses a link to a page that is not on the site, so
 * staff need to change these links themselves before a hidden or deleted page's draft can be published.
 */
export function textLinksTo(content: StorefrontContent, paths: readonly string[], except?: string): string[] {
  const targets = new Set(paths);
  const links = (item: { blocks?: { type: string; href?: string }[]; content?: EditorialNode[] }) =>
    [...(item.blocks ?? []).flatMap(block => block.type === "link" && block.href ? [block.href] : []), ...documentLinks(item.content ?? [])];
  const hits = (item: Parameters<typeof links>[0]) => links(item).some(href => targets.has(linkPath(href)));
  return [
    ...content.pages.filter(hits).map(page => `the page “${page.title}”`),
    ...authored(content).filter(article => articleId(article.blog, article.handle) !== except && hits(article)).map(article => `the article “${article.title}”`),
  ];
}

// ---------- Policies ----------

export const policyPath = (slug: string) => `/policies/${slug}`;
/** Policies staff may add, beside the imported ones (each imported one keeps room for its own draft entry). */
export const policyCapacity = editorialLimits.policies - Object.keys(importedPolicies).length;
/** The footer's policy column holds at most this many links (site-chrome.ts). */
export const footerPolicyLinkLimit = 8;
const originalPolicy = (slug: string) => Object.hasOwn(importedPolicies, slug) ? importedPolicies[slug] : undefined;
export type PolicyView = EditorialPolicy & { imported: boolean; edited: boolean };
/** An entry that says nothing an imported policy does not already say. */
function isOriginalPolicy(entry: EditorialPolicy, ignoreHidden = false): boolean {
  const original = originalPolicy(entry.slug), value = tidy(entry);
  return !!original && value.title === original.title && same(value.content, original.content) && (ignoreHidden || !value.hidden)
    && !value.photo && !value.seoTitle && !value.seoDescription;
}
export function policyView(content: StorefrontContent, slug: string): PolicyView | undefined {
  const entry = editorial(content).policies.find(item => item.slug === slug), original = originalPolicy(slug);
  if (!entry && !original) return undefined;
  const value: EditorialPolicy = entry ?? { slug, title: original!.title, content: original!.content };
  return { ...value, imported: !!original, edited: !!original && !!entry && !isOriginalPolicy(entry, true) };
}
/** The imported policies in their usual order, then the ones staff added, in the order they were added. */
export function policyList(content: StorefrontContent): PolicyView[] {
  const added = editorial(content).policies.filter(item => !originalPolicy(item.slug)).map(item => item.slug);
  return [...Object.keys(importedPolicies), ...added].map(slug => policyView(content, slug)!);
}
export function updatePolicy(content: StorefrontContent, slug: string, patch: Partial<Omit<EditorialPolicy, "slug">>): StorefrontContent {
  const current = policyView(content, slug);
  if (!current) return content;
  const { imported, edited: _edited, ...value } = current;
  const next = tidy({ ...value, ...patch, slug }) as EditorialPolicy;
  return withEditorial(content, { policies: upsert(editorial(content).policies, item => item.slug === slug, imported && isOriginalPolicy(next) ? null : next) });
}
export function addPolicy(content: StorefrontContent, { title, slug, footer }: { title: string; slug: string; footer: boolean }): EditResult {
  const name = title.replace(/\s+/g, " ").trim();
  if (!name) return fail("Give the policy a title.");
  if (!validSlug(slug, 80)) return fail(slugError);
  if (policyView(content, slug)) return fail("Another policy already uses this address.");
  if (policyList(content).filter(item => !item.imported).length >= policyCapacity) return fail(`You can add up to ${policyCapacity} policies. Delete one you no longer need first.`);
  const next = withEditorial(content, { policies: [...editorial(content).policies, { slug, title: name.slice(0, 160), content: [] }] });
  return { ok: true, content: footer ? addFooterLink(next, slug, name) : next };
}
/** A new address for a policy staff added; links to it follow. Imported policies keep theirs. */
export function movePolicy(content: StorefrontContent, slug: string, to: string): EditResult {
  if (originalPolicy(slug) || !policyView(content, slug)) return fail("Imported policies keep their address.");
  if (to === slug) return { ok: true, content };
  if (!validSlug(to, 80)) return fail(slugError);
  if (policyView(content, to)) return fail("Another policy already uses this address.");
  const next = withEditorial(content, { policies: editorial(content).policies.map(item => item.slug === slug ? { ...item, slug: to } : item) });
  return { ok: true, content: movePaths(next, new Map([[policyPath(slug), policyPath(to)]])) };
}
/** Deletes a policy staff added, with its footer and menu links. */
export function deletePolicy(content: StorefrontContent, slug: string): StorefrontContent {
  if (originalPolicy(slug)) return content;
  return relink(withEditorial(content, { policies: editorial(content).policies.filter(item => item.slug !== slug) }), [policyPath(slug)], "remove");
}
export function setPolicyHidden(content: StorefrontContent, slug: string, hidden: boolean): StorefrontContent {
  return relink(updatePolicy(content, slug, { hidden }), [policyPath(slug)], hidden ? "disable" : "enable");
}
/** An imported policy back to its original words, photo and search listing, and on the site. */
export function restorePolicy(content: StorefrontContent, slug: string): StorefrontContent {
  if (!originalPolicy(slug)) return content;
  const wasHidden = !!policyView(content, slug)?.hidden;
  const next = withEditorial(content, { policies: editorial(content).policies.filter(item => item.slug !== slug) });
  return wasHidden ? relink(next, [policyPath(slug)], "enable") : next;
}
/** The footer's link to a policy, if it has one. */
export function footerLink(content: StorefrontContent, slug: string) {
  return resolveSiteChrome(content.siteChrome).footer.policyLinks.find(link => linkPath(link.href) === policyPath(slug));
}
export const footerRoom = (content: StorefrontContent) => footerPolicyLinkLimit - resolveSiteChrome(content.siteChrome).footer.policyLinks.length;
export function addFooterLink(content: StorefrontContent, slug: string, label: string): StorefrontContent {
  return withChrome(content, chrome => {
    const links = chrome.footer.policyLinks;
    if (links.length >= footerPolicyLinkLimit || links.some(link => linkPath(link.href) === policyPath(slug))) return chrome;
    const id = uniqueSlug(`policy-${slug}`.slice(0, 80).replace(/-+$/, ""), new Set(links.map(link => link.id)), 80);
    const words = label.replace(/\s+/g, " ").trim().slice(0, 120) || slug;
    return { ...chrome, footer: { ...chrome.footer, policyLinks: [...links, { id, label: words, href: policyPath(slug), enabled: !policyView(content, slug)?.hidden }] } };
  });
}
export function setFooterLabel(content: StorefrontContent, slug: string, label: string): StorefrontContent {
  return withChrome(content, chrome => ({ ...chrome, footer: { ...chrome.footer,
    policyLinks: chrome.footer.policyLinks.map(link => linkPath(link.href) === policyPath(slug) ? { ...link, label: label.slice(0, 120) } : link) } }));
}
export function removeFooterLink(content: StorefrontContent, slug: string): StorefrontContent {
  return withChrome(content, chrome => ({ ...chrome, footer: { ...chrome.footer,
    policyLinks: chrome.footer.policyLinks.filter(link => linkPath(link.href) !== policyPath(slug)) } }));
}

// ---------- Blogs ----------

export const blogPath = (handle: string) => `/blogs/${handle}`;
/** Blogs staff may add, beside the imported ones. */
export const blogCapacity = editorialLimits.blogs - importedBlogs.length;
const originalBlog = (handle: string) => importedBlogs.find(item => item.handle === handle);
export type BlogView = EditorialBlog & { imported: boolean; edited: boolean; articles: number };
function isOriginalBlog(entry: EditorialBlog, ignoreHidden = false): boolean {
  const original = originalBlog(entry.handle), value = tidy(entry);
  return !!original && value.title === original.title && !value.description && (ignoreHidden || !value.hidden);
}
export function blogView(content: StorefrontContent, handle: string): BlogView | undefined {
  const entry = editorial(content).blogs.find(item => item.handle === handle), original = originalBlog(handle);
  if (!entry && !original) return undefined;
  const value: EditorialBlog = entry ?? { handle, title: original!.title };
  const articles = (original?.articles.length ?? 0) + authored(content).filter(article => article.blog === handle).length;
  return { ...value, imported: !!original, edited: !!original && !!entry && !isOriginalBlog(entry, true), articles };
}
export function blogList(content: StorefrontContent): BlogView[] {
  const added = editorial(content).blogs.filter(item => !originalBlog(item.handle)).map(item => item.handle);
  return [...importedBlogs.map(item => item.handle), ...added].map(handle => blogView(content, handle)!);
}
export function updateBlog(content: StorefrontContent, handle: string, patch: Partial<Omit<EditorialBlog, "handle">>): StorefrontContent {
  const current = blogView(content, handle);
  if (!current) return content;
  const { imported, edited: _edited, articles: _articles, ...value } = current;
  const next = tidy({ ...value, ...patch, handle }) as EditorialBlog;
  return withEditorial(content, { blogs: upsert(editorial(content).blogs, item => item.handle === handle, imported && isOriginalBlog(next) ? null : next) });
}
export function addBlog(content: StorefrontContent, { title, handle, description }: { title: string; handle: string; description: string }): EditResult {
  const name = title.replace(/\s+/g, " ").trim();
  if (!name) return fail("Give the blog a name.");
  if (!validSlug(handle, 80)) return fail(slugError);
  if (blogView(content, handle)) return fail("Another blog already uses this address.");
  if (blogList(content).filter(item => !item.imported).length >= blogCapacity) return fail(`You can add up to ${blogCapacity} blogs. Delete one you no longer need first.`);
  const blog = tidy({ handle, title: name.slice(0, 160), description: description.trim().slice(0, 300) }) as EditorialBlog;
  return { ok: true, content: withEditorial(content, { blogs: [...editorial(content).blogs, blog] }) };
}
/** The blog's own address and its articles' addresses. */
const blogPaths = (content: StorefrontContent, handle: string) =>
  [blogPath(handle), ...articleList(content).filter(article => article.blog === handle).map(article => articlePath(article.id))];
/** A new address for a blog staff added: its articles move with it, and links to the blog and its articles follow. */
export function moveBlog(content: StorefrontContent, handle: string, to: string): EditResult {
  if (originalBlog(handle) || !blogView(content, handle)) return fail("Imported blogs keep their address.");
  if (to === handle) return { ok: true, content };
  if (!validSlug(to, 80)) return fail(slugError);
  if (blogView(content, to)) return fail("Another blog already uses this address.");
  const moves = new Map(blogPaths(content, handle).map(path => [path, `${blogPath(to)}${path.slice(blogPath(handle).length)}`]));
  const next = {
    ...withEditorial(content, { blogs: editorial(content).blogs.map(item => item.handle === handle ? { ...item, handle: to } : item) }),
    ...(content.authoredArticles ? { authoredArticles: content.authoredArticles.map(article => article.blog === handle ? { ...article, blog: to } : article) } : {}),
  };
  return { ok: true, content: movePaths(next, moves) };
}
/** Deletes a blog staff added; one that still has articles keeps them safe until they are moved or deleted. */
export function deleteBlog(content: StorefrontContent, handle: string): EditResult {
  const blog = blogView(content, handle);
  if (!blog || blog.imported) return fail("Imported blogs can be hidden, not deleted.");
  if (blog.articles) return fail(`Move its ${blog.articles === 1 ? "article" : `${blog.articles} articles`} to another blog, or delete ${blog.articles === 1 ? "it" : "them"}, first.`);
  const next = withEditorial(content, { blogs: editorial(content).blogs.filter(item => item.handle !== handle) });
  return { ok: true, content: relink(next, [blogPath(handle)], "remove") };
}
/** Hiding a blog takes its articles off the site with it. */
export function setBlogHidden(content: StorefrontContent, handle: string, hidden: boolean): StorefrontContent {
  return relink(updateBlog(content, handle, { hidden }), blogPaths(content, handle), hidden ? "disable" : "enable");
}
export function restoreBlog(content: StorefrontContent, handle: string): StorefrontContent {
  if (!originalBlog(handle)) return content;
  const wasHidden = !!blogView(content, handle)?.hidden;
  const next = withEditorial(content, { blogs: editorial(content).blogs.filter(item => item.handle !== handle) });
  return wasHidden ? relink(next, blogPaths(content, handle), "enable") : next;
}

// ---------- Articles ----------

export const articleId = (blog: string, handle: string) => `${blog}/${handle}`;
export const articlePath = (id: string) => `/blogs/${id}`;
export type ArticleView = {
  id: string; blog: string; handle: string; kind: "imported" | "authored";
  title: string; excerpt: string; content: EditorialNode[]; hidden: boolean; edited: boolean;
  author?: string; seoTitle?: string; seoDescription?: string; cover?: AuthoredArticle["cover"];
  /** When the article first went on the site; null until the draft with it is published. */
  publishedAt: string | null;
  /** Written in the earlier block editor: it opens as rich text and is saved as rich text once changed. */
  legacy: boolean;
};
const listing = blogIndex as Record<string, Record<string, { excerpt?: string }>>;
function originalArticle(blog: string, handle: string) {
  const article = originalBlog(blog)?.articles.find(item => item.handle === handle);
  return article && { ...article, excerpt: listing[blog]?.[handle]?.excerpt ?? "" };
}
function isOriginalArticle(entry: EditorialArticle, ignoreHidden = false): boolean {
  const original = originalArticle(entry.blog, entry.handle), value = tidy(entry);
  return !!original && value.title === original.title && value.excerpt === original.excerpt && same(value.content, original.content)
    && (ignoreHidden || !value.hidden) && !value.author && !value.seoTitle && !value.seoDescription;
}
export function articleView(content: StorefrontContent, id: string): ArticleView | undefined {
  const slash = id.indexOf("/"), blog = id.slice(0, slash), handle = id.slice(slash + 1);
  const original = originalArticle(blog, handle);
  if (original) {
    const entry = editorial(content).articles.find(item => item.blog === blog && item.handle === handle);
    return {
      id, blog, handle, kind: "imported", publishedAt: original.publishedAt, legacy: false,
      title: entry?.title ?? original.title, excerpt: entry?.excerpt ?? original.excerpt, content: entry?.content ?? original.content,
      hidden: !!entry?.hidden, edited: !!entry && !isOriginalArticle(entry, true),
      ...(entry?.author ? { author: entry.author } : {}), ...(entry?.seoTitle ? { seoTitle: entry.seoTitle } : {}), ...(entry?.seoDescription ? { seoDescription: entry.seoDescription } : {}),
    };
  }
  const article = authored(content).find(item => item.blog === blog && item.handle === handle);
  if (!article) return undefined;
  return {
    id, blog, handle, kind: "authored", publishedAt: article.publishedAt ?? null, legacy: !article.content,
    title: article.title, excerpt: article.excerpt, content: article.content ?? blocksToEditorial(article.blocks ?? []),
    hidden: !!article.hidden, edited: false,
    ...(article.author ? { author: article.author } : {}), ...(article.seoTitle ? { seoTitle: article.seoTitle } : {}),
    ...(article.seoDescription ? { seoDescription: article.seoDescription } : {}), ...(article.cover ? { cover: article.cover } : {}),
  };
}
/** Every article: those not yet published first, then the newest first. */
export function articleList(content: StorefrontContent): ArticleView[] {
  const ids = [
    ...importedBlogs.flatMap(blog => blog.articles.map(article => articleId(blog.handle, article.handle))),
    ...authored(content).map(article => articleId(article.blog, article.handle)),
  ];
  const views = ids.map(id => articleView(content, id)!).filter(Boolean);
  return views.map((view, order) => ({ view, order })).sort((a, b) => {
    if (!a.view.publishedAt !== !b.view.publishedAt) return a.view.publishedAt ? 1 : -1;
    const date = (b.view.publishedAt ?? "").localeCompare(a.view.publishedAt ?? "");
    return date || b.order - a.order;
  }).map(({ view }) => view);
}
type ArticlePatch = Partial<Pick<ArticleView, "title" | "excerpt" | "content" | "hidden" | "author" | "seoTitle" | "seoDescription" | "cover">>;
export function updateArticle(content: StorefrontContent, id: string, patch: ArticlePatch): StorefrontContent {
  const view = articleView(content, id);
  if (!view) return content;
  if (view.kind === "imported") {
    const { cover: _cover, ...words } = patch;
    const next = tidy({
      blog: view.blog, handle: view.handle, title: view.title, excerpt: view.excerpt, content: view.content, hidden: view.hidden,
      author: view.author, seoTitle: view.seoTitle, seoDescription: view.seoDescription, ...words,
    }) as EditorialArticle;
    const match = (item: EditorialArticle) => item.blog === view.blog && item.handle === view.handle;
    return withEditorial(content, { articles: upsert(editorial(content).articles, match, isOriginalArticle(next) ? null : next) });
  }
  return { ...content, authoredArticles: authored(content).map(article => {
    if (article.blog !== view.blog || article.handle !== view.handle) return article;
    const next = tidy({ ...article, ...patch });
    // Text changed in the rich text editor replaces an older article's blocks.
    if (patch.content) delete next.blocks;
    return next;
  }) };
}
export function addArticle(content: StorefrontContent, { blog, title, handle }: { blog: string; title: string; handle: string }): EditResult<{ id: string }> {
  const name = title.replace(/\s+/g, " ").trim();
  if (!name) return fail("Give the article a title.");
  if (!blogView(content, blog)) return fail("Choose a blog for the article.");
  if (!validSlug(handle, 120)) return fail(slugError);
  if (blog === "recent-stories" && (articleHandles as readonly string[]).includes(handle)) return fail("An imported article already uses this address.");
  if (articleView(content, articleId(blog, handle))) return fail("Another article in this blog already uses this address.");
  if (authored(content).length >= authoredArticleLimit) return fail(`You can write up to ${authoredArticleLimit} articles. Delete one you no longer need first.`);
  const article: AuthoredArticle = { blog, handle, title: name.slice(0, 300), excerpt: "", content: [] };
  return { ok: true, id: articleId(blog, handle), content: { ...content, authoredArticles: [...authored(content), article] } };
}
/**
 * A new blog or address for an article staff wrote; links to it follow. An article already on the site goes on at its
 * new address with a new first-publication date, and its old address shows "not found" once the draft is published.
 */
export function moveArticle(content: StorefrontContent, id: string, { blog, handle }: { blog: string; handle: string }): EditResult<{ id: string }> {
  const view = articleView(content, id);
  if (!view || view.kind !== "authored") return fail("Imported articles keep their address.");
  const to = articleId(blog, handle);
  if (to === id) return { ok: true, id, content };
  if (!blogView(content, blog)) return fail("Choose a blog for the article.");
  if (!validSlug(handle, 120)) return fail(slugError);
  if (blog === "recent-stories" && (articleHandles as readonly string[]).includes(handle)) return fail("An imported article already uses this address.");
  if (articleView(content, to)) return fail("Another article in this blog already uses this address.");
  // Publishing dates it again at its new address (the API keeps first-publication dates by address).
  const next = { ...content, authoredArticles: authored(content).map(article => articleId(article.blog, article.handle) === id
    ? { ...article, blog, handle, publishedAt: null } : article) };
  return { ok: true, id: to, content: movePaths(next, new Map([[articlePath(id), articlePath(to)]])) };
}
/** A copy staff can change freely: hidden until they show it, so two of the same article never go on the site. */
export function duplicateArticle(content: StorefrontContent, id: string): EditResult<{ id: string }> {
  const view = articleView(content, id);
  if (!view) return fail("This article is no longer in the draft.");
  if (authored(content).length >= authoredArticleLimit) return fail(`You can write up to ${authoredArticleLimit} articles. Delete one you no longer need first.`);
  const taken = new Set(articleList(content).filter(item => item.blog === view.blog).map(item => item.handle));
  if (view.blog === "recent-stories") for (const handle of articleHandles) taken.add(handle);
  const handle = uniqueSlug(`${view.handle.slice(0, 115).replace(/-+$/, "")}-copy`, taken, 120);
  const copy = tidy({
    blog: view.blog, handle, title: `Copy of ${view.title}`.slice(0, 300), excerpt: view.excerpt, content: structuredClone(view.content), hidden: true,
    cover: view.cover ? structuredClone(view.cover) : undefined, author: view.author, seoTitle: view.seoTitle, seoDescription: view.seoDescription,
  }) as AuthoredArticle;
  const check = authoredArticleSchema.safeParse(copy);
  if (!check.success) return fail(check.error.issues.some(issue => issue.message.includes("KiB")) ? "This article is too long to copy." : `This article cannot be copied: ${check.error.issues[0]!.message}.`);
  return { ok: true, id: articleId(view.blog, handle), content: { ...content, authoredArticles: [...authored(content), copy] } };
}
/** Deletes an article staff wrote, with its menu and footer links; imported articles are hidden instead. */
export function deleteArticle(content: StorefrontContent, id: string): StorefrontContent {
  const view = articleView(content, id);
  if (!view || view.kind !== "authored") return content;
  const next = { ...content, authoredArticles: authored(content).filter(article => articleId(article.blog, article.handle) !== id) };
  return relink(next, [articlePath(id)], "remove");
}
export function setArticleHidden(content: StorefrontContent, id: string, hidden: boolean): StorefrontContent {
  return relink(updateArticle(content, id, { hidden }), [articlePath(id)], hidden ? "disable" : "enable");
}
export function restoreArticle(content: StorefrontContent, id: string): StorefrontContent {
  const view = articleView(content, id);
  if (!view || view.kind !== "imported") return content;
  const next = withEditorial(content, { articles: editorial(content).articles.filter(item => articleId(item.blog, item.handle) !== id) });
  return view.hidden ? relink(next, [articlePath(id)], "enable") : next;
}
