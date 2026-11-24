import type { AuthoredArticle } from "./authored-articles";
import { articleHandles, blogHandles, policySlugs, type EditorialContent } from "./editorial-content";

/**
 * The policy, blog and article pages the storefront serves for a content document: the imported ones staff have not
 * hidden, and the ones staff added and have not hidden. An article shows only in a blog that is itself shown. Used for
 * the storefront's routes and sitemap, and by the API to check that links point at a page that exists.
 */
export function visibleEditorial(editorial: EditorialContent | undefined, authored: readonly AuthoredArticle[] | undefined) {
  const hiddenPolicies = new Set((editorial?.policies ?? []).filter(policy => policy.hidden).map(policy => policy.slug));
  const policies = [...new Set<string>([...policySlugs, ...(editorial?.policies ?? []).map(policy => policy.slug)])].filter(slug => !hiddenPolicies.has(slug));
  const hiddenBlogs = new Set((editorial?.blogs ?? []).filter(blog => blog.hidden).map(blog => blog.handle));
  const blogs = [...new Set<string>([...blogHandles, ...(editorial?.blogs ?? []).map(blog => blog.handle)])].filter(handle => !hiddenBlogs.has(handle));
  const shownBlogs = new Set(blogs);
  const hiddenImported = new Set((editorial?.articles ?? []).filter(article => article.hidden).map(article => article.handle));
  const articles = [
    ...(shownBlogs.has("recent-stories") ? articleHandles.filter(handle => !hiddenImported.has(handle)).map(handle => ({ blog: "recent-stories", handle: handle as string })) : []),
    ...(authored ?? []).filter(article => !article.hidden && shownBlogs.has(article.blog)).map(({ blog, handle }) => ({ blog, handle })),
  ];
  return { policies, blogs, articles };
}
