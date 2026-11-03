import Link from "next/link";
import type { CSSProperties } from "react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { homeTemplateMedia, resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

/** The big word over a collection's photo: its name without "The" and "Collection". */
const collectionWord = (heading: string) => heading.replace(/^the\s+/i, "").replace(/\s+collection$/i, "") || heading;

/** How long each collection holds the stage while the ring round its number fills. */
export const stageIntervalMs = 5200;

type Card = { id: string; heading: string; tagline: string; cta: string; href: string; image: string; mobileImage?: string; alt: string; word: string | null };

/**
 * The collections stage ("x-slideshow" in the Impact Layout frame): a rounded card on a band of the same photo,
 * blurred, with the collection's tagline, its name in large letters and an Explore button. Several
 * collections take turns: the rings round the current number and the arrow fill, and when they close the next
 * photo and words fade in (components/home-effects-island.tsx loads that behaviour after hydration). Without
 * script it is the first collection, complete.
 */
export function HomeNimbus({
  content = defaultHomeDetails.nimbus,
  media,
}: { content?: HomeDetails["nimbus"]; media?: TemplateMedia } = {}) {
  const artwork = resolveHomeTemplateMedia("home-nimbus", media);
  // The bundled photo has no lettering, so the name is live text; staff artwork keeps whatever it carries.
  const liveWord = artwork.image === homeTemplateMedia["home-nimbus"].image;
  const cards: Card[] = [
    { id: "nimbus", heading: content.heading, tagline: content.tagline, cta: content.cta, href: "/pages/nimbus-collection", image: artwork.image, mobileImage: artwork.mobileImage, alt: artwork.alt, word: liveWord ? collectionWord(content.heading) : null },
    // An extra slide with no artwork yet (a draft in the editor) has nothing to show, so it is left out.
    ...(content.slides ?? []).filter(slide => slide.image).map((slide, i): Card => ({
      id: `nimbus-${i + 2}`, heading: slide.heading, tagline: slide.tagline, cta: slide.cta, href: slide.href,
      image: slide.image, mobileImage: slide.mobileImage, alt: slide.alt, word: collectionWord(slide.heading),
    })),
  ];
  const many = cards.length > 1;
  return (
    <section className="home-nimbus-wrap" aria-label={many ? "Featured collections" : content.heading}>
      <div
        className="nimbus-stage"
        data-stage
        style={{ "--stage-interval": `${stageIntervalMs}ms` } as CSSProperties}
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carousel" : undefined}
        aria-label={many ? "Collections" : undefined}
      >
        {/* The collection's own photo, blurred, fills the band round the card, as in the frame ("Maple imagery"). */}
        <div className="nimbus-stage-backdrops" aria-hidden="true">
          {cards.map((card, i) => (
            <img key={card.id} className="nimbus-stage-backdrop" data-stage-backdrop data-active={i === 0 ? "" : undefined}
              src={card.image} alt="" loading="lazy" decoding="async" />
          ))}
        </div>
        <div className="nimbus-stage-frame" data-stage-frame>
          {cards.map((card, i) => (
            <article
              key={card.id}
              className="nimbus-stage-slide"
              data-stage-slide
              data-nimbus-slide
              data-active={i === 0 ? "" : undefined}
              inert={i === 0 ? undefined : true}
              aria-hidden={i === 0 ? undefined : true}
              aria-roledescription={many ? "slide" : undefined}
              aria-label={many ? `${i + 1} of ${cards.length}` : undefined}
            >
              <picture className="nimbus-stage-media">
                {card.mobileImage && <source media="(max-width: 767px)" srcSet={card.mobileImage} />}
                <img src={card.image} alt={card.alt} loading="lazy" decoding="async" />
              </picture>
              <div className="nimbus-stage-copy">
                <p className="nimbus-stage-tagline" data-nimbus-lead>{card.tagline}</p>
                {card.word
                  ? <h2 className="nimbus-stage-word" data-nimbus-title><span aria-hidden="true" data-nimbus-word>{card.word}</span><span className="sr-only" data-nimbus-heading>{card.heading}</span></h2>
                  : <h2 className="sr-only" data-nimbus-heading>{card.heading}</h2>}
                <Link className="nimbus-stage-cta" href={card.href} data-nimbus-explore data-fill-button="">{card.cta}</Link>
              </div>
            </article>
          ))}
          {many && (
            // The arrow: its ring fills with the slide's time, and a press moves on. On a desktop it follows the
            // pointer across the photo, as in the owner's reference; otherwise it rests at the right edge.
            <button type="button" className="nimbus-stage-next" data-stage-next aria-label="Next collection">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="30" data-next-track />
                <circle cx="32" cy="32" r="30" data-ring-progress data-next-progress pathLength={100} />
              </svg>
              <svg className="nimbus-stage-next-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5" /></svg>
            </button>
          )}
          {many && (
            <div className="nimbus-stage-dots" data-stage-dots>
              {cards.map((card, i) => (
                <button type="button" key={card.id} data-stage-dot aria-label={`Show ${card.heading}`} aria-current={i === 0 ? "true" : undefined}>
                  <svg viewBox="0 0 32 32" aria-hidden="true">
                    <circle cx="16" cy="16" r="15" data-ring-track />
                    <circle cx="16" cy="16" r="15" data-ring-progress pathLength={100} />
                  </svg>
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
