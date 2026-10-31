import Link from "next/link";
import Image from "next/image";
import { AuthoredArticleBody } from "./authored-article-body";
import index from "@/data/blog-index.json";
import { StoreContent } from "@/components/store-content";
import { breadcrumbs, editorialPage, storeProse, textLink } from "./current-look";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

type Blog = ReturnType<typeof resolveEditorialContent>["blogs"][number];
type Article = Blog["articles"][number];
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
export function BlogArticle({ blog, record, article, post }: { blog: string; record: Blog; article: string; post: Article }) {
  const image = presentation[blog]?.[article]?.image;
  return (
    <section data-store data-article-page className={editorialPage}>
      <nav data-breadcrumb aria-label="Breadcrumb" className={breadcrumbs}>
        <Link href="/" className={textLink}>Home</Link>
        <Link href={`/blogs/${blog}`} className={textLink}>{record.title}</Link>
      </nav>
      <header className="my-8 text-center">
        <h1 className="font-serif text-[clamp(32px,4vw,54px)] font-medium leading-[1.15] tracking-[-0.025em] text-brand">
          {post.title}
        </h1>
        {post.publishedAt && (
          <time dateTime={post.publishedAt} className="mt-6 block text-[#756d64]">
            {publicationDate.format(new Date(post.publishedAt))}
          </time>
        )}
      </header>
      {post.cover ? (
        <img src={post.cover.src} alt={post.cover.alt} width={1200} height={800} loading="eager" fetchPriority="high"
          className="mb-8 block aspect-[3/2] h-auto w-full object-cover" />
      ) : image && (
        <Image
          {...image}
          loading="eager"
          fetchPriority="high"
          sizes="(max-width:749px) calc(100vw - 36px), (max-width:1040px) calc(100vw - 56px), 984px"
          className="mb-8 block h-auto w-full"
        />
      )}
      <article data-article-body className={storeProse}>
        {post.blocks ? <AuthoredArticleBody blocks={post.blocks} /> : <StoreContent nodes={post.content} />}
      </article>
    </section>
  );
}
