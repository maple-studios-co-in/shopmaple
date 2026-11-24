import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/catalog";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { collectProducts, seoSettings, sitemapEntries } from "@/lib/seo";

// Built from the live catalogue and published content on each request (crawlers fetch it rarely).
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, content] = await Promise.all([
    collectProducts((page) => getProducts({ page: String(page), limit: "50" })),
    getPublishedContent(),
  ]);
  // The policies and blogs on the site, staff's own included and anything hidden left out (owner, 24 Nov 2026).
  const { blogs, policies } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
  return sitemapEntries(seoSettings(process.env), {
    products,
    pages: content.pages.map((page) => page.slug),
    policies: Object.keys(policies),
    blogs: blogs.map((blog) => blog.handle),
    articles: blogs.flatMap((blog) => blog.articles.map((article) => ({ blog: blog.handle, handle: article.handle }))),
  });
}
