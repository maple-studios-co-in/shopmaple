import { blogCoverKeys, type AuthoredArticle, type AuthoredBlock, type EditorialContent, type EditorialNode, type TemplateMedia } from "@shopmaple/contracts";
import source from "@/data/store-content.json";
import blogIndex from "@/data/blog-index.json";

type ResolvedArticle = Omit<(typeof source.blogs)[number]["articles"][number], "content"> & { content: EditorialNode[]; excerpt: string; blocks?: AuthoredBlock[]; cover?: AuthoredArticle["cover"] };
type ResolvedBlog = { handle: string; title: string; articles: ResolvedArticle[] };
type ResolvedEditorialContent = { policies: Record<string, { title: string; content: EditorialNode[] }>; blogs: ResolvedBlog[] };
export const defaultEditorialContent: EditorialContent = { policies: [], blogs: [], articles: [] };
/**
 * The policies and blogs as published: the imported originals with staff's edits, then staff's own articles. `media` is
 * the published template artwork: an imported article whose cover slot (picture-slots.ts) staff filled shows that
 * picture as its cover, in place of its own artwork (owner, 12 Nov 2026).
 */
export function resolveEditorialContent(value?: EditorialContent, authoredArticles?: readonly AuthoredArticle[], media?: TemplateMedia): ResolvedEditorialContent {
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
      const coverKey = Object.hasOwn(blogCoverKeys, article.handle) ? blogCoverKeys[article.handle as keyof typeof blogCoverKeys] : undefined;
      const cover = coverKey && media?.find(item => item.key === coverKey);
      if (cover) article.cover = { src: cover.image, alt: cover.alt };
    }
  }
  for (const article of authoredArticles ?? []) {
    if (!article.publishedAt) continue;
    const blog = result.blogs.find(item => item.handle === article.blog);
    if (!blog || blog.articles.some(item => item.handle === article.handle)) continue;
    blog.articles.push({
      handle: article.handle,
      title: article.title,
      excerpt: article.excerpt,
      publishedAt: article.publishedAt,
      content: [],
      summary: [],
      blocks: structuredClone(article.blocks),
      cover: article.cover ? structuredClone(article.cover) : article.cover,
    });
  }
  for (const policy of value?.policies ?? []) {
    result.policies[policy.slug] = { title: policy.title, content: structuredClone(policy.content) };
  }
  return result;
}
