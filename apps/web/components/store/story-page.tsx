import { Fragment, type ReactNode } from "react";
import type { StoryPageContent, StorySectionKey, TemplateMedia } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { CategoryVideo } from "@/components/store/category-video";
import story from "@/data/landing-story.json";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import { PromiseStrip } from "./promise-strip";
import { eyebrow, SectionHeading } from "./section-heading";

/*
 * Our Story on the "Maple / PDF Review / Our Story" frame (1440): hero card with the shared promise strip,
 * the brand philosophy beside the workshop film, the journey cards and a closing brand band. Staff copy
 * drives every slot it already had; the frame's newsletter form and the cities band are left out.
 */

const film = story.sections.find((item) => item.key === "media_with_content_deBkJg")!;

/** Full-bleed band with the frame's 64 px gutter, 32 px on tablets and 20 px on phones. */
const band = "px-16 py-16 font-body max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-5 max-[750px]:py-10";
const inner = "mx-auto w-full max-w-[1312px]";

function Lines({ lines }: { lines: string[] }) {
  return lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>);
}

export function StoryLanding({ content, media }: { content?: StoryPageContent; media?: TemplateMedia } = {}) {
  const photo = resolveTemplateMedia("story-hero", media);
  const poster = resolveTemplateMedia("story-film-poster", media);
  const page = resolveStoryPageContent(content);
  const regions: Record<StorySectionKey, ReactNode> = {
    hero: (
      <section data-store data-story-section="hero" className={`${band} bg-linen`}>
        <div className={`${inner} flex flex-col gap-7 max-[750px]:gap-5`}>
          <div className="grid grid-cols-[minmax(0,700fr)_minmax(0,612fr)] items-start overflow-hidden rounded-2xl bg-cream max-[1024px]:grid-cols-1">
            <Image
              data-story-hero-image
              src={photo.image}
              alt={photo.alt}
              width={1400}
              height={760}
              sizes="(max-width:1024px) 100vw, 700px"
              priority
              className="h-[380px] w-full rounded-xl object-cover max-[1024px]:h-[340px] max-[750px]:h-[240px]"
            />
            <div className="flex flex-col items-start gap-5 p-[42px] max-[1024px]:p-8 max-[750px]:gap-4 max-[750px]:p-6">
              <p data-story-eyebrow className={eyebrow}>{page.title}</p>
              <h1 className="font-serif text-h1 font-bold text-espresso max-[750px]:text-h2">
                <Lines lines={page.heroHeading} />
              </h1>
              <p data-story-tagline className="max-w-[500px] text-lead whitespace-pre-line text-taupe max-[750px]:text-price">
                {page.tagline}
              </p>
              <a
                data-story-cta
                href="/collections/all"
                className="inline-flex h-12 w-[210px] items-center justify-center rounded-sm bg-brand text-ui font-bold text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[750px]:w-full"
              >
                Find your Maple <span aria-hidden="true" className="ml-2">→</span>
              </a>
            </div>
          </div>
          <PromiseStrip />
        </div>
      </section>
    ),
    "belief-film": (
      <div data-store data-story-section="belief-film" className={`${band} bg-cream`}>
        <div className={`${inner} grid grid-cols-[minmax(0,600fr)_minmax(0,664fr)] items-start gap-12 max-[1024px]:grid-cols-1 max-[1024px]:gap-8 max-[750px]:gap-6`}>
          <section data-story-belief aria-label={page.beliefEyebrow} className="flex flex-col gap-6 bg-brand p-10 max-[750px]:gap-4 max-[750px]:p-6">
            <h2 className="font-serif text-[38px] leading-[1.1] font-bold text-white max-[750px]:text-h2">
              <Lines lines={page.beliefHeading} />
            </h2>
            <p data-story-belief-body className="text-[18px] leading-[1.45] whitespace-pre-line text-[#f0e3d9] max-[750px]:text-price">
              {page.beliefBody}
            </p>
          </section>
          <div data-story-film className="relative h-[400px] overflow-hidden rounded-xl bg-espresso max-[1024px]:h-[360px] max-[750px]:h-[260px]">
            <CategoryVideo
              desktop={{ ...film.videos[0]!, poster: poster.image }}
              label={poster.alt}
              autoPlay={false}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </div>
    ),
    journey: (
      <section data-store data-story-section="journey" data-story-journey aria-labelledby="story-journey-heading" className={`${band} bg-linen`}>
        <div className={`${inner} flex flex-col gap-7 max-[750px]:gap-5`}>
          <SectionHeading id="story-journey-heading" eyebrow={page.journeyHeading} title="Crafted with purpose. Evolving with you." />
          <ol className="m-0 grid list-none grid-cols-4 gap-5 p-0 max-[1024px]:grid-cols-2 max-[750px]:grid-cols-1 max-[750px]:gap-4">
            {page.timeline.map((item) => (
              <li key={item.key} data-story-milestone className="flex flex-col gap-[22px] rounded-xl bg-cream p-[26px] max-[750px]:gap-4 max-[750px]:p-6">
                <p data-story-milestone-date className="font-serif text-display font-bold text-brand max-[750px]:text-h2">{item.date}</p>
                <h3 className="font-serif text-h3 font-bold text-espresso max-[750px]:text-h4">{item.title}</h3>
                <p data-story-milestone-body className="text-price whitespace-pre-line text-taupe">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    ),
    // The frame has no cities band; the admin toggle is kept so saved revisions stay valid.
    cities: null,
  };
  return (
    <div data-story className="overflow-x-clip bg-linen">
      {!page.sections.some((item) => item.key === "hero" && item.enabled) && (
        <h1 className="sr-only"><Lines lines={page.heroHeading} /></h1>
      )}
      {page.sections.filter((item) => item.enabled).map((item) => (
        <Fragment key={item.key}>{regions[item.key]}</Fragment>
      ))}
      <section data-store data-story-closing aria-labelledby="story-closing-heading" className={`${band} bg-brand`}>
        <div className={`${inner} flex flex-col gap-4`}>
          <h2 id="story-closing-heading" className="max-w-[640px] font-serif text-[44px] leading-[1.1] font-bold text-white max-[750px]:text-h2">
            Soft presence.<br />Strong craftsmanship.
          </h2>
          <p className="max-w-[600px] text-lead text-[#f0e3d9] max-[750px]:text-price">Furniture made for rooms that feel as good as they look.</p>
        </div>
      </section>
    </div>
  );
}
