import { notFound } from "next/navigation";
import { BlogIndex } from "@/components/blog-index";
import source from "@/data/store-content.json";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    blog: string;
  }>;
}) {
  const { blog } = await params;
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
  const record = blogs.find((item) => item.handle === blog);
  return {
    title: record?.title || "Blogs",
    ...(record ? { alternates: { canonical: `/blogs/${blog}` } } : {}),
  };
}
export default async function BlogPage({
  params,
}: {
  params: Promise<{
    blog: string;
  }>;
}) {
  const { blog } = await params;
  if (!source.blogs.some((item) => item.handle === blog)) notFound();
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles);
  const record = blogs.find((item) => item.handle === blog)!;
  return <BlogIndex blog={blog} title={record.title} articles={record.articles} />;
}
