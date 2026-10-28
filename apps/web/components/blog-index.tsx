import Link from "next/link";
import Image from "@/components/storefront-image";
import index from "@/data/blog-index.json";

type Article = {
  handle: string;
  title: string;
  excerpt?: string;
  publishedAt: string | null;
  cover?: { src: string; alt: string } | null;
};
type IndexPresentation = {
  excerpt: string;
  image: { src: string; alt: string; width: number; height: number };
};
const presentation: Record<string, Record<string, IndexPresentation>> = index;

export function BlogIndex({ blog, title, articles }: {
  blog: string;
  title: string;
  articles: readonly Article[];
}) {
  const newestFirst = [...articles].sort(
    (a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0),
  );
  return (
    <section className="blog-index" aria-labelledby="blog-index-title">
      <h1 id="blog-index-title">{title}</h1>
      <div className="blog-index-grid">
        {newestFirst.map((article, position) => {
          const details = presentation[blog]?.[article.handle];
          const excerpt = article.excerpt ?? details?.excerpt;
          const href = `/blogs/${blog}/${article.handle}`;
          return (
            <article key={article.handle} className="blog-index-card">
              {article.cover ? (
                <Link href={href} className="blog-index-image">
                  <img src={article.cover.src} alt={article.cover.alt} width={1200} height={800} loading={position === 0 ? "eager" : "lazy"} />
                </Link>
              ) : details?.image && (
                <Link href={href} className="blog-index-image">
                  <Image
                    {...details.image}
                    loading={position === 0 ? "eager" : "lazy"}
                    sizes={position === 0
                      ? "(max-width:749px) calc(100vw - 32px), (max-width:1512px) 65vw, 1008px"
                      : position < 3
                        ? "(max-width:749px) calc(100vw - 32px), (max-width:1512px) 45vw, 702px"
                        : "(max-width:749px) calc(100vw - 32px), (max-width:1512px) 30vw, 456px"}
                  />
                </Link>
              )}
              <div className="blog-index-copy">
                <h2><Link href={href}>{article.title}</Link></h2>
                {excerpt && <p>{excerpt}</p>}
                <Link href={href} aria-label={`Read ${article.title}`}>
                  Read more...
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!articles.length && <p>No articles published yet.</p>}
    </section>
  );
}
