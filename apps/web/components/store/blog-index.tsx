import Link from "next/link";
import Image from "next/image";
import index from "@/data/blog-index.json";
import { cn } from "@/lib/utils";

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
const storyLink = "hover:underline hover:underline-offset-[3px]";

export function BlogIndex({ blog, title, articles }: {
  blog: string;
  title: string;
  articles: readonly Article[];
}) {
  const newestFirst = [...articles].sort(
    (a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0),
  );
  return (
    <section data-store data-blog-index aria-labelledby="blog-index-title" className="mx-auto max-w-[1512px] px-9 pt-10 pb-12 max-[750px]:px-4 max-[750px]:pb-8">
      <h1 id="blog-index-title" className="mb-10 text-center font-serif text-[clamp(48.67px,4vw,56px)] font-medium italic leading-[1.4] tracking-[-0.025em] text-brand">
        {title}
      </h1>
      <div className="grid grid-cols-6 gap-9">
        {newestFirst.map((article, position) => {
          const details = presentation[blog]?.[article.handle];
          const excerpt = article.excerpt ?? details?.excerpt;
          const href = `/blogs/${blog}/${article.handle}`;
          // Source composition: the lead story across the grid (image beside its copy), two
          // stories side by side, then rows of three; one column on phones, where every image
          // but the lead one shortens.
          const lead = position === 0;
          const pair = position === 1 || position === 2;
          const image = cn("block w-full object-cover", lead ? "h-[400px]" : pair ? "h-[320px] max-[750px]:h-[200px]" : "h-[240px] max-[750px]:h-[200px]");
          return (
            <article
              key={article.handle}
              data-blog-card
              className={cn(
                "min-w-0 max-[750px]:col-span-full",
                lead ? "col-span-full grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] max-[750px]:block" : pair ? "col-span-3" : "col-span-2",
              )}
            >
              {article.cover ? (
                <Link href={href} className="block overflow-hidden rounded-[4px]">
                  <img src={article.cover.src} alt={article.cover.alt} width={1200} height={800} loading={position === 0 ? "eager" : "lazy"} className={image} />
                </Link>
              ) : details?.image && (
                <Link href={href} className="block overflow-hidden rounded-[4px]">
                  <Image
                    {...details.image}
                    className={image}
                    loading={position === 0 ? "eager" : "lazy"}
                    sizes={position === 0
                      ? "(max-width:749px) calc(100vw - 32px), (max-width:1512px) 65vw, 1008px"
                      : position < 3
                        ? "(max-width:749px) calc(100vw - 32px), (max-width:1512px) 45vw, 702px"
                        : "(max-width:749px) calc(100vw - 32px), (max-width:1512px) 30vw, 456px"}
                  />
                </Link>
              )}
              <div className={cn("pt-[6.4px] wrap-anywhere", lead && "pl-9 max-[750px]:pl-0")}>
                <h2 className="mt-3 mb-2.5 font-redhat text-[18px] font-bold leading-[1.1] text-brand">
                  <Link href={href} className={storyLink}>{article.title}</Link>
                </h2>
                {excerpt && <p className="mt-4 text-[16px] leading-[1.6]">{excerpt}</p>}
                <Link href={href} aria-label={`Read ${article.title}`} className={cn("inline-block pt-3 text-[16px] leading-[1.6] text-brand", storyLink)}>
                  Read more...
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!articles.length && <p className="my-2.5">No articles published yet.</p>}
    </section>
  );
}
