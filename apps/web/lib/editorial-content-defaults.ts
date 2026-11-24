import { blogCoverKeys, type AuthoredArticle, type AuthoredBlock, type EditorialContent, type EditorialNode, type TemplateMedia } from "@shopmaple/contracts";
import source from "@/data/store-content.json";
import blogIndex from "@/data/blog-index.json";

type Picture = { src: string; alt: string };
type ResolvedArticle = {
  handle: string; title: string; publishedAt: string | null; content: EditorialNode[]; summary?: unknown[]; excerpt: string;
  blocks?: AuthoredBlock[]; cover?: AuthoredArticle["cover"]; author?: string; seoTitle?: string; seoDescription?: string;
};
type ResolvedBlog = { handle: string; title: string; description?: string; articles: ResolvedArticle[] };
type ResolvedPolicy = { title: string; content: EditorialNode[]; photo?: Picture | null; seoTitle?: string; seoDescription?: string };
type ResolvedEditorialContent = { policies: Record<string, ResolvedPolicy>; blogs: ResolvedBlog[] };
export const defaultEditorialContent: EditorialContent = { policies: [], blogs: [], articles: [] };
/** The policies and blogs imported from the old shop, as bundled. */
export const importedPolicies = source.policies as Record<string, { title: string; content: EditorialNode[] }>;
export const importedBlogs = source.blogs as unknown as { handle: string; title: string; articles: { handle: string; title: string; publishedAt: string | null; content: EditorialNode[]; summary?: unknown[] }[] }[];
const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;

/**
 * The policies and blogs as published: the imported originals with staff's edits, then the policies, blogs and articles
 * staff added; whatever staff hid is left out (owner, 24 Nov 2026). `media` is the published template artwork: an
 * imported article whose cover slot (picture-slots.ts) staff filled shows that picture as its cover, in place of its
 * own artwork (owner, 12 Nov 2026). In the staff `preview`, staff's articles show before their first publication too,
 * dated today, so a new article can be seen as it will look.
 */
export function resolveEditorialContent(value?: EditorialContent, authoredArticles?: readonly AuthoredArticle[], media?: TemplateMedia, { preview = false } = {}): ResolvedEditorialContent {
  const result: ResolvedEditorialContent = structuredClone({ policies: importedPolicies, blogs: importedBlogs }) as unknown as ResolvedEditorialContent;
  const listing = blogIndex as Record<string, Record<string, { excerpt: string }>>;
  for (const blog of result.blogs) {
    const override = value?.blogs.find(item => item.handle === blog.handle);
    if (override) Object.assign(blog, { title: override.title }, optional("description", override.description));
    blog.articles = blog.articles.filter(article => !value?.articles.some(item => item.blog === blog.handle && item.handle === article.handle && item.hidden));
    for (const article of blog.articles) {
      article.excerpt = listing[blog.handle]?.[article.handle]?.excerpt ?? "";
      const edit = value?.articles.find(item => item.blog === blog.handle && item.handle === article.handle);
      if (edit) {
        Object.assign(article, { title: edit.title, excerpt: edit.excerpt, content: structuredClone(edit.content) },
          optional("author", edit.author), optional("seoTitle", edit.seoTitle), optional("seoDescription", edit.seoDescription));
      }
      const coverKey = Object.hasOwn(blogCoverKeys, article.handle) ? blogCoverKeys[article.handle as keyof typeof blogCoverKeys] : undefined;
      const cover = coverKey && media?.find(item => item.key === coverKey);
      if (cover) article.cover = { src: cover.image, alt: cover.alt };
    }
  }
  // Blogs staff added, after the imported ones; then whatever staff hid comes off the site.
  for (const blog of value?.blogs ?? []) {
    if (!result.blogs.some(item => item.handle === blog.handle)) result.blogs.push({ handle: blog.handle, title: blog.title, ...optional("description", blog.description), articles: [] });
  }
  result.blogs = result.blogs.filter(blog => !value?.blogs.some(item => item.handle === blog.handle && item.hidden));
  const today = new Date().toISOString();
  for (const article of authoredArticles ?? []) {
    if (article.hidden || (!article.publishedAt && !preview)) continue;
    const blog = result.blogs.find(item => item.handle === article.blog);
    if (!blog || blog.articles.some(item => item.handle === article.handle)) continue;
    blog.articles.push({
      handle: article.handle,
      title: article.title,
      excerpt: article.excerpt,
      publishedAt: article.publishedAt ?? today,
      // Rich text from 24 Nov 2026; an article written in blocks before then is shown from its blocks until edited.
      content: article.content ? structuredClone(article.content) : [],
      summary: [],
      ...(article.content ? {} : { blocks: structuredClone(article.blocks) }),
      cover: article.cover ? structuredClone(article.cover) : article.cover,
      ...optional("author", article.author), ...optional("seoTitle", article.seoTitle), ...optional("seoDescription", article.seoDescription),
    });
  }
  for (const policy of value?.policies ?? []) {
    if (policy.hidden) { delete result.policies[policy.slug]; continue; }
    result.policies[policy.slug] = {
      title: policy.title, content: structuredClone(policy.content),
      ...optional("photo", policy.photo ?? undefined), ...optional("seoTitle", policy.seoTitle), ...optional("seoDescription", policy.seoDescription),
    };
  }
  return result;
}
