import { ContentImage as Image, getContentImageProps } from "@/components/content-image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HeroCaption, HomeDetails, TemplateMedia, TemplateMediaKey } from "@shopmaple/contracts";
import { SiteWord } from "@/components/site-words";
import { SliderArrows } from "@/components/slider-arrows";
import { SliderDots } from "@/components/slider-dots";
import { SliderIsland } from "@/components/slider-island";
import { filmSourceProps } from "@/lib/film-source";
import { heroHeadline, heroIntro } from "@/lib/hero-film";
import {
  defaultHeroCaption, heroAutoplayMs, heroCaptionOf, heroCollectionPage, heroDefaultStillKeys, heroDefaultStills, heroSlideStill,
  heroStillCollection, type HeroCollection,
} from "@/lib/hero-slides";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { artworkProducts, resolveArtwork, type ProductPhotos } from "@/lib/template-media-defaults";

type Slide = {
  kind: "image" | "video"; video?: string; phoneVideo?: string; image?: string; phoneImage?: string; alt: string;
  /** The default stills name their collection (its Site word, over the headline); staff slides write their own label. */
  collection?: HeroCollection; eyebrow?: string; headline?: string; intro?: string;
  button: { label: string; href: string } | null;
  caption: HeroCaption;
  /** The Artwork placement a default still shows, or the staff slide it is (`hero-slide:<index>`), for the live preview. */
  slot?: string; target?: string;
};

const collectionLabel = { nimbus: "home.hero.nimbusLabel", terra: "home.hero.terraLabel" } as const;
const sizes = "(max-width: 700px) 100vw, 50vw";

/**
 * The staff's slides, each as it shows. An image slide without its own picture shows Maple's photo it names, else the one
 * for its place (the default stills in turn); a video slide plays its film over its poster. A draft slide that is not finished (a video
 * without its film) is skipped, so a blank address never breaks the page.
 */
function authoredSlides(content: HomeDetails["hero"], media?: TemplateMedia, photos?: ProductPhotos): Slide[] {
  return (content.slides ?? []).flatMap((slide, index): Slide[] => {
    if (slide.kind === "video" && !slide.src) return [];
    const still = slide.kind === "image" && !slide.src ? resolveArtwork(heroSlideStill(slide, index).key, media, photos) : null;
    const image = slide.kind === "video" ? slide.poster : slide.src || still?.image;
    const video = slide.kind === "video" ? { video: slide.src, ...(slide.mobileSrc ? { phoneVideo: slide.mobileSrc } : {}) } : {};
    // Maple's photo shows as the default stills do (one picture for every screen); a staff picture may have a phone one.
    const phoneImage = slide.kind === "image" && slide.src ? slide.mobileImage : undefined;
    // Slides from before buttons were their own keep the hero's button to the Nimbus page; `null` is "no button".
    const button = slide.button === undefined ? { label: content.cta, href: heroCollectionPage() } : slide.button;
    return [{
      kind: slide.kind, ...video, ...(image ? { image } : {}), ...(phoneImage && phoneImage !== image ? { phoneImage } : {}),
      // Maple's photo keeps its own description; a staff picture without one is decoration beside the slide's words.
      alt: slide.alt ?? (slide.src ? "" : still?.alt ?? ""),
      eyebrow: slide.eyebrow, headline: slide.headline, intro: slide.intro, button, caption: heroCaptionOf(slide), target: `hero-slide:${index}`,
    }];
  });
}

/**
 * The Keeri products whose photos the hero needs: those standing in for Maple's photos that have no upload, for the
 * default stills, or for the staff slides that show one of Maple's photos.
 */
export function heroArtworkProducts(content: HomeDetails["hero"], media?: TemplateMedia): string[] {
  const slides = content.slides ?? [];
  if (!slides.length) return artworkProducts(heroDefaultStillKeys, media);
  const places = slides.flatMap((slide, index) => (slide.kind === "image" && !slide.src ? [heroSlideStill(slide, index).key] : []));
  return artworkProducts([...new Set(places)] as TemplateMediaKey[], media);
}

/**
 * The slides to show: the staff's, or, when there are none, the default stills: each placement's upload, else a Keeri
 * product's photo (`photos`). There is no default film (the shop film was on Shopify); staff add one as a video slide with
 * a film from the media library. With no photo at all the one slide keeps its words over the tile's own colour.
 */
function resolveSlides(content: HomeDetails["hero"], media?: TemplateMedia, photos?: ProductPhotos): Slide[] {
  const authored = authoredSlides(content, media, photos);
  if (authored.length) return authored;
  // The staff's own words when they have written them (Homepage > Hero, or click-to-edit in the live preview), else the theme's.
  const headline = content.headline ?? heroHeadline, intro = content.intro ?? heroIntro;
  const stills = heroDefaultStills.flatMap((still): Slide[] => {
    const artwork = resolveArtwork(still.key, media, photos);
    const collection = heroStillCollection(still);
    return artwork ? [{
      kind: "image", image: artwork.image, alt: artwork.alt, headline, intro, slot: still.key, caption: defaultHeroCaption,
      button: { label: content.cta, href: heroCollectionPage(collection) }, ...(collection ? { collection } : {}),
    }] : [];
  });
  return stills.length ? stills : [{ kind: "image", alt: "", headline, intro, caption: defaultHeroCaption, button: { label: content.cta, href: heroCollectionPage() } }];
}

/**
 * A slide's picture. With a phone picture it is a `<picture>`: phones (up to 749px wide) load only the phone one and
 * larger screens only the wide one.
 */
