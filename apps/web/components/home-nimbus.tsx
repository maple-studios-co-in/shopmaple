import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { SliderDots } from "@/components/slider-dots";
import { SliderIsland } from "@/components/slider-island";
import { shopFile } from "@/lib/format";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { homeTemplateMedia, resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

/** The big word over the bundled cloud photo: the collection name without "The" and "Collection". */
const nimbusWord = (heading: string) => heading.replace(/^the\s+/i, "").replace(/\s+collection$/i, "") || heading;

type Card = { id: string; heading: string; tagline: string; features: readonly string[]; cta: string; href: string; image: string; mobileImage?: string; alt: string };

/**
 * The Nimbus slider: the base card, driven by the Nimbus fields and template artwork, then any extra
 * collections the staff added. A server component holding every card in a scroll-snap row; the lazy
 * island (components/slider-island.tsx) adds the dots and opens and closes each card's detail panel.
 * Hover and focus still reveal the panel with CSS alone.
 */
export function HomeNimbus({
  content = defaultHomeDetails.nimbus,
  media,
}: { content?: HomeDetails["nimbus"]; media?: TemplateMedia } = {}) {
  const artwork = resolveHomeTemplateMedia("home-nimbus", media);
  // The bundled photo has no lettering, so the name is live text; staff artwork keeps whatever it carries.
  const liveWord = artwork.image === homeTemplateMedia["home-nimbus"].image;
  const cards: Card[] = [
    { id: "nimbus-details", heading: content.heading, tagline: content.tagline, features: content.features, cta: content.cta, href: "/pages/nimbus-collection", image: artwork.image, mobileImage: artwork.mobileImage, alt: artwork.alt },
    // An extra slide with no artwork yet (a draft in the editor) has nothing to show, so it is left out.
    ...(content.slides ?? []).filter(slide => slide.image).map((slide, i) => ({ id: `nimbus-details-${i + 2}`, ...slide })),
  ];
  return (
    <section className="home-nimbus-wrap" aria-label="The Nimbus Collection">
      <div className="home-nimbus-stage" data-slider="nimbus" data-slider-count={cards.length}>
        <div className="home-nimbus-track" data-slider-track>
          {cards.map((card, i) => (
            <div className="home-nimbus" data-slider-slide data-nimbus-slide data-active={i === 0 ? "true" : undefined} key={card.id}>
              <picture className="home-nimbus-media">
                {card.mobileImage && <source media="(max-width: 767px)" srcSet={card.mobileImage} />}
                <img src={card.image} alt={card.alt} loading="lazy" />
              </picture>
              <button
                type="button"
                className="home-nimbus-toggle"
                data-slider-toggle
                data-label-open="Close Nimbus collection details"
                data-label-closed="Explore the Nimbus Collection"
                aria-expanded="false"
                aria-controls={card.id}
                aria-label="Explore the Nimbus Collection"
              >
                <ChevronUp />
              </button>
              {i === 0 && liveWord && <p className="home-nimbus-title" data-nimbus-title aria-hidden="true">{nimbusWord(card.heading)}</p>}
              <p className="home-nimbus-lead" data-nimbus-lead>{card.tagline}</p>
              <Link className="home-nimbus-explore" href={card.href} data-nimbus-explore>{card.cta}</Link>
              <div className="home-nimbus-content" id={card.id}>
                <h2>{card.heading}</h2>
                <p>{card.tagline}</p>
                <div className="home-nimbus-icons">
                  {card.features.map((label, n) => (
                    <div key={n}>
                      <Image src={shopFile(`Maple_Banner_${13 + n}.svg`)} alt="" width={75} height={75} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <Link className="button" href={card.href} data-slider-focus-opens>{card.cta}</Link>
              </div>
            </div>
          ))}
        </div>
        <SliderDots count={cards.length} />
        <SliderIsland name="nimbus" />
      </div>
    </section>
  );
}
