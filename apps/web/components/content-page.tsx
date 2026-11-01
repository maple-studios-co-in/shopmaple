import type { ContentPage as Page } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { AuthoredArticleBody } from "./authored-article-body";
import { StoreContent } from "./store-content";
export function ContentPage({ page }: { page: Page }) {
  return (
    <article className="content-page home-container">
      <header>
        <h1>{page.title}</h1>
        {page.description && <p>{page.description}</p>}
      </header>
      {page.banner && (
        <Link className="content-page-banner" href={page.banner.href}>
          <picture>
            <source
              media="(max-width:749px)"
              srcSet={page.banner.mobileImage}
            />
            <Image
              src={page.banner.desktopImage}
              alt={page.banner.alt}
              width={1600}
              height={700}
              sizes="100vw"
            />
          </picture>
          <span>{page.banner.label}</span>
        </Link>
      )}
      <div className={page.content || page.blocks ? "content-page-copy store-prose" : "content-page-copy"}>
        {page.content ? <StoreContent nodes={page.content} /> : page.blocks ? <AuthoredArticleBody blocks={page.blocks} /> : page.body
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
      </div>
    </article>
  );
}
