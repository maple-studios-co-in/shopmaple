import type { CSSProperties } from "react";
import Link from "next/link";
import { defaultCollectionBannerLook, type CollectionBannerDisplay, type CollectionBannerLook, type CollectionFacets } from "@shopmaple/contracts";
import type { CollectionIntroCopy } from "@/lib/collection-intro";
import { getContentImageProps } from "@/components/content-image";
import { SiteWord } from "@/components/site-words";
import { ProductImage } from "./product-image";

/** The collection's first piece with a photo, which the banner shows until staff choose a picture of their own. */
export type CollectionCover = NonNullable<CollectionFacets["cover"]> & { width?: number; position?: string };
/** The picture staff chose for this collection's banner on the Artwork screen, and how it shows. */
export type CollectionBannerPicture = { image: string; mobileImage?: string; alt: string; display: CollectionBannerDisplay; look?: CollectionBannerLook };

/** The category pages' banner sizes (components/category-landing.tsx), so the browser fetches no bigger a file than shown. */
const sizes = "(min-width: 1440px) 1360px, (max-width: 749px) calc(100vw - 32px), calc(100vw - 80px)";

/** A picture filling the banner: on phones (where the banner is square) its phone picture when there is one. */
function BannerPicture({ picture, slot, alt }: { picture: CollectionBannerPicture; slot?: string; alt: string }) {
  const wide = getContentImageProps({ src: picture.image, alt, fill: true, sizes, loading: "eager", fetchPriority: "high" }).props;
  const phone = picture.mobileImage ? getContentImageProps({ src: picture.mobileImage, alt, fill: true, sizes, loading: "eager", fetchPriority: "high" }).props : null;
  return (
    <picture className="collection-banner-picture" data-media-slot={slot}>
      {/* An unoptimized picture (a staff preview of an unpublished upload) has no srcSet: its address stands in. */}
      {phone && <source media="(max-width: 768px)" srcSet={phone.srcSet ?? phone.src} sizes={phone.sizes} />}
      <img {...wide} />
    </picture>
  );
}

/** The rosette of the homepage's announcement strip, drawn large and faint where a banner has no photo. */
function Rosette() {
  return (
    <svg className="collection-banner-rosette" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.6">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => <ellipse key={angle} cx="12" cy="5.2" rx="2.1" ry="3.6" transform={`rotate(${angle} 12 12)`} />)}
      <circle cx="12" cy="12" r="3.6" />
      <rect x="10.8" y="10.8" width="2.4" height="2.4" fill="currentColor" stroke="none" transform="rotate(45 12 12)" />
    </svg>
  );
}

/**
 * The banner a collection page opens with (owner, 20 Nov 2026: "the hero banner needs to have size and padding exactly
 * like the banner" of the category pages). It takes the category pages' inset banner frame as it is: inside the page's
 * side margins, 2784 × 400 in shape (1360 × 195 at 1440px), the product cards' rounded corners, 30px above and below,
 * square on phones (styles/collection-parity.css). It replaces the full-width dark hero these pages had.
 *
 * - A picture staff chose on the Artwork screen (`slot`, one placement per collection page) shows as the whole banner
 *   with its own words, as the category pages' banners do, or (`display: "photo"`) as a photo behind the collection's
 *   name and line. The page's title is then still its heading, for search engines and screen readers.
 * - Until then the banner writes the trail, the collection's name and its line on Maple's burgundy, over the collection's
 *   first product photo when it has one.
 *
 * The whole banner names its placement, so in the live preview a click anywhere on it that is not on words opens that
 * picture's chooser, with or without a picture yet.
 */
export function CollectionBanner({ title, crumb, intro, cover, slot, picture }: {
  title: string; crumb: string; intro: CollectionIntroCopy; cover: CollectionCover | null | undefined; slot?: string; picture?: CollectionBannerPicture;
}) {
  const whole = picture?.display === "banner";
  const photo = picture ? "chosen" : cover?.image ? "piece" : "none";
  // How the words read over a photo staff chose (Artwork screen; owner, 25 Nov 2026): the shade, light or dark words, their
  // size and type style. Over the collection's own product photo, or no photo, the banner keeps the theme's look.
  const look = picture && !whole ? { ...defaultCollectionBannerLook, ...picture.look } : null;
  return (
    <div className="landing-banner-frame home-container" data-landing-banner="inset">
      <section data-store data-collection-banner={whole ? "banner" : "words"} data-banner-photo={photo} data-media-slot-area={slot}
        data-banner-shade={look?.shade} data-banner-tone={look?.tone} data-banner-size={look?.size} data-banner-font={look?.font}
        aria-labelledby="collection-banner-title" className="collection-banner">
        {whole ? (
          <>
            <BannerPicture picture={picture} slot={slot} alt={picture.alt} />
            <h1 id="collection-banner-title" className="sr-only">{title}</h1>
          </>
        ) : (
          <>
            {picture ? (
              <div className="collection-banner-photo" data-media-slot={slot}><BannerPicture picture={picture} alt="" /></div>
            ) : cover?.image ? (
              <div className="collection-banner-photo" data-media-slot={slot} style={{ "--banner-position": cover.position ?? "center" } as CSSProperties}>
                <ProductImage src={cover.image} alt="" fill preload sizes={sizes} />
              </div>
            ) : <Rosette />}
            {look?.shade !== "none" && <div className="collection-banner-shade" aria-hidden="true" />}
            <div className="collection-banner-copy">
              <nav aria-label="Breadcrumb" className="collection-banner-trail">
                <ol>
                  <li><Link href="/"><SiteWord k="collection.hero.breadcrumbHome" /></Link></li>
                  <li aria-hidden="true">/</li>
                  <li><Link href="/collections/all"><SiteWord k="collection.hero.breadcrumbAll" /></Link></li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page">{crumb}</li>
                </ol>
              </nav>
              <h1 id="collection-banner-title">{title}</h1>
              <p data-banner-line><SiteWord k={intro.word} /></p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
