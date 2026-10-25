import { notFound } from "next/navigation";
import { BlogIndex } from "@/components/blog-index";
import source from "@/data/store-content.json";
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    blog: string;
  }>;
}) {
  const { blog } = await params;
  return {
    title: source.blogs.find((item) => item.handle === blog)?.title || "Blogs",
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
  const record = source.blogs.find((item) => item.handle === blog);
  if (!record) notFound();
  return <BlogIndex blog={blog} title={record.title} articles={record.articles} />;
}
