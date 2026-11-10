import Link from "next/link";
import { Suspense } from "react";
import { BlogBestsellers } from "@/components/blog/bestsellers";
import { BlogCardList } from "@/components/blog/card-list";
import { BlogFeaturedSlider } from "@/components/blog/featured-slider";
import { StoryPicture } from "@/components/blog/story-picture";
import { blogAuthor, blogCardsStep, blogFeaturedCount, blogImage, longDate, newestFirst, signOff, type BlogPost } from "@/lib/blog";

type Story = Pick<BlogPost, "handle" | "title" | "publishedAt" | "excerpt" | "cover" | "content" | "blocks">;

/**
 * The blog listing as Figma 268:4185 draws it (owner, 10 Nov 2026): the title, a slider of the newest stories, every
 * story after the newest as a card (six at a time, with Load more), then Shop Bestsellers. Each story is signed by the
 * author it names, else by the store; articles take no comments, so no comment count is shown.
 */
export function BlogIndex({ blog, title, articles, bestsellers }: {
  blog: string;
  title: string;
  articles: readonly Story[];
  bestsellers: string[];
}) {
  const stories = newestFirst(articles);
  return (
    <div data-store className="blog-page blog-listing">
      <section className="blog-stories" aria-labelledby="blog-index-title">
        <h1 id="blog-index-title" className="blog-title">{title}</h1>
        {stories.length ? (
          <>
            <BlogFeaturedSlider label={`Newest from ${title}`}>
              {stories.slice(0, blogFeaturedCount).map((post, at) => <FeaturedStory key={post.handle} blog={blog} post={post} eager={at === 0} />)}
            </BlogFeaturedSlider>
            {stories.length > 1 && (
              <BlogCardList step={blogCardsStep}>
                {stories.slice(1).map((post) => <StoryCard key={post.handle} blog={blog} post={post} />)}
              </BlogCardList>
            )}
          </>
        ) : (
          <p className="blog-empty">No articles published yet.</p>
        )}
      </section>
      <Suspense fallback={<section className="blog-bestsellers" aria-label="Shop Bestsellers" aria-busy="true" data-rail-placeholder />}>
        <BlogBestsellers handles={bestsellers} />
      </Suspense>
    </div>
  );
}

/** A story in the slider: its picture on the left half, then the date and author, title, excerpt and Read more. */
function FeaturedStory({ blog, post, eager }: { blog: string; post: Story; eager: boolean }) {
  const href = `/blogs/${blog}/${post.handle}`;
  const image = blogImage(blog, post);
  return (
    <article data-blog-slide className="blog-slide">
      <Link href={href} className="blog-slide-picture" tabIndex={-1} aria-hidden="true">
        {image && <StoryPicture image={image} eager={eager} sizes="(max-width: 749px) calc(100vw - 32px), (max-width: 1535px) 46vw, 696px" />}
      </Link>
      <div className="blog-slide-copy">
        <p className="blog-meta">
          {post.publishedAt && <><time dateTime={post.publishedAt}>{longDate(post.publishedAt)}</time><span className="blog-meta-dot" aria-hidden="true" /></>}
          <span data-blog-author>{signOff(post).author ?? blogAuthor}</span>
        </p>
        <h2><Link href={href}>{post.title}</Link></h2>
        {post.excerpt && <p data-slide-excerpt className="blog-slide-excerpt">{post.excerpt}</p>}
        <Link data-slide-read href={href} className="blog-slide-read" aria-label={`Read more about ${post.title}`}>Read more</Link>
      </div>
    </article>
  );
}

/** A story card: its picture, overlapped by a cream panel with the date, title, excerpt, author and an arrow link. */
function StoryCard({ blog, post, hidden }: { blog: string; post: Story; hidden?: boolean }) {
  const href = `/blogs/${blog}/${post.handle}`;
  const image = blogImage(blog, post);
  return (
    <article data-blog-card className="blog-card" hidden={hidden}>
      <Link data-card-image href={href} className="blog-card-picture" tabIndex={-1} aria-hidden="true">
        {image && <StoryPicture image={image} sizes="(max-width: 749px) calc(100vw - 32px), (max-width: 1279px) 44vw, 358px" />}
      </Link>
      <div className="blog-card-panel">
        <p data-card-date className="blog-card-date">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img src="/blog/calendar.svg" alt="" width={16} height={16} />
          {post.publishedAt && <time dateTime={post.publishedAt}>{longDate(post.publishedAt)}</time>}
        </p>
        <h2><Link href={href}>{post.title}</Link></h2>
        {post.excerpt && <p data-card-excerpt className="blog-card-excerpt">{post.excerpt}</p>}
        <div className="blog-card-foot">
          <span data-blog-author>{signOff(post).author ?? blogAuthor}</span>
          <Link data-card-arrow href={href} className="blog-card-arrow" aria-label={`Read ${post.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/blog/card-arrow.svg" alt="" width={16} height={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
