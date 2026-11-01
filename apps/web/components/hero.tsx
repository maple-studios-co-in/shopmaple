import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { SliderDots } from "@/components/slider-dots";
import { SliderIsland } from "@/components/slider-island";
import { heroFilm } from "@/lib/hero-film";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

/** Copy of the one default slide, from the Impact Layout frame; staff slides carry their own words. */
const headline = "Timeless Craftsmanship for Modern Living";
const intro = "Handcrafted furniture that brings elegance to every corner of your home.";
/** How long a slide stays before the next one, unless the shopper hovers or focuses the tile. */
const autoplayMs = 6000;

type Slide = { kind: "image" | "video"; video?: string; image: string; alt: string; headline: string; intro: string };

/**
 * The slides to show: the staff's, skipping any draft that is not finished (a blank address would break the
 * image), or the shop film alone when there are none.
 */
function resolveSlides(content: HomeDetails["hero"], media?: TemplateMedia): Slide[] {
  const authored = (content.slides ?? []).flatMap((slide): Slide[] => {
    const image = slide.kind === "video" ? slide.poster : slide.src;
    if (!slide.src || !image) return [];
    return [{ kind: slide.kind, video: slide.kind === "video" ? slide.src : undefined, image, alt: slide.alt, headline: slide.headline, intro: slide.intro }];
  });
  if (authored.length) return authored;
  const poster = resolveHomeTemplateMedia("home-workshop-poster", media);
  return [{ kind: "video", video: heroFilm, image: poster.image, alt: poster.alt, headline, intro }];
}

/**
 * The hero bento: the film tile, a scroll-snap slider of slides each with its headline, then one light tile
 * per category. A server component; the slider's behaviour (dots, autoplay, playing only the current video)
 * is loaded lazily by the island and the tile works as a plain swipeable row without it.
 */
export function Hero({
  content = defaultHomeDetails.hero,
  media,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia } = {}) {
  const slides = resolveSlides(content, media);
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
              <Image src={slide.image} alt={slide.alt} fill sizes="(max-width: 700px) 100vw, 50vw" preload={i === 0} />
              {slide.video && <video src={slide.video} muted loop playsInline preload={i === 0 ? "metadata" : "none"} aria-hidden="true" />}
              <div className="hero-introduction">
                <h2 data-hero-headline>{slide.headline}</h2>
                <p data-hero-intro>{slide.intro}</p>
                <Link className="hero-cta" href="/pages/nimbus-collection">
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
            <Link href={(key === "beds" ? "/collections/" : "/pages/") + key} className="category-tile" data-hero-tile={key} key={key}>
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
