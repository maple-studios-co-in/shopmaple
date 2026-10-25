import Image from "next/image";
import { HomeCities } from "@/components/home-sections";
import { CategoryVideo } from "@/components/category-controls";
import { MaplePromises } from "@/components/category-nimbus";
import story from "@/data/landing-story.json";
import { Fragment, type ReactNode } from "react";
import type { StoryPageContent, StorySectionKey, TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
const section = (key: string) =>
  story.sections.find((item) => item.key === key)!;
function Lines({ lines }: { lines: string[] }) {
  return lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>);
}
export function StoryLanding({ content, media }: { content?: StoryPageContent; media?: TemplateMedia } = {}) {
  const belief = resolveTemplateMedia("story-hero", media);
  const poster = resolveTemplateMedia("story-film-poster", media);
  const film = section("media_with_content_deBkJg");
  const page = resolveStoryPageContent(content);
  const regions: Record<StorySectionKey, ReactNode> = {
    hero: (
      <section className="suggested-story-hero home-container" data-story-section="hero">
        <div>
          <h1 className="landing-story-title">
            <Lines lines={page.heroHeading} />
          </h1>
          <h2 className="landing-story-tagline">
            {page.tagline}
          </h2>
          <MaplePromises />
        </div>
        <Image
          src={belief.image}
          alt={belief.alt}
          width={1200}
          height={1200}
          sizes="(max-width:749px) 92vw, 50vw"
          priority
        />
      </section>
    ),
    "belief-film": (
      <div className="suggested-story-belief home-container" data-story-section="belief-film">
        <section className="landing-media-content landing-story-belief">
          <div>
            <p className="home-eyebrow">{page.beliefEyebrow}</p>
            <h2>
              <Lines lines={page.beliefHeading} />
            </h2>
            <p>{page.beliefBody}</p>
          </div>
        </section>
        <section className="landing-story-film">
          <CategoryVideo
            desktop={{ ...film.videos[0]!, poster: poster.image }}
            label={poster.alt}
            autoPlay={false}
          />
          <h2>
            <Lines lines={page.filmHeading} />
          </h2>
        </section>
      </div>
    ),
    journey: (
      <section className="landing-journey home-container" data-story-section="journey">
        <h2>{page.journeyHeading}</h2>
        <ol>
          {page.timeline.map(item => (
            <li key={item.key}>
              <time>{item.date}</time>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    ),
    cities: (
      <div data-story-section="cities">
        <div className="home-divider" />
        <HomeCities />
        <div className="home-divider" />
      </div>
    ),
  };
  return (
    <div className="home-parity landing-parity landing-story">
      {!page.sections.some(item => item.key === "hero" && item.enabled) && (
        <h1 className="sr-only"><Lines lines={page.heroHeading} /></h1>
      )}
      {page.sections.filter(item => item.enabled).map(item => (
        <Fragment key={item.key}>{regions[item.key]}</Fragment>
      ))}
    </div>
  );
}
