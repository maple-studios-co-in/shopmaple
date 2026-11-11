import Link from "next/link";
import { createElement, Fragment, Suspense } from "react";
import type { EditorialNode, TemplateMedia } from "@shopmaple/contracts";
import { AuthoredArticleBody } from "@/components/authored-article-body";
import { StoreContent } from "@/components/store-content";
import { ContentImage } from "@/components/content-image";
import { BlogCollections } from "@/components/blog/collections";
import { BlogRelatedProducts } from "@/components/blog/related-products";
import { BlogShareButton } from "@/components/blog/share-button";
import { StoryPicture } from "@/components/blog/story-picture";
import {
  blogAuthor, blogAuthorShort, blogImage, blogRelatedProducts, longDate, newestFirst, shortDate, signOff,
  type BlogImage, type BlogPost, type BlogRecord,
} from "@/lib/blog";
import { interleaveBody, softenBreaks, storyPictures, type BodyPicture } from "@/lib/blog-body";
import { absolute, seoSettings } from "@/lib/seo";

/**
 * The blog article as Figma 268:4825 draws it (owner, 10 Nov 2026): the title, the byline (the author the article signs
 * off with, else Maple Furnishers) and the article's picture; the text, closing with the byline again and Share, beside
 * a sidebar (share this article, recent articles, related products); then "Explore our collections".
 */
