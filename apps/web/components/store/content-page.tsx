import type { ContentPage as Page } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { AuthoredArticleBody } from "./authored-article-body";
import { storeProse } from "./current-look";

// Paragraphs keep the author's line breaks. Plain body copy is spaced here; structured blocks use
// the shared prose, whose paragraph margins win.
const lineBreaks = "[&_p]:leading-[1.8] [&_p]:whitespace-pre-line";
const plainCopy = `${lineBreaks} [&_p]:my-6 [&_p]:wrap-anywhere`;
const structuredCopy = `${lineBreaks} ${storeProse}`;

export function ContentPage({ page }: { page: Page }) {
  return (
    <article data-store data-content-page className="mx-auto min-h-[55vh] max-w-[1440px] px-10 py-16 max-[750px]:px-4">
      <header className="mx-auto mb-8 max-w-[800px] text-center">
        <h1 className="font-serif text-[clamp(2rem,5vw,4rem)] font-medium leading-[1.1] tracking-[-0.025em]">{page.title}</h1>
        {page.description && <p className="mt-5 mb-2.5">{page.description}</p>}
      </header>
      {page.banner && (
        <Link data-content-banner className="group relative block overflow-hidden rounded-[16px]" href={page.banner.href}>
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
              className="block h-auto max-h-[620px] w-full object-cover motion-safe:[@media(hover:hover)]:transition-[transform] motion-safe:[@media(hover:hover)]:duration-[350ms] motion-safe:[@media(hover:hover)]:ease-[ease] motion-safe:group-hover:[transform:scale(1.025)]"
            />
          </picture>
          <span className="absolute bottom-6 left-6 rounded-[4px] bg-white px-5 py-3 text-[#3d1914]">{page.banner.label}</span>
        </Link>
      )}
      <div data-content-copy className={`mx-auto my-10 max-w-[760px] ${page.blocks ? structuredCopy : plainCopy}`}>
        {page.blocks ? <AuthoredArticleBody blocks={page.blocks} /> : page.body
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
      </div>
    </article>
  );
}
