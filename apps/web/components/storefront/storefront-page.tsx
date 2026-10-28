import type { ReactNode } from "react";
import { categoryPageSlugs, type CategoryPageSlug, type StorefrontContent } from "@shopmaple/contracts";
import { ArticlePage } from "@/components/article-page";
import { BlogIndex } from "@/components/blog-index";
import { CategoryLanding } from "@/components/category-landing";
import { NimbusLanding } from "@/components/category-nimbus";
import { StoryLanding } from "@/components/category-story";
import { ContentPage } from "@/components/content-page";
import { PolicyPage, isPolicySlug } from "@/components/policy-page";
import { ReturnsPage } from "@/components/returns-page";
import { ServicePage } from "@/components/service-pages";
import { HomePage } from "@/components/storefront/home-page";
import source from "@/data/store-content.json";
import type { StorefrontContentView } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import { resolveCategoryPageContent } from "@/lib/category-content-defaults";

/** Storefront pages that render purely from managed content. */
export type StorefrontPath =
  | { kind: "home" }
  | { kind: "category"; slug: CategoryPageSlug }
  | { kind: "page"; slug: string }
  | { kind: "story" }
  | { kind: "nimbus" }
  | { kind: "contact" }
  | { kind: "bulk" }
  | { kind: "returns" }
  | { kind: "policy"; slug: string }
  | { kind: "blog"; handle: string }
  | { kind: "article"; blog: string; handle: string };

const segment = /^[a-z0-9-]{1,120}$/;
/** Map URL segments to a previewable page, or null when the path is not managed content. */
export function resolveStorefrontPath(segments: readonly string[], content: StorefrontContent, options: { draft?: boolean } = {}): StorefrontPath | null {
  if (segments.length === 0) return { kind: "home" };
  if (!segments.every((part) => segment.test(part))) return null;
  const [root, second, third] = segments;
  if (root === "pages" && segments.length === 2 && second) {
    if ((categoryPageSlugs as readonly string[]).includes(second)) return { kind: "category", slug: second as CategoryPageSlug };
    if (second === "our-story") return { kind: "story" };
    if (second === "nimbus-collection") return { kind: "nimbus" };
    if (second === "contact") return { kind: "contact" };
    if (second === "bulk-enquiry") return { kind: "bulk" };
    if (second === "returns") return { kind: "returns" };
    return content.pages.some((page) => page.slug === second) ? { kind: "page", slug: second } : null;
  }
  if (root === "policies" && segments.length === 2 && second) return isPolicySlug(second) ? { kind: "policy", slug: second } : null;
  if (root === "blogs" && second) {
    const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles, { includeUnpublished: options.draft });
    const blog = blogs.find((item) => item.handle === second);
    if (!blog) return null;
    if (segments.length === 2) return { kind: "blog", handle: second };
    if (segments.length === 3 && third) return blog.articles.some((item) => item.handle === third) ? { kind: "article", blog: second, handle: third } : null;
  }
  return null;
}

export function storefrontPathHref(path: StorefrontPath): string {
  switch (path.kind) {
    case "home": return "/";
    case "category": return `/pages/${path.slug}`;
    case "page": return `/pages/${path.slug}`;
    case "story": return "/pages/our-story";
    case "nimbus": return "/pages/nimbus-collection";
    case "contact": return "/pages/contact";
    case "bulk": return "/pages/bulk-enquiry";
    case "returns": return "/pages/returns";
    case "policy": return `/policies/${path.slug}`;
    case "blog": return `/blogs/${path.handle}`;
    case "article": return `/blogs/${path.blog}/${path.handle}`;
  }
}

/** Every page staff can preview from a content snapshot, with a readable label. */
export function listStorefrontPages(content: StorefrontContent, options: { draft?: boolean } = {}): { path: string; label: string }[] {
  const editorial = resolveEditorialContent(content.editorialContent, content.authoredArticles, { includeUnpublished: options.draft });
  const titled = (slug: CategoryPageSlug) => resolveCategoryPageContent(slug, content.landingPages).title;
  return [
    { path: "/", label: "Homepage" },
    ...categoryPageSlugs.map((slug) => ({ path: `/pages/${slug}`, label: titled(slug) })),
    { path: "/pages/our-story", label: resolveStoryPageContent(content.storyPage).title },
    { path: "/pages/nimbus-collection", label: resolveNimbusPageContent(content.nimbusPage).title },
    { path: "/pages/contact", label: resolveServicePages(content.servicePages).contact.title },
    { path: "/pages/bulk-enquiry", label: resolveServicePages(content.servicePages).bulk.title },
    { path: "/pages/returns", label: resolveServicePages(content.servicePages).returns.title },
    ...content.pages.map((page) => ({ path: `/pages/${page.slug}`, label: page.title })),
    ...Object.keys(source.policies).map((slug) => ({ path: `/policies/${slug}`, label: editorial.policies[slug]?.title ?? slug })),
    ...editorial.blogs.map((blog) => ({ path: `/blogs/${blog.handle}`, label: `Blog: ${blog.title}` })),
    ...(content.authoredArticles ?? []).filter((article) => options.draft || article.publishedAt).map((article) => ({ path: `/blogs/${article.blog}/${article.handle}`, label: `Article: ${article.title || article.handle}` })),
  ];
}

/**
 * Render one storefront page from the supplied content. Public routes pass the
 * published snapshot; the admin preview passes the draft (with `draft` set so
 * unpublished authored articles are reachable). Returns null when the path
 * does not exist in that content.
 */
export async function StorefrontPage({ path, content, draft = false }: { path: StorefrontPath; content: StorefrontContentView; draft?: boolean }): Promise<ReactNode> {
  switch (path.kind) {
    case "home": return <HomePage content={content} />;
    case "category": return <CategoryLanding slug={path.slug} content={content} />;
    case "page": {
      const page = content.pages.find((item) => item.slug === path.slug);
      return page ? <ContentPage page={page} /> : null;
    }
    case "story": return <StoryLanding content={content.storyPage} media={content.templateMedia} />;
    case "nimbus": return <NimbusLanding content={content.nimbusPage} media={content.templateMedia} />;
    case "contact": return <ServicePage slug="contact" content={resolveServicePages(content.servicePages)} />;
    case "bulk": return <ServicePage slug="bulk-enquiry" content={resolveServicePages(content.servicePages)} />;
    case "returns": return <ReturnsPage content={resolveServicePages(content.servicePages).returns} />;
    case "policy": return PolicyPage({ slug: path.slug, content });
    case "blog": {
      const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles, { includeUnpublished: draft });
      const record = blogs.find((item) => item.handle === path.handle);
      return record ? <BlogIndex blog={path.handle} title={record.title} articles={record.articles} /> : null;
    }
    case "article": return ArticlePage({ blog: path.blog, article: path.handle, content, draft });
  }
}
