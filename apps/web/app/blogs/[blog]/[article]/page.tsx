import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog-article";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { JsonLd } from "@/components/store/json-ld";
import { articleStructuredData, breadcrumbStructuredData, pageDescription, seoSettings } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{
    blog: string;
    article: string;
  }>;
}) {
  const { blog, article } = await params;
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
  const post = blogs.find((item) => item.handle === blog)?.articles.find((item) => item.handle === article);
  if (!post) return { title: "Article" };
  const path = `/blogs/${blog}/${article}`, description = pageDescription(post.excerpt);
  return {
    title: post.title, description, alternates: { canonical: path },
    openGraph: { type: "article", siteName: "Maple Furnishers", locale: "en_IN", url: path, title: post.title, description,
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}), ...(post.cover ? { images: [{ url: post.cover.src, alt: post.cover.alt }] } : {}) },
  };
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{
    blog: string;
    article: string;
  }>;
}) {
  const { blog, article } = await params;
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
  const record = blogs.find((item) => item.handle === blog)!;
  const post = record?.articles.find((item) => item.handle === article);
  if (!post) notFound();
  const seo = seoSettings(process.env), path = `/blogs/${blog}/${article}`;
  return <>
    <JsonLd data={[
      articleStructuredData(seo, { title: post.title, excerpt: post.excerpt, path, image: post.cover?.src, published: post.publishedAt ?? undefined }),
      breadcrumbStructuredData(seo, [["Home", "/"], [record.title, `/blogs/${blog}`], [post.title, path]]),
    ]} />
    <BlogArticle blog={blog} record={record!} article={article} post={post} />
  </>;
}
