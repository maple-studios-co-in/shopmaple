import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { StoryPageContent, StoryPrincipleKey, StorySectionKey, TemplateMedia } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { HomeCities } from "@/components/home-sections";
import { StoryJourneySlider } from "@/components/story-journey";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

/** The contact page's enquiry, already about a custom piece, as the menu's Custom Furniture opens it. */
const conversationHref = `/pages/contact?${new URLSearchParams({ product: "Custom furniture" })}`;
const principleIcons: Record<StoryPrincipleKey, string> = {
  handmade: "/media/our-story/handmade.svg",
  "unique-designs": "/media/our-story/unique-designs.svg",
  "bespoke-pieces": "/media/our-story/bespoke-pieces.svg",
};

function Lines({ lines }: { lines: readonly string[] }) {
  return lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>);
}
/** Text where a blank line starts a paragraph and a single line break stays a break. */
function Paragraphs({ text }: { text: string }) {
  return text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
    .map((part, index) => <p key={index}><Lines lines={part.split("\n")} /></p>);
}
/** A small label over a heading ("Our Story / Made in Delhi"), the slash set apart as in the design. */
function Eyebrow({ parts }: { parts: readonly ReactNode[] }) {
  return (
    <p className="story-eyebrow">
      {parts.map((part, index) => <Fragment key={index}>{index > 0 && <> <span className="story-eyebrow-slash" aria-hidden="true">/</span> </>}{part}</Fragment>)}
    </p>
  );
}
const slashed = (text: string) => text.split("/").map(part => part.trim()).filter(Boolean);

/**
 * Our Story (Figma 293:1093, owner 10 Nov 2026): the opening beside Maple's own photo, three principles, the belief,
 * the journey as a timeline slider (293:1434), the cities served and an invitation to start a piece. Staff choose the
 * regions' order and visibility and every word; the photos are template artwork.
 */
export function StoryLanding({ content, media }: { content?: StoryPageContent; media?: TemplateMedia } = {}) {
  const page = resolveStoryPageContent(content);
  const shown = new Set(page.sections.filter(item => item.enabled).map(item => item.key));
  const opening = resolveTemplateMedia("story-hero", media);
  const belief = resolveTemplateMedia("story-belief", media);
  const regions: Record<StorySectionKey, ReactNode> = {
    hero: (
      <section className="story-hero" data-story-section="hero" data-store>
        <div className="story-hero-intro">
          <Eyebrow parts={slashed(page.heroEyebrow)} />
          <h1 className="story-hero-title"><Lines lines={page.heroHeading} /></h1>
          <p className="story-hero-tagline">{page.tagline}</p>
          <p className="story-hero-body">{page.heroBody}</p>
          {shown.has("journey") && <a className="story-button story-hero-cta" href="#maple-journey" data-fill-button="">{page.heroCta}</a>}
        </div>
        <div className="story-hero-media">
          <Image src={opening.image} alt={opening.alt} width={1200} height={1200} sizes="(max-width: 899px) calc(100vw - 40px), 44vw" preload />
        </div>
      </section>
    ),
    principles: (
      <section className="story-principles" data-story-section="principles" aria-labelledby="story-principles-title" data-store>
        <h2 className="sr-only" id="story-principles-title">What makes Maple different</h2>
        <ul className="story-principles-list">
          {page.principles.map(item => (
            <li key={item.key} className="story-principle">
              {/* eslint-disable-next-line @next/next/no-img-element -- the design's 80px line drawing */}
              <img src={principleIcons[item.key]} width={80} height={80} alt="" loading="lazy" decoding="async" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    ),
    "belief-film": (
      <section className="story-belief" data-story-section="belief-film" data-store>
        <div className="story-belief-media">
          <Image src={belief.image} alt={belief.alt} width={1080} height={1920} sizes="(max-width: 699px) min(520px, calc(100vw - 40px)), 38vw" />
        </div>
        <div className="story-belief-copy">
          <Eyebrow parts={slashed(page.beliefEyebrow)} />
          <h2 className="story-belief-title"><Lines lines={page.beliefHeading} /></h2>
          <div className="story-belief-body"><Paragraphs text={page.beliefBody} /></div>
        </div>
      </section>
    ),
    journey: (
      <section className="story-journey" id="maple-journey" data-story-section="journey" aria-labelledby="story-journey-title" data-store>
        <Eyebrow parts={slashed(page.journeyEyebrow)} />
        <h2 className="story-journey-title" id="story-journey-title">{page.journeyHeading}</h2>
        <StoryJourneySlider label={page.journeyEyebrow} markers={page.timeline.map(chapter => ({ key: chapter.key, label: chapter.date }))}>
          {page.timeline.map(chapter => {
            const art = resolveTemplateMedia(`story-${chapter.key}`, media);
            return (
              <article key={chapter.key} className="story-chapter" data-story-chapter={chapter.key}>
                <div className="story-chapter-media">
                  <Image src={art.image} alt={art.alt} width={1024} height={1024} sizes="(max-width: 699px) calc(100vw - 40px), 39vw" loading="lazy" draggable={false} />
                </div>
                <div className="story-chapter-copy">
                  <Eyebrow parts={["Story", <span key="date" className="story-eyebrow-date">{chapter.date}</span>]} />
                  <h3 className="story-chapter-title"><Lines lines={chapter.title.split("\n")} /></h3>
                  <div className="story-chapter-body"><Paragraphs text={chapter.body} /></div>
                </div>
              </article>
            );
          })}
        </StoryJourneySlider>
      </section>
    ),
    cities: (
      <div className="story-cities" data-story-section="cities">
        <HomeCities media={media} />
      </div>
    ),
    invitation: (
      <section className="story-invitation" data-story-section="invitation" data-store>
        <div className="story-invitation-copy">
          <h2>{page.invitationHeading}</h2>
          <p>{page.invitationBody}</p>
        </div>
        <Link className="story-button story-button-light" href={conversationHref} data-fill-button="light">{page.invitationCta}</Link>
      </section>
    ),
  };
  return (
    <div className="home-parity story-page">
      {!shown.has("hero") && <h1 className="sr-only"><Lines lines={page.heroHeading} /></h1>}
      {page.sections.filter(item => item.enabled).map(item => <Fragment key={item.key}>{regions[item.key]}</Fragment>)}
    </div>
  );
}
