import type { Prisma } from "@prisma/client";
import { articleHandles, blogHandles, policySlugs, categories, type StorefrontContent } from "@shopmaple/contracts";
import sourceCollections from "../../../web/data/source-collections.json";
import { HttpError } from "../cart.js";

// Match the storefront's source collection registry and established category aliases.
// Source JSON is bundled by tsup; this does not depend on a running web process.
const collectionHandles = new Set([
  ...Object.keys(sourceCollections), ...categories, "all", "sofas-and-chairs", "5-seater-sofa", "7-seater-sofa",
  "chair-collection", "center-tables-1", "side-table", "sofa-table", "bestseller-chairs", "arm-chair",
  "dining-chair", "center-tables", "accent-chair", "dinings", "clearance-sale", "minimum-60-off",
  "best-buy-under-rs-50-000", "furniture-store-under-rs-25-000", "dining", "console-tables",
]);
const originalPages = ["contact", "bulk-enquiry", "chairs", "tables", "sofas", "nimbus-collection", "our-story", "returns"];

export async function validateAuthoredContentLinks(tx: Prisma.TransactionClient, content: StorefrontContent) {
  const articlePaths = new Set((content.authoredArticles ?? []).flatMap(article => article.blocks.flatMap(block => block.type === "link" ? [block.href.split("#")[0]!] : [])));
  const pagePaths = new Set(content.pages.flatMap(page => (page.blocks ?? []).flatMap(block => block.type === "link" ? [block.href.split("#")[0]!] : [])));
  const paths = new Set([...articlePaths, ...pagePaths]);
  if (!paths.size) return;
  const destinations = new Set([
    "/", ...originalPages.map(slug => `/pages/${slug}`), ...content.pages.map(page => `/pages/${page.slug}`),
    ...policySlugs.map(slug => `/policies/${slug}`), ...blogHandles.map(handle => `/blogs/${handle}`),
    ...articleHandles.map(handle => `/blogs/recent-stories/${handle}`),
    ...(content.authoredArticles ?? []).map(article => `/blogs/${article.blog}/${article.handle}`),
    ...[...collectionHandles].map(handle => `/collections/${handle}`),
  ]);
  const productHandles = [...paths].filter(path => path.startsWith("/products/")).map(path => path.slice("/products/".length));
  if (productHandles.length) {
    const products = await tx.product.findMany({ where: { handle: { in: productHandles }, published: true }, select: { handle: true } });
    for (const product of products) destinations.add(`/products/${product.handle}`);
  }
  for (const path of articlePaths) if (!destinations.has(path))
    throw new HttpError(400, "ARTICLE_LINK_TARGET_MISSING", "An article link points to a page that is not available. Choose an existing destination before publishing.");
  for (const path of pagePaths) if (!destinations.has(path))
    throw new HttpError(400, "PAGE_LINK_TARGET_MISSING", "A page link points to a page that is not available. Choose an existing destination before publishing.");
}

export async function normalizeArticlePublicationDates(tx: Prisma.TransactionClient, content: StorefrontContent, publish: boolean): Promise<StorefrontContent> {
  if (content.authoredArticles === undefined) return content;
  const identities = content.authoredArticles.map(({ blog, handle }) => ({ blog, handle }));
  if (!identities.length) return content;
  if (publish) await tx.shopArticlePublication.createMany({ data: identities, skipDuplicates: true });
  const publications = await tx.shopArticlePublication.findMany({ where: { OR: identities } });
  const dates = new Map(publications.map(row => [`${row.blog}/${row.handle}`, row.publishedAt.toISOString()]));
  return { ...content, authoredArticles: content.authoredArticles.map(article => ({ ...article, publishedAt: dates.get(`${article.blog}/${article.handle}`) ?? null })) };
}
