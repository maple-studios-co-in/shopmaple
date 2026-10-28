import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/article-page";
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
export default async function Article({
  params,
}: {
  params: Promise<{
    blog: string;
    article: string;
  }>;
}) {
  const { blog, article } = await params;
  const page = ArticlePage({ blog, article, content: await getPublishedContent() });
  if (!page) notFound();
  return page;
}
