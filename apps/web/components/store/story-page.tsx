import { Fragment, type ReactNode } from "react";
import { Building2, Globe, Hammer, House, PencilRuler, Sofa, Truck, type LucideIcon } from "lucide-react";
import type { StoryPageContent, StorySectionKey, TemplateMedia } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { CategoryVideo } from "@/components/category-controls";
import { HomeCities } from "@/components/home-sections";
import story from "@/data/landing-story.json";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import type { promises } from "./promise-strip";

const section = (key: string) => story.sections.find((item) => item.key === key)!;

/** The page's own promise copy, paired with the shared promise line icons. */
const promiseIcons = ["customisable", "delivery", "crafted", "warranty"] as const satisfies readonly (typeof promises)[number]["icon"][];
const storyPromises = section("section_AV6UjQ").texts.slice(1, 5).map((title, index) => ({ title, icon: promiseIcons[index]! }));

/** Decorative only: one line icon per timeline slot, as in the design. */
const milestoneIcons: Record<StoryPageContent["timeline"][number]["key"], LucideIcon> = {
  "chapter-1": Hammer,
  "chapter-2": House,
  "chapter-3": Building2,
  "chapter-4": PencilRuler,
  "chapter-5": Globe,
  "chapter-6": Sofa,
  "chapter-7": Truck,
};

const container = "mx-auto w-full max-w-[1376px] px-4 sm:px-6 lg:px-8";

function Lines({ lines }: { lines: string[] }) {
  return lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>);
}

