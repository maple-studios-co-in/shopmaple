import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { HeroFilm } from "@/components/hero-film";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

export { heroFilm } from "@/components/hero-film";

/** Fixed copy from the Impact Layout frame; the admin's hero fields cover the button and the tiles. */
const headline = "Timeless Craftsmanship for Modern Living";
const intro = "Handcrafted furniture that brings elegance to every corner of your home.";

/** The hero bento: the film tile with its headline, then one light tile per category. A server component; only the film is client code. */
export function Hero({
  content = defaultHomeDetails.hero,
  media,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia } = {}) {
  const poster = resolveHomeTemplateMedia("home-workshop-poster", media);
  return (
    <section className="hero-grid" data-hero-bento aria-label="Explore Maple furniture">
      <div className="hero-film" data-hero-film>
        <Image src={poster.image} alt={poster.alt} fill sizes="(max-width: 700px) 100vw, 50vw" preload />
        <HeroFilm />
        <div className="hero-introduction">
          <h2 data-hero-headline>{headline}</h2>
          <p data-hero-intro>{intro}</p>
          <Link className="hero-cta" href="/pages/nimbus-collection">
            {content.cta} <ArrowRight aria-hidden size={17} />
          </Link>
        </div>
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
