import { notFound } from "next/navigation";
import Link from "next/link";
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
  return (
    <section className="editorial-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>Blogs</span>
      </nav>
      <h1>{record.title}</h1>
      <div className="editorial-grid">
        {record.articles.map((article) => (
          <article key={article.handle}>
            <time dateTime={article.publishedAt!}>
              {new Date(article.publishedAt!).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              })}
            </time>
            <h2>
              <Link href={`/blogs/${blog}/${article.handle}`}>
                {article.title}
              </Link>
            </h2>
            <Link
              href={`/blogs/${blog}/${article.handle}`}
              aria-label={`Read ${article.title}`}
            >
              Read more →
            </Link>
          </article>
        ))}
      </div>
      {!record.articles.length && <p>No articles published yet.</p>}
    </section>
  );
}
