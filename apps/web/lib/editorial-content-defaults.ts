import type { EditorialContent, EditorialNode } from "@shopmaple/contracts";
import source from "@/data/store-content.json";
import blogIndex from "@/data/blog-index.json";

type ResolvedArticle = Omit<(typeof source.blogs)[number]["articles"][number], "content"> & { content: EditorialNode[]; excerpt: string };
type ResolvedBlog = { handle: string; title: string; articles: ResolvedArticle[] };
type ResolvedEditorialContent = { policies: Record<string, { title: string; content: EditorialNode[] }>; blogs: ResolvedBlog[] };
export const defaultEditorialContent: EditorialContent = { policies: [], blogs: [], articles: [] };
export function resolveEditorialContent(value?: EditorialContent): ResolvedEditorialContent {
  const result = structuredClone({ policies: source.policies, blogs: source.blogs }) as unknown as ResolvedEditorialContent;
  const listing = blogIndex as Record<string, Record<string, { excerpt: string }>>;
  for (const blog of result.blogs) {
    const override = value?.blogs.find(item => item.handle === blog.handle);
    if (override) blog.title = override.title;
    for (const article of blog.articles) {
      article.excerpt = listing[blog.handle]?.[article.handle]?.excerpt ?? "";
      const edit = value?.articles.find(item => item.blog === blog.handle && item.handle === article.handle);
      if (edit) {
        article.title = edit.title;
        article.excerpt = edit.excerpt;
        article.content = structuredClone(edit.content);
      }
    }
  }
  for (const policy of value?.policies ?? []) {
    result.policies[policy.slug] = { title: policy.title, content: structuredClone(policy.content) };
  }
  return result;
}