function SlidePicture({ slide, first }: { slide: Slide; first: boolean }) {
  if (!slide.image) return null;
  if (!slide.phoneImage) return <Image src={slide.image} alt={slide.alt} fill sizes={sizes} preload={first} data-media-slot={slide.slot} />;
  const loading = { loading: first ? "eager" : "lazy", fetchPriority: first ? "high" : "auto" } as const;
  const wide = getContentImageProps({ src: slide.image, alt: slide.alt, fill: true, sizes, ...loading }).props;
  const phone = getContentImageProps({ src: slide.phoneImage, alt: slide.alt, fill: true, sizes, ...loading }).props;
  return (
    <picture>
      {/* An unoptimized picture (a staff preview of an unpublished upload) has no srcSet: its address stands in. */}
      <source media="(max-width: 749px)" srcSet={phone.srcSet ?? phone.src} sizes={phone.sizes} />
      <img {...wide} />
    </picture>
  );
}

/**
 * The slide's words where staff put them, as they chose them to read; nothing at all for a slide without words. A staff
 * slide's words name their field in the editor (`data-edit-field`), so a click on them in the live preview types into that
 * slide's own field even when several slides say the same.
 */
function SlideWords({ slide }: { slide: Slide }) {
  const { collection, eyebrow, headline, intro, button, target } = slide;
  if (!collection && !eyebrow && !headline && !intro && !button) return null;
  const field = (part: string) => (target ? `${target}:${part}` : undefined);
  return (
    <div className="hero-introduction">
      {collection
        ? <p className="hero-eyebrow" data-hero-eyebrow={collection}><SiteWord k={collectionLabel[collection]} /></p>
        : eyebrow && <p className="hero-eyebrow" data-hero-eyebrow="" data-edit-field={field("eyebrow")}>{eyebrow}</p>}
      {headline && <h2 data-hero-headline data-edit-field={field("headline")}>{headline}</h2>}
      {intro && <p data-hero-intro data-edit-field={field("intro")}>{intro}</p>}
      {button && (
        <Link className="hero-cta" href={button.href} data-fill-button="">
          <span data-hero-button data-edit-field={field("button")}>{button.label}</span> <ArrowRight aria-hidden size={17} />
        </Link>
      )}
    </div>
  );
}

/**
 * The hero bento: the slides tile, a scroll-snap slider of slides each with its words, then one light tile per category.
 * A server component; the slider's behaviour (dots, arrows, autoplay, playing only the current video) is loaded lazily by
 * the island and the tile works as a plain swipeable row without it. Each slide says where its words sit and how they
 * read (`data-caption-*`, styles/home-slides.css); the default stills use the theme's own look.
 */
export function Hero({
  content = defaultHomeDetails.hero,
  media,
  photos,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia; photos?: ProductPhotos } = {}) {
  const slides = resolveSlides(content, media, photos);
  const many = slides.length > 1;
  // The slider's script holds the slides, dots and films it found; a draft preview that redraws in place with other
  // slides attaches it again (the key), keeping the slide in view.
  const shape = `${slides.length}|${slides.map(slide => slide.video ? `${slide.video}${slide.phoneVideo ?? ""}` : "").join(",")}`;
  return (
    <section className="hero-grid" data-hero-bento aria-label="Explore Maple furniture">
      <div
        className="hero-film"
        data-hero-film
        data-slider="hero"
        data-slider-autoplay={many ? heroAutoplayMs : undefined}
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carousel" : undefined}
        aria-label={many ? "Featured slides" : undefined}
      >
        <div className="hero-slides" data-slider-track>
          {slides.map((slide, i) => {
            const words = Boolean(slide.collection || slide.eyebrow || slide.headline || slide.intro || slide.button);
            return (
              <div
                className="hero-slide"
                data-slider-slide
                data-hero-slide
                data-hero-slide-kind={slide.kind}
                data-caption-position={slide.caption.position}
                data-caption-tone={slide.caption.tone}
                data-caption-shade={words ? slide.caption.shade : "none"}
                data-caption-size={slide.caption.size}
                data-picture-target={slide.target}
                data-active={i === 0 ? "true" : undefined}
                role={many ? "group" : undefined}
                aria-roledescription={many ? "slide" : undefined}
                aria-label={many ? `${i + 1} of ${slides.length}` : undefined}
                key={i}
              >
                <SlidePicture slide={slide} first={i === 0} />
                {/* The poster is the picture above; the film covers it only once playing (lib/slider-behaviour.ts), so
                    visitors who ask for reduced motion, or whose browser has not run the slider yet, see the poster. A slide
                    with a phone film leaves the choice of cut to the slider's script (lib/film-source.ts). */}
                {slide.video && <video {...filmSourceProps(slide.video, slide.phoneVideo)} muted loop playsInline preload={i === 0 || !slide.image ? "metadata" : "none"} aria-hidden="true" data-hero-video="" data-hero-poster={slide.image ? undefined : "none"} />}
                <SlideWords slide={slide} />
              </div>
            );
          })}
        </div>
        <SliderArrows count={slides.length} data-hero-arrows />
        <SliderDots count={slides.length} data-hero-dots />
        <SliderIsland name="hero" key={shape} />
      </div>
      <div className="hero-categories">
        {content.tiles.map(({ key, label }) => {
          const artwork = resolveHomeTemplateMedia(`home-hero-${key}`, media);
          return (
            <Link href={(key === "beds" ? "/collections/" : "/") + key} className="category-tile" data-hero-tile={key} key={key}>
              <Image src={artwork.image} alt={artwork.alt} fill sizes="(max-width: 700px) 48vw, 25vw" preload data-media-slot={`home-hero-${key}`} />
              <div>
                <h2 data-hero-tile-title>{label}</h2>
                <p data-hero-tile-cta>View Collection <ArrowRight aria-hidden size={12} /></p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
