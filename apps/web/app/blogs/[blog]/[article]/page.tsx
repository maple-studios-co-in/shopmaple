import { notFound } from "next/navigation";
import Link from "next/link";
import source from "@/data/store-content.json";
import { StoreContent } from "@/components/store-content";
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    blog: string;
    article: string;
  }>;
}) {
  const { blog, article } = await params;
  return {
    title:
      source.blogs
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
  const record = source.blogs.find((item) => item.handle === blog);
  const post = record?.articles.find((item) => item.handle === article);
  if (!post) notFound();
  return (
    <section className="editorial-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <Link href={`/blogs/${blog}`}>{record!.title}</Link>
      </nav>
      <h1>{post.title}</h1>
      <article className="store-prose">
        <StoreContent nodes={post.content} />
      </article>
    </section>
  );
}
