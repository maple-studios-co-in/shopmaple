import type { Prisma } from "@prisma/client";
import { categories, visibleEditorial, type EditorialNode, type StorefrontContent } from "@shopmaple/contracts";
import { collectionTitles } from "@shopmaple/contracts/catalogue-registry";
import { HttpError } from "../cart.js";

// Every collection the storefront serves: its page opens exactly the handles collectionTitles names (source
// collections, categories and the established aliases), so a link may point at any of them and at nothing else.
// Source JSON is bundled by tsup; this does not depend on a running web process.
const collectionHandles = new Set([...Object.keys(collectionTitles), ...categories, "all"]);
const originalPages = ["contact", "bulk-enquiry", "chairs", "tables", "sofas", "nimbus-collection", "our-story", "returns"];

function enabledChromePaths(content: StorefrontContent): string[] {
  const chrome = content.siteChrome;
  if (!chrome) return [];
  const enabled = <T extends { enabled: boolean; href: string }>(links: T[]) => links.filter(link => link.enabled);
  const footerColumnVisible = (key: "shop" | "help") => chrome.footer.columns.some(column => column.key === key && column.enabled);
  return [
    ...(chrome.announcement.enabled ? [chrome.announcement] : []),
    ...enabled(chrome.utilityLinks), ...enabled(chrome.desktopDiscovery), ...enabled(chrome.mobileQuickLinks),
    ...enabled(chrome.navigation).flatMap(item => [item, ...item.columns.flatMap(column => enabled(column.links))]),
    ...(footerColumnVisible("shop") ? enabled(chrome.footer.shopLinks) : []),
    ...(footerColumnVisible("help") ? enabled(chrome.footer.helpLinks) : []),
    ...enabled(chrome.footer.policyLinks),
  ].map(link => link.href.split("#")[0]!);
}

/** Every link address in a rich-text document (an editorial tag tree). */
function documentLinks(nodes: readonly EditorialNode[]): string[] {
  return nodes.flatMap(node => typeof node === "string" ? [] : [...(node.tag === "a" && node.href ? [node.href] : []), ...documentLinks(node.children)]);
}

export async function validateAuthoredContentLinks(tx: Prisma.TransactionClient, content: StorefrontContent) {
  // Store links in staff's own articles: rich text (from 24 Nov 2026) and the link blocks of articles written before.
  const articlePaths = new Set((content.authoredArticles ?? []).flatMap(article => [
    ...(article.blocks ?? []).flatMap(block => block.type === "link" ? [block.href.split("#")[0]!] : []),
    ...documentLinks(article.content ?? []).filter(href => href.startsWith("/")).map(href => href.split("#")[0]!),
  ]));
  const pagePaths = new Set(content.pages.flatMap(page => [
    ...(page.blocks ?? []).flatMap(block => block.type === "link" ? [block.href.split("#")[0]!] : []),
    // Store links written in rich text; email, phone and other Maple sites are not store pages.
    ...documentLinks(page.content ?? []).filter(href => href.startsWith("/")).map(href => href.split("#")[0]!),
  ]));
  const chromePaths = new Set(enabledChromePaths(content));
  const paths = new Set([...articlePaths, ...pagePaths, ...chromePaths]);
  if (!paths.size) return;
  // Policies, blogs and articles that will be on the site: a link to one staff hid or removed must not be published.
  const editorial = visibleEditorial(content.editorialContent, content.authoredArticles);
  const destinations = new Set([
    "/", "/account", "/favourites",
    // Pages live at /<slug>; their old /pages/<slug> addresses redirect there, so links saved before the move still publish.
    ...[...originalPages, ...content.pages.map(page => page.slug)].flatMap(slug => [`/${slug}`, `/pages/${slug}`]),
    ...editorial.policies.map(slug => `/policies/${slug}`), ...editorial.blogs.map(handle => `/blogs/${handle}`),
    ...editorial.articles.map(article => `/blogs/${article.blog}/${article.handle}`),
    ...[...collectionHandles].map(handle => `/collections/${handle}`),
  ]);
  const productHandles = [...paths].filter(path => path.startsWith("/products/")).map(path => path.slice("/products/".length));
  if (productHandles.length) {
    const products = await tx.product.findMany({ where: { handle: { in: productHandles }, published: true }, select: { handle: true } });
    for (const product of products) destinations.add(`/products/${product.handle}`);
  }
  for (const path of chromePaths) if (!destinations.has(path))
    throw new HttpError(400, "CHROME_LINK_TARGET_MISSING", "A navigation or footer link points to a page that is not available. Choose an existing destination before publishing.");
  for (const path of articlePaths) if (!destinations.has(path))
    throw new HttpError(400, "ARTICLE_LINK_TARGET_MISSING", "An article link points to a page that is not available. Choose an existing destination before publishing.");
  for (const path of pagePaths) if (!destinations.has(path))
    throw new HttpError(400, "PAGE_LINK_TARGET_MISSING", "A page link points to a page that is not available. Choose an existing destination before publishing.");
}

export async function normalizeArticlePublicationDates(tx: Prisma.TransactionClient, content: StorefrontContent, publish: boolean): Promise<StorefrontContent> {
  if (content.authoredArticles === undefined) return content;
  const identities = content.authoredArticles.map(({ blog, handle }) => ({ blog, handle }));
  if (!identities.length) return content;
  // An article is dated when it first goes on the site: a hidden one is dated when a publish first shows it.
  const shown = content.authoredArticles.filter(article => !article.hidden).map(({ blog, handle }) => ({ blog, handle }));
  if (publish && shown.length) await tx.shopArticlePublication.createMany({ data: shown, skipDuplicates: true });
  const publications = await tx.shopArticlePublication.findMany({ where: { OR: identities } });
  const dates = new Map(publications.map(row => [`${row.blog}/${row.handle}`, row.publishedAt.toISOString()]));
  return { ...content, authoredArticles: content.authoredArticles.map(article => ({ ...article, publishedAt: dates.get(`${article.blog}/${article.handle}`) ?? null })) };
}
