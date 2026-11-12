import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { SliderDots } from "@/components/slider-dots";
import { SliderIsland } from "@/components/slider-island";
import { filmSourceProps } from "@/lib/film-source";
import { heroHeadline, heroIntro } from "@/lib/hero-film";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { artworkProducts, resolveArtwork, type ProductPhotos } from "@/lib/template-media-defaults";

/** How long a slide stays before the next one, unless the shopper hovers or focuses the tile. */
const autoplayMs = 6000;

type Slide = { kind: "image" | "video"; video?: string; phoneVideo?: string; image?: string; alt: string; headline: string; intro: string };

/** The default slides' four stills: the opening still, then the Nimbus slideshow's three rooms. */
const defaultStills = ["home-workshop-poster", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining"] as const;

/** The staff's slides, skipping any draft that is not finished (a blank address would break the image). */
function authoredSlides(content: HomeDetails["hero"]): Slide[] {
  return (content.slides ?? []).flatMap((slide): Slide[] => {
    const image = slide.kind === "video" ? slide.poster : slide.src;
    if (!slide.src || !image) return [];
    const video = slide.kind === "video" ? { video: slide.src, ...(slide.mobileSrc ? { phoneVideo: slide.mobileSrc } : {}) } : {};
    return [{ kind: slide.kind, ...video, image, alt: slide.alt, headline: slide.headline, intro: slide.intro }];
  });
}

/**
 * The Keeri products whose photos the hero needs: none when staff have authored slides, else those standing in for
 * the default stills that have no upload.
 */
export function heroArtworkProducts(content: HomeDetails["hero"], media?: TemplateMedia): string[] {
  return authoredSlides(content).length ? [] : artworkProducts(defaultStills, media);
}

/**
 * The slides to show: the staff's, or, when there are none, four stills: each placement's upload, else a Keeri
 * product's photo (`photos`). There is no default film (the shop film was on Shopify); staff add one as a video slide with
 * a film from the media library. With no photo at all the one slide keeps its words over the tile's own colour.
 */
function resolveSlides(content: HomeDetails["hero"], media?: TemplateMedia, photos?: ProductPhotos): Slide[] {
  const authored = authoredSlides(content);
  if (authored.length) return authored;
  const stills = defaultStills.flatMap((key): Slide[] => {
    const artwork = resolveArtwork(key, media, photos);
    return artwork ? [{ kind: "image", image: artwork.image, alt: artwork.alt, headline: heroHeadline, intro: heroIntro }] : [];
  });
  return stills.length ? stills : [{ kind: "image", alt: "", headline: heroHeadline, intro: heroIntro }];
}

/**
 * The hero bento: the slides tile, a scroll-snap slider of slides each with its headline, then one light tile
 * per category. A server component; the slider's behaviour (dots, autoplay, playing only the current video)
 * is loaded lazily by the island and the tile works as a plain swipeable row without it.
 */
export function Hero({
  content = defaultHomeDetails.hero,
  media,
  photos,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia; photos?: ProductPhotos } = {}) {
  const slides = resolveSlides(content, media, photos);
  const many = slides.length > 1;
  return (
    <section className="hero-grid" data-hero-bento aria-label="Explore Maple furniture">
      <div
        className="hero-film"
        data-hero-film
        data-slider="hero"
        data-slider-autoplay={many ? autoplayMs : undefined}
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carousel" : undefined}
        aria-label={many ? "Featured slides" : undefined}
      >
        <div className="hero-slides" data-slider-track>
          {slides.map((slide, i) => (
            <div
              className="hero-slide"
              data-slider-slide
              data-hero-slide
              data-hero-slide-kind={slide.kind}
              data-active={i === 0 ? "true" : undefined}
              role={many ? "group" : undefined}
              aria-roledescription={many ? "slide" : undefined}
              aria-label={many ? `${i + 1} of ${slides.length}` : undefined}
              key={i}
            >
              {slide.image && <Image src={slide.image} alt={slide.alt} fill sizes="(max-width: 700px) 100vw, 50vw" preload={i === 0} />}
              {/* The poster is the picture above; the film covers it only once playing (lib/slider-behaviour.ts), so visitors
                  who ask for reduced motion, or whose browser has not run the slider yet, see the poster. A slide with a
                  phone film leaves the choice of cut to the slider's script (lib/film-source.ts). */}
              {slide.video && <video {...filmSourceProps(slide.video, slide.phoneVideo)} muted loop playsInline preload={i === 0 ? "metadata" : "none"} aria-hidden="true" data-hero-video="" />}
              <div className="hero-introduction">
                <h2 data-hero-headline>{slide.headline}</h2>
                <p data-hero-intro>{slide.intro}</p>
                <Link className="hero-cta" href="/nimbus-collection" data-fill-button="">
                  {content.cta} <ArrowRight aria-hidden size={17} />
                </Link>
              </div>
            </div>
          ))}
        </div>
        <SliderDots count={slides.length} data-hero-dots />
        <SliderIsland name="hero" />
      </div>
      <div className="hero-categories">
        {content.tiles.map(({ key, label }) => {
          const artwork = resolveHomeTemplateMedia(`home-hero-${key}`, media);
          return (
            <Link href={(key === "beds" ? "/collections/" : "/") + key} className="category-tile" data-hero-tile={key} key={key}>
              <Image src={artwork.image} alt={artwork.alt} fill sizes="(max-width: 700px) 48vw, 25vw" preload />
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
