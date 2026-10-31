import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { HeroFilm } from "./hero-film";

/** The "Maple / PDF Review / Home" hero bento: the film with the design's message, four category tiles, then `children` (the promise strip). */
export function Hero({
  content = defaultHomeDetails.hero,
  media,
  children,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia; children?: ReactNode } = {}) {
  return (
    <section data-store data-hero aria-label="Explore Maple furniture"
      className="flex w-full flex-col gap-6 bg-linen p-16 font-body max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:gap-4 max-[750px]:px-5 max-[750px]:pt-6 max-[750px]:pb-10">
      {/* 520 px tall at 1440 (36.1vw), growing with wider windows so the bento keeps its shape edge to edge. */}
      <div className="grid h-[clamp(520px,36.1vw,920px)] grid-cols-[656fr_636fr] gap-5 max-[1024px]:h-auto max-[1024px]:grid-cols-1 max-[750px]:gap-3">
        <HeroFilm poster={resolveHomeTemplateMedia("home-workshop-poster", media)}>
          <div data-hero-message className="pointer-events-none absolute inset-y-0 left-10 z-[2] flex w-[550px] max-w-[calc(100%-80px)] flex-col justify-center gap-[18px] text-white max-[750px]:inset-x-5 max-[750px]:top-auto max-[750px]:bottom-6 max-[750px]:w-auto max-[750px]:max-w-none max-[750px]:gap-3">
            <p data-hero-eyebrow className="text-label font-bold uppercase">Made for real living</p>
            <h2 className="font-serif text-[48px] leading-[1.1] font-bold max-[750px]:text-[32px]">
              Timeless craftsmanship.<br /> A home that feels yours.
            </h2>
            <p data-hero-lede className="text-lead max-[750px]:text-card">Thoughtfully made furniture, shaped around you.</p>
            <Link data-hero-cta href="/pages/nimbus-collection"
              className="pointer-events-auto inline-flex w-[220px] items-center justify-center rounded-sm bg-brand p-3.5 text-ui font-bold text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white after:ml-1.5 after:content-['→']">
              {content.cta}
            </Link>
          </div>
        </HeroFilm>
        <div data-hero-tiles className="grid grid-cols-2 grid-rows-2 gap-5 max-[750px]:gap-3">
          {content.tiles.map(({ key, label, priceLabel }) => {
            const artwork = resolveHomeTemplateMedia(`home-hero-${key}`, media);
            return <Link data-hero-tile key={key} href={(key === "beds" ? "/collections/" : "/pages/") + key}
              className="group/tile relative isolate block h-full overflow-hidden rounded-xl bg-forest no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[1024px]:h-auto max-[1024px]:aspect-[308/250] max-[750px]:aspect-[4/5]">
              <Image src={artwork.image} alt={artwork.alt} fill sizes="(max-width: 1024px) 50vw, 22vw" preload
                className="-z-[1] object-cover transition-transform duration-500 group-hover/tile:scale-[1.03] motion-reduce:transition-none" />
              <div data-tile-card className="absolute top-3 left-3 flex w-[180px] max-w-[calc(100%-24px)] flex-col gap-[3px] bg-white p-3 text-espresso max-[750px]:top-2 max-[750px]:left-2 max-[750px]:max-w-[calc(100%-16px)] max-[750px]:p-2.5">
                <h3 className="font-serif text-[24px] leading-[1.1] font-bold max-[750px]:text-subhead">{label}</h3>
                <p className="text-label text-taupe">{priceLabel}</p>
                <span data-tile-link className="text-label text-brand underline-offset-4 group-hover/tile:underline">View collection →</span>
              </div>
            </Link>;
          })}
        </div>
      </div>
      {children}
    </section>
  );
}