export function BlogArticle({ blog, record, post, shareUrl, media }: { blog: string; record: BlogRecord; post: BlogPost; shareUrl: string; /** The published template artwork, for the collections photo. */ media?: TemplateMedia }) {
  const image = blogImage(blog, post);
  const { author, content } = signOff(post);
  const recent = newestFirst(record.articles).filter((item) => item.handle !== post.handle).slice(0, 3);
  return (
    <div data-store className="blog-page blog-article-page">
      <header className="blog-article-head">
        <h1>{post.title}</h1>
        <Byline post={post} author={author ?? blogAuthor} className="blog-byline" marked />
        {image && <ArticleHero image={image} title={post.title} />}
      </header>
      <div className="blog-article-layout">
        <div className="blog-article-main">
          <article data-blog-body className="blog-article-body">
            {post.blocks ? <AuthoredArticleBody blocks={post.blocks} /> : <ArticleText content={content} pictures={storyPictures(post.handle)} />}
          </article>
          <footer data-article-footer className="blog-article-footer">
            <Byline post={post} author={author ?? blogAuthor} className="blog-byline blog-byline-footer" />
            <BlogShareButton title={post.title} url={shareUrl} icon="/blog/share-inline.svg" className="blog-share-inline" />
          </footer>
        </div>
        <aside data-article-sidebar className="blog-sidebar" aria-label="More from Maple">
          <ShareThisArticle title={post.title} url={shareUrl} picture={image ? absolute(seoSettings(process.env), image.src) : null} />
          {recent.length > 0 && (
            <section data-sidebar-recent className="blog-sidebar-section" aria-labelledby="blog-recent-title">
              <h2 id="blog-recent-title">Recent Articles</h2>
              <ul className="blog-sidebar-list">
                {recent.map((item) => {
                  const href = `/blogs/${blog}/${item.handle}`;
                  const art = blogImage(blog, item);
                  return (
                    <li key={item.handle} className="blog-sidebar-item">
                      <Link data-recent-image href={href} className="blog-sidebar-thumb" tabIndex={-1} aria-hidden="true">
                        {art && <StoryPicture image={art} alt="" sizes="120px" />}
                      </Link>
                      <div className="blog-sidebar-copy">
                        <p className="blog-meta blog-meta-small">
                          {item.publishedAt && <><time dateTime={item.publishedAt}>{longDate(item.publishedAt)}</time><span className="blog-meta-dot" aria-hidden="true" /></>}
                          <span data-recent-author>{signOff(item).author ?? blogAuthorShort}</span>
                        </p>
                        <Link data-recent-title href={href} className="blog-recent-title">{item.title}</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <Suspense fallback={null}>
            <BlogRelatedProducts handles={blogRelatedProducts} />
          </Suspense>
        </aside>
      </div>
      <BlogCollections media={media} />
    </div>
  );
}

/** "Rezaa Modasiya • Jul 13, 2026", under the title (marked for the byline) and again under the text. */
function Byline({ post, author, className, marked = false }: { post: BlogPost; author: string; className: string; marked?: boolean }) {
  return (
    <p className={className} data-article-byline={marked ? "" : undefined}>
      <span data-blog-author>{author}</span>
      {post.publishedAt && <><span className="blog-meta-dot" aria-hidden="true" /><time dateTime={post.publishedAt}>{shortDate(post.publishedAt)}</time></>}
    </p>
  );
}

/**
 * The article's picture as one full banner, the design's 1200 x 500 (owner, 10 Nov 2026: "should not give card inside
 * card effect, it should be a complete banner image"). The picture covers the whole frame, held at its centre.
 */
function ArticleHero({ image, title }: { image: BlogImage; title: string }) {
  const alt = image.source === "cover" ? image.alt || title : title;
  return (
    <div className="blog-hero" data-hero="banner">
      <ContentImage data-article-hero src={image.src} alt={alt} width={image.width} height={image.height} loading="eager" fetchPriority="high"
        sizes="(max-width: 1231px) calc(100vw - 32px), 1200px" />
    </div>
  );
}

/** An imported article's text with Maple's photographs set between its points: text, picture, text, picture, text. */
function ArticleText({ content, pictures }: { content: EditorialNode[]; pictures: BodyPicture[] }) {
  let chapter = 0;
  return interleaveBody(softenBreaks(content), pictures).map((segment, at) =>
    segment.kind === "picture" ? (
      <BodyFigure key={at} picture={segment.picture} chapter={String(++chapter).padStart(2, "0")} />
    ) : (
      <Fragment key={at}>
        {segment.pieces.map((piece, index) => "node" in piece
          ? <StoreContent key={index} nodes={[piece.node]} />
          : createElement(piece.list, { key: index, start: piece.list === "ol" && piece.start > 1 ? piece.start : undefined }, <StoreContent nodes={piece.items} />))}
      </Fragment>
    ));
}

/**
 * One of the story's three photographs, opening its part: a 16:9 frame held on the picture's subject, the part's number
 * and, where the photograph shows one of the store's pieces, a quiet link to it.
 */
function BodyFigure({ picture, chapter }: { picture: BodyPicture; chapter: string }) {
  return (
    <figure data-body-picture data-chapter={chapter} className="blog-figure">
      <div data-figure-frame data-ratio="16:9" className="blog-figure-frame">
        <ContentImage src={picture.src} alt={picture.alt} width={picture.width} height={picture.height} style={{ objectPosition: picture.focus }}
          sizes="(max-width: 749px) calc(100vw - 32px), 750px" />
      </div>
      <figcaption className="blog-figure-caption">
        <span className="blog-figure-number" aria-hidden="true">{chapter}</span>
        {picture.product && (
          <Link href={picture.product.href} className="blog-figure-product">
            <span className="sr-only">Shown: </span>{picture.product.name}<span aria-hidden="true"> →</span>
          </Link>
        )}
      </figcaption>
    </figure>
  );
}

/** Share this article (Figma 268:4867): the phone's share sheet, then Facebook, X and Pinterest by the article's full address. */
function ShareThisArticle({ title, url, picture }: { title: string; url: string; picture: string | null }) {
  const address = encodeURIComponent(url), name = encodeURIComponent(title);
  const networks = [
    { key: "facebook", label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${address}` },
    { key: "x", label: "Share on X", href: `https://twitter.com/intent/tweet?url=${address}&text=${name}` },
    { key: "pinterest", label: "Share on Pinterest", href: `https://pinterest.com/pin/create/button/?url=${address}${picture ? `&media=${encodeURIComponent(picture)}` : ""}&description=${name}` },
  ];
  return (
    <section data-sidebar-share className="blog-sidebar-section" aria-labelledby="blog-share-title">
      <h2 id="blog-share-title">Share this article</h2>
      <div className="blog-share-row">
        <BlogShareButton title={title} url={url} icon="/blog/share.svg" className="blog-share-native" />
        {networks.map((network) => (
          <a key={network.key} data-share={network.key} href={network.href} target="_blank" rel="noopener noreferrer" aria-label={network.label} className="blog-share-network">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src={`/blog/${network.key}.svg`} alt="" width={23} height={24} />
          </a>
        ))}
      </div>
    </section>
  );
}
