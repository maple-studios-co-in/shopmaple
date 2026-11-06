import type { CSSProperties } from "react";
import Link from "next/link";
import type { CollectionFacets } from "@shopmaple/contracts";
import { shopMoney } from "@/lib/format";
import type { CollectionIntroCopy } from "@/lib/collection-intro";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

/** The hero's photo and its piece; `width` (the photo's own pixels) and `position` come with a chosen photo. */
export type HeroCover = NonNullable<CollectionFacets["cover"]> & { width?: number; position?: string };

/**
 * Frame 105:484 ("Collection hero / Immersive chairs"): one of the collection's pieces fills the width under a dark
 * gradient, with the trail, the collection's name and its line on the left, and that piece featured on the right with
 * its price and a way to it. A photo of known size is never drawn wider than its own pixels: on a wider screen it keeps
 * to the right and fades into the dark behind the title, so it stays sharp.
 */
export function CollectionHero({ title, crumb, intro, cover }: { title: string; crumb: string; intro: CollectionIntroCopy; cover: HeroCover | null | undefined }) {
  return (
    <section data-store data-collection-hero aria-labelledby="collection-hero-title" className="relative isolate flex min-h-[420px] overflow-hidden bg-espresso font-text text-white lg:h-[500px]">
      {cover && (
        <div data-hero-photo className={cx("absolute inset-y-0 right-0 -z-10 w-full [&_img]:object-cover [&_img]:[object-position:var(--hero-position)]", cover.width ? "[mask-image:linear-gradient(to_right,transparent,#000_24%)]" : undefined)}
          style={{ maxWidth: cover.width ? `${cover.width}px` : undefined, "--hero-position": cover.position ?? "center" } as CSSProperties}>
          <ProductImage src={cover.image} alt="" fill preload sizes={cover.width ? `min(100vw, ${cover.width}px)` : "100vw"} />
        </div>
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(20_14_10/0.8)_0%,rgb(20_14_10/0.28)_58%,rgb(20_14_10/0.16)_100%)]" />
      <div className="mx-auto flex w-full max-w-[1440px] wide:max-w-none items-end justify-between gap-10 px-4 pt-24 pb-10 md:px-12 lg:items-center lg:px-16 lg:py-0">
        <div className="flex max-w-[850px] flex-col items-start gap-4 lg:gap-[26px]">
          <nav aria-label="Breadcrumb" className="text-[14px] leading-[1.35] font-medium md:text-[16px]">
            <ol className="m-0 flex list-none flex-wrap items-center gap-x-3 p-0">
              <li><Link href="/" className="text-white no-underline hover:underline">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li><Link href="/collections/all" className="text-white no-underline hover:underline">Collections</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{crumb}</li>
            </ol>
          </nav>
          <h1 id="collection-hero-title" className="m-0 text-[38px] leading-[1.15] font-medium md:text-[48px] lg:text-[58px] lg:leading-[1.35]">{title}</h1>
          <p data-hero-line className="m-0 text-[18px] leading-[1.35] font-medium md:text-[24px]">{intro.heading}</p>
        </div>
        {cover?.handle && (
          <aside data-featured-product aria-label="Featured product" className="hidden w-[260px] shrink-0 flex-col items-center gap-4 rounded-[24px] bg-[rgb(48_38_33/0.64)] p-6 text-center backdrop-blur-[9px] lg:flex">
            <p className="m-0 text-[16px] leading-[1.35] font-semibold">Featured product</p>
            <span className="relative block size-[136px] overflow-hidden rounded-full [&_img]:object-cover">
              <ProductImage src={cover.image} alt={cover.title} fill sizes="136px" />
            </span>
            <p className="m-0 w-full font-heading text-[20px] leading-[1.35] font-medium">{cover.title}</p>
            {cover.pricePaise != null && <p className="m-0 text-[19px] leading-[1.35] font-medium">{cover.priceFrom ? "From " : ""}{shopMoney(cover.pricePaise)}</p>}
            <Link href={`/products/${cover.handle}`} className="text-[14px] leading-[1.35] font-medium text-white underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Discover the {intro.noun} →
            </Link>
          </aside>
        )}
      </div>
    </section>
  );
}
