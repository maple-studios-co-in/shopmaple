import type { ReactNode } from "react";
import { categoryPageSlugs, type CategoryPageSlug } from "@shopmaple/contracts";
import { BlogArticle } from "@/components/blog-article";
import { BlogIndex } from "@/components/blog-index";
import { CategoryLanding } from "@/components/category-landing";
import { NimbusLanding } from "@/components/category-nimbus";
import { StoryLanding } from "@/components/category-story";
import { ContentPage } from "@/components/content-page";
import { HomePage } from "@/components/home-page";
import { PolicyArticle } from "@/components/policy-page";
import { BulkEnquiry, Contact, ReturnsPageContent, emptyEnquiryContext } from "@/components/service-pages";
import source from "@/data/store-content.json";
import type { StorefrontDocument } from "@/lib/content";
import { resolveCategoryPageContent } from "@/lib/category-content-defaults";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";

export type StorefrontRoute = { title: string; path: string; node: ReactNode };

/**
 * Renders a storefront page from a given content document using the same components
 * the public routes use. The public routes call those components with the published
 * snapshot; the staff preview calls this with a draft. Unknown addresses return null.
 */
export function renderStorefrontRoute(segments: readonly string[], content: StorefrontDocument): StorefrontRoute | null {
  const [root, second, third, ...rest] = segments.filter(Boolean);
  if (rest.length > 0) return null;
  if (root === undefined || (root === "home" && second === undefined)) return { title: "Home", path: "/", node: <HomePage content={content} /> };
  if (root === "pages" && second !== undefined && third === undefined) {
    const path = `/pages/${second}`;
    if ((categoryPageSlugs as readonly string[]).includes(second)) {
      const slug = second as CategoryPageSlug;
      return { title: resolveCategoryPageContent(slug, content.landingPages).title, path, node: <CategoryLanding slug={slug} content={content} /> };
    }
    if (second === "our-story") {
      return { title: resolveStoryPageContent(content.storyPage).title, path, node: <StoryLanding content={content.storyPage} media={content.templateMedia} /> };
    }
    if (second === "nimbus-collection") {
      return { title: resolveNimbusPageContent(content.nimbusPage).title, path, node: <NimbusLanding content={content.nimbusPage} media={content.templateMedia} /> };
    }
    const services = resolveServicePages(content.servicePages);
    if (second === "contact") return { title: services.contact.title, path, node: <Contact context={emptyEnquiryContext} content={services.contact} /> };
    if (second === "bulk-enquiry") return { title: services.bulk.title, path, node: <BulkEnquiry context={emptyEnquiryContext} content={services.bulk} /> };
    if (second === "returns") return { title: services.returns.title, path, node: <ReturnsPageContent content={services.returns} /> };
    const page = content.pages.find((page) => page.slug === second);
    return page ? { title: page.title, path, node: <ContentPage page={page} /> } : null;
  }
  if (root === "policies" && second !== undefined && third === undefined) {
    if (!Object.hasOwn(source.policies, second)) return null;
    const policy = resolveEditorialContent(content.editorialContent).policies[second];
    return policy ? { title: policy.title, path: `/policies/${second}`, node: <PolicyArticle policy={policy} /> } : null;
  }
  if (root === "blogs" && second !== undefined) {
    if (!source.blogs.some((item) => item.handle === second)) return null;
    const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
    const record = blogs.find((item) => item.handle === second);
    if (!record) return null;
    if (third === undefined) return { title: record.title, path: `/blogs/${second}`, node: <BlogIndex blog={second} title={record.title} articles={record.articles} /> };
    const post = record.articles.find((item) => item.handle === third);
    return post ? { title: post.title, path: `/blogs/${second}/${third}`, node: <BlogArticle blog={second} record={record} article={third} post={post} /> } : null;
  }
  return null;
}

/** Preview destinations offered in the preview banner, derived from the document being previewed. */
export function listPreviewPages(content: StorefrontDocument): { label: string; segments: string[] }[] {
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
  return [
    { label: "Home", segments: ["home"] },
    ...categoryPageSlugs.map((slug) => ({ label: resolveCategoryPageContent(slug, content.landingPages).title, segments: ["pages", slug] })),
    { label: "Our Story", segments: ["pages", "our-story"] },
    { label: "Nimbus Collection", segments: ["pages", "nimbus-collection"] },
    { label: "Contact", segments: ["pages", "contact"] },
    { label: "Bulk Enquiry", segments: ["pages", "bulk-enquiry"] },
    { label: "Return & Exchange", segments: ["pages", "returns"] },
    ...content.pages.filter((page) => page.slug).map((page) => ({ label: page.title || page.slug, segments: ["pages", page.slug] })),
    ...Object.keys(source.policies).map((slug) => ({ label: resolveEditorialContent(content.editorialContent).policies[slug]?.title ?? slug, segments: ["policies", slug] })),
    ...blogs.flatMap((blog) => [
      { label: blog.title, segments: ["blogs", blog.handle] },
      ...blog.articles.map((article) => ({ label: `${blog.title}: ${article.title}`, segments: ["blogs", blog.handle, article.handle] })),
    ]),
  ];
}
