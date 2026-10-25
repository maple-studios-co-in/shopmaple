import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import source from "@/data/store-content.json";
import index from "@/data/blog-index.json";
import { StoreContent } from "@/components/store-content";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";

const presentation: Record<
  string,
  Record<string, {
    image: { src: string; alt: string; width: number; height: number };
  }>
> = index;
const publicationDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
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
  const { blogs } = resolveEditorialContent(content.editorialContent);
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
  const original = source.blogs.find((item) => item.handle === blog);
  if (!original?.articles.some((item) => item.handle === article)) notFound();
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent);
  const record = blogs.find((item) => item.handle === blog)!;
  const post = record.articles.find((item) => item.handle === article)!;
  const image = presentation[blog]?.[article]?.image;
  return (
    <section className="editorial-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <Link href={`/blogs/${blog}`}>{record!.title}</Link>
      </nav>
      <header style={{ textAlign: "center", margin: "32px 0" }}>
        <h1
          style={{
            color: "#741a14",
            fontSize: "clamp(32px, 4vw, 54px)",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {post.title}
        </h1>
        {post.publishedAt && (
          <time
            dateTime={post.publishedAt}
            style={{ display: "block", marginTop: 24, color: "#756d64" }}
          >
            {publicationDate.format(new Date(post.publishedAt))}
          </time>
        )}
      </header>
      {image && (
        <Image
          {...image}
          loading="eager"
          fetchPriority="high"
          sizes="(max-width:749px) calc(100vw - 36px), (max-width:1040px) calc(100vw - 56px), 984px"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            marginBottom: 32,
          }}
        />
      )}
      <article className="store-prose">
        <StoreContent nodes={post.content} />
      </article>
    </section>
  );
}
