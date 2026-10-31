import { useId, type ReactNode } from "react";
import { SectionHeading } from "../section-heading";
import { designSection } from "./layout";
import type { HomeDetails, HomeCitiesLayout, TemplateMedia } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { HomeCarousel } from "@/components/store/carousel";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { defaultHomeCitiesLayout } from "@/lib/home-cities-defaults";

/*
 * The "cities served" band (homepage, Our Story, Help Center and Bulk Enquiry) in the storefront's
 * current look: legacy `.home-cities`, `.city-motion` and `.home-city-*` restated as utilities.
 * Breakpoint: max-[750px] is the legacy `max-width: 749px`.
 */

/** The side arrows and the play control of the moving city row (legacy `.city-motion .home-carousel-controls > button`). */
const cityButton =
  "absolute [transform:translateY(-50%)] grid size-9 min-h-11 min-w-11 place-items-center rounded-[50%] border border-[#e7d9cc] bg-white text-brand";
const cityArrow = `${cityButton} top-[45%] focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-4 disabled:cursor-default disabled:opacity-45`;
const cityPlay = [
  cityButton,
  "bottom-[-32px] left-1/2 overflow-hidden whitespace-nowrap p-0 -m-px [clip:rect(0,0,0,0)] [clip-path:inset(50%)]",
  "focus-visible:size-auto focus-visible:m-0 focus-visible:p-2 focus-visible:[clip:auto] focus-visible:[clip-path:none] focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-4",
  "opacity-0 pointer-events-none group-hover/carousel:enabled:opacity-100 group-hover/carousel:enabled:pointer-events-auto group-focus-within/carousel:enabled:opacity-100 group-focus-within/carousel:enabled:pointer-events-auto [&[aria-label^='Play_']:enabled]:opacity-100 [&[aria-label^='Play_']:enabled]:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:cursor-default",
].join(" ");

export function MovingCities({ children, autoplay = true }: { children: ReactNode; autoplay?: boolean }) {
  return (
    <HomeCarousel label="Cities served" autoplay={autoplay}
      className="relative min-w-0 flex-1 px-11"
      railClassName="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      controlsClassName="static m-0 h-0"
      buttons={{ previous: `${cityArrow} left-0`, next: `${cityArrow} right-0`, play: cityPlay }}>
      <div data-city-track className="flex w-max items-center gap-5">{children}</div>
    </HomeCarousel>
  );
}

export function HomeCities({
  content = defaultHomeDetails.cities,
  autoplay = true,
  media,
  layout = defaultHomeCitiesLayout,
}: {
  content?: HomeDetails["cities"];
  autoplay?: boolean;
  media?: TemplateMedia;
  layout?: HomeCitiesLayout;
} = {}) {
  const cities = layout.filter(city => city.enabled);
  if (!cities.length) return null;
  return (
    <section data-store data-home-cities className="mx-auto flex w-[calc(100%-80px)] max-w-[1360px] items-center gap-7 rounded-[22px] border border-[#e9e2d9] bg-[#f0ece6] px-9 py-[42px] max-[750px]:w-[calc(100%-32px)] max-[750px]:flex-col max-[750px]:items-stretch max-[750px]:gap-6 max-[750px]:px-[18px] max-[750px]:py-7">
      <header className="flex-[0_0_170px] max-[750px]:flex-auto">
        <p className="mb-1.5 font-['Red_Hat_Display',Manrope,sans-serif] text-[12px] font-bold tracking-[.08em] text-brand uppercase">{content.eyebrow}</p>
        <h2 className="max-w-[150px] font-serif text-[56px] leading-none font-medium text-[#29251f] max-[750px]:max-w-none max-[750px]:text-[42px]">{content.heading}</h2>
        <a className="mt-3.5 inline-block text-[10px] text-[#62584d] underline-offset-3 hover:underline hover:underline-offset-[5px]" href="/media/cities/credits.html">Image credits</a>
      </header>
      <MovingCities autoplay={autoplay}>
        {cities.map(({ key }) => {
          const artwork = resolveTemplateMedia(`home-city-${key}`, media);
          return (
            <figure key={key} className="m-0 w-[104px] flex-[0_0_104px] snap-start text-center max-[750px]:w-24 max-[750px]:basis-24">
              <div className="flex h-[170px] items-center justify-center overflow-hidden rounded-[80px] border-4 border-[#faf8f4] bg-[#e7dfd3] max-[750px]:h-[150px]">
                <Image
                  src={artwork.image}
                  alt={artwork.alt}
                  width={400}
                  height={600}
                  className="size-full min-w-0 max-w-full object-cover"
                />
              </div>
              {artwork.alt && <figcaption className="mt-2.5 text-[10px] leading-[1.4] font-bold text-[#433625] uppercase after:mx-auto after:mt-2 after:block after:h-px after:w-[22px] after:bg-[#b76a54] after:content-['']">{artwork.alt}</figcaption>}
            </figure>
          );
        })}
      </MovingCities>
    </section>
  );
}

/**
 * The homepage's cities ("ACROSS INDIA" in "Maple / PDF Review / Home"): the shared section heading over
 * cream cards, each a round photograph and the city's name. The other pages keep `HomeCities`.
 */
export function HomeCityCards({
  content = defaultHomeDetails.cities,
  autoplay = true,
  media,
  layout = defaultHomeCitiesLayout,
}: {
  content?: HomeDetails["cities"];
  autoplay?: boolean;
  media?: TemplateMedia;
  layout?: HomeCitiesLayout;
} = {}) {
  const cities = layout.filter(city => city.enabled);
  const headingId = useId();
  if (!cities.length) return null;
  return (
    <section data-store data-home-cities aria-labelledby={headingId} className={designSection}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow={content.eyebrow} title={content.heading} id={headingId} />
        <a className="text-label text-taupe underline-offset-3 hover:underline" href="/media/cities/credits.html">Image credits</a>
      </div>
      <HomeCarousel label="Cities served" autoplay={autoplay}
        railClassName="grid grid-flow-col auto-cols-[calc((100%-80px)/6)] gap-4 overflow-x-auto overscroll-x-contain snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-[1024px]:auto-cols-[calc((100%-48px)/4)] max-[750px]:auto-cols-[calc((100%-16px)/2.3)] max-[750px]:gap-3"
        controlsClassName="mt-4">
        <div data-city-track className="contents">
        {cities.map(({ key }) => {
          const artwork = resolveTemplateMedia(`home-city-${key}`, media);
          return (
            <figure data-city-card key={key} className="m-0 flex snap-start flex-col items-center gap-3 rounded-[40px] bg-cream px-5 pt-5 pb-5 text-center">
              <Image src={artwork.image} alt={artwork.alt} width={400} height={600}
                className="size-[120px] rounded-full object-cover max-[750px]:size-24" />
              {artwork.alt && <figcaption data-city-name className="text-ui font-bold text-espresso">{artwork.alt}</figcaption>}
            </figure>
          );
        })}
        </div>
      </HomeCarousel>
    </section>
  );
}
