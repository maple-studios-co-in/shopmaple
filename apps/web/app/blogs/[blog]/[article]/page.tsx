import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog-article";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";

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
  return {
    title:
      blogs
        .find((item) => item.handle === blog)
        ?.articles.find((item) => item.handle === article)?.title || "Article",
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
  return <BlogArticle blog={blog} record={record!} article={article} post={post} />;
}