function Ornament({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex items-center gap-2 text-brand ${className}`}>
      <span className="h-px w-10 bg-current opacity-50" />
      <span className="size-1.5 rotate-45 bg-current" />
      <span className="h-px w-10 bg-current opacity-50" />
    </span>
  );
}

export function StoryLanding({ content, media }: { content?: StoryPageContent; media?: TemplateMedia } = {}) {
  const belief = resolveTemplateMedia("story-hero", media);
  const poster = resolveTemplateMedia("story-film-poster", media);
  const film = section("media_with_content_deBkJg");
  const page = resolveStoryPageContent(content);
  const regions: Record<StorySectionKey, ReactNode> = {
    hero: (
      <section data-store data-story-section="hero" className={`${container} grid items-center gap-8 pt-6 pb-10 font-body lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] lg:gap-12 lg:pt-8 lg:pb-14`}>
        <div className="flex flex-col items-center text-center lg:py-10">
          <h1 className="font-serif text-[44px] leading-[1.02] font-medium tracking-[-0.01em] text-brand uppercase sm:text-[60px] lg:text-[54px] xl:text-[66px]">
            <Lines lines={page.heroHeading} />
          </h1>
          <Ornament className="mt-5" />
          <p data-story-tagline className="mt-4 font-serif text-subhead text-espresso italic sm:text-h4">
            {page.tagline}
          </p>
          <ul data-story-promises aria-label="The Maple promise" className="mt-8 grid w-full grid-cols-2 gap-x-4 gap-y-5 text-left sm:grid-cols-4 sm:gap-3">
            {storyPromises.map((promise) => (
              <li key={promise.icon} className="flex items-center gap-2.5 sm:flex-col sm:text-center xl:flex-row xl:text-left">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-solid border-sand bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size line icon from the design */}
                  <img src={`/icons/store/${promise.icon}.svg`} alt="" width={24} height={24} className="size-6" />
                </span>
                <span className="text-meta leading-snug font-medium text-espresso">{promise.title}</span>
              </li>
            ))}
          </ul>
        </div>
        <Image
          data-story-hero-image
          src={belief.image}
          alt={belief.alt}
          width={1200}
          height={1200}
          sizes="(max-width:1023px) 92vw, 50vw"
          priority
          className="aspect-[4/3] h-auto w-full rounded-xl object-cover lg:aspect-[5/4]"
        />
      </section>
    ),
    "belief-film": (
      <div data-store data-story-section="belief-film" className={`${container} font-body`}>
        <div className="grid overflow-hidden rounded-xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section data-story-belief className="bg-brand px-6 py-10 text-white sm:px-10 lg:px-12 lg:py-14">
            <p data-story-eyebrow className="text-label font-semibold tracking-[0.12em] text-white/85 uppercase">{page.beliefEyebrow}</p>
            <span aria-hidden="true" className="mt-5 block font-serif text-[56px] leading-[0.6] text-white/70">&ldquo;</span>
            <h2 className="mt-2 font-serif text-[28px] leading-[1.18] font-normal italic sm:text-[34px]">
              <Lines lines={page.beliefHeading} />
            </h2>
            <p data-story-belief-body className="mt-6 max-w-[56ch] text-ui leading-[1.7] whitespace-pre-line text-white/90">{page.beliefBody}</p>
          </section>
          <section data-story-film className="relative min-h-[380px] bg-espresso sm:min-h-[460px] lg:min-h-[600px]">
            <CategoryVideo
              desktop={{ ...film.videos[0]!, poster: poster.image }}
              label={poster.alt}
              autoPlay={false}
              className="absolute inset-0 h-full w-full"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgb(20_14_10/0.72)_0%,rgb(20_14_10/0.45)_45%,rgb(20_14_10/0.12)_100%)]" />
            <h2 className="pointer-events-none absolute top-6 left-6 font-serif text-[64px] leading-[0.88] font-normal text-white uppercase sm:top-10 sm:left-10 sm:text-[96px] lg:top-12 lg:left-12 lg:text-[120px]">
              <Lines lines={page.filmHeading} />
            </h2>
          </section>
        </div>
      </div>
    ),
    journey: (
      <section data-store data-story-section="journey" data-story-journey className={`${container} py-14 font-body lg:py-20`}>
        <div className="flex flex-col items-center text-center">
          <h2 className="font-serif text-[32px] leading-[1.1] font-normal text-brand italic sm:text-[40px]">{page.journeyHeading}</h2>
          <Ornament className="mt-4" />
        </div>
        <div
          data-story-timeline
          role="region"
          aria-label={`${page.journeyHeading} timeline`}
          tabIndex={0}
          className="-mx-4 mt-10 snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 pb-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:mx-0 xl:px-0"
        >
          <div className="relative w-max xl:w-full">
          <span aria-hidden="true" className="absolute top-[4.5px] right-0 left-0 h-[3px] bg-[radial-gradient(circle,rgb(116_26_20/0.5)_1.2px,transparent_1.7px)] bg-[length:8px_3px] bg-repeat-x" />
          <ol className="relative flex gap-3 xl:grid xl:grid-cols-7">
            {page.timeline.map((item) => {
              const Icon = milestoneIcons[item.key];
              return (
                <li key={item.key} data-story-milestone className="flex w-[244px] shrink-0 snap-start flex-col items-center xl:w-auto">
                  <span aria-hidden="true" className="relative size-3 rounded-full border-2 border-solid border-linen bg-brand" />
                  <article className="mt-5 flex w-full flex-1 flex-col items-center rounded-lg border border-solid border-sand bg-white px-4 py-6 text-center">
                    <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-[#f6e4df] text-brand">
                      <Icon className="size-6" strokeWidth={1.5} />
                    </span>
                    <time className="mt-4 text-label font-semibold tracking-[0.06em] text-brand">{item.date}</time>
                    <h3 className="mt-1.5 font-serif text-subhead leading-[1.2] font-medium text-espresso">{item.title}</h3>
                    <p className="mt-3 text-meta leading-[1.6] whitespace-pre-line text-taupe">{item.body}</p>
                  </article>
                </li>
              );
            })}
          </ol>
          </div>
        </div>
      </section>
    ),
    cities: (
      <div data-story-section="cities" className="home-parity">
        <div className="home-divider" />
        <HomeCities />
        <div className="home-divider" />
      </div>
    ),
  };
  return (
    <div data-story className="overflow-x-clip bg-linen">
      {!page.sections.some((item) => item.key === "hero" && item.enabled) && (
        <h1 className="sr-only"><Lines lines={page.heroHeading} /></h1>
      )}
      {page.sections.filter((item) => item.enabled).map((item) => (
        <Fragment key={item.key}>{regions[item.key]}</Fragment>
      ))}
    </div>
  );
}
