import Link from "next/link";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

/** The Nimbus feature ("NIMBUS" over the cloud scene in the design): tagline, name, Explore, and the four features. */
export function HomeNimbus({
  content = defaultHomeDetails.nimbus,
  media,
}: { content?: HomeDetails["nimbus"]; media?: TemplateMedia } = {}) {
  const artwork = resolveHomeTemplateMedia("home-nimbus", media);
  return (
    <section data-store data-home-nimbus aria-label="The Nimbus Collection"
      className="bg-[linear-gradient(180deg,#faf8f4,#ecebe8_18%,#ecebe8_82%,#faf8f4)] py-8 font-body md:py-14">
      <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 xl:px-12">
        <div className="relative isolate grid min-h-[520px] place-items-center overflow-hidden rounded-[18px] px-5 pt-12 pb-8 text-center text-white md:aspect-[1170/640] md:min-h-0 md:pb-12">
          <picture data-nimbus-media className="absolute inset-0 -z-[2]">
            <source media="(max-width: 767px)" srcSet={artwork.mobileImage} />
            <img src={artwork.image} alt={artwork.alt} loading="lazy" className="size-full object-cover" />
          </picture>
          <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-[linear-gradient(0deg,rgb(41_37_31/0.62),rgb(41_37_31/0.15)_45%,transparent_70%)]" />
          <div className="grid justify-items-center gap-2 self-end md:gap-3">
            <p className="text-price font-bold [text-shadow:0_1px_8px_rgb(0_0_0/0.35)] md:text-subhead">{content.tagline}</p>
            <h2 className="font-serif text-[30px] leading-tight font-medium [text-shadow:0_2px_14px_rgb(0_0_0/0.35)] md:text-[40px]">{content.heading}</h2>
            <ul aria-label="What makes Nimbus" className="flex flex-wrap justify-center gap-2">
              {content.features.map((label) => (
                <li key={label} className="rounded-full bg-white/85 px-3 py-1.5 text-label font-semibold text-espresso">{label}</li>
              ))}
            </ul>
            <Link href="/pages/nimbus-collection"
              className="mt-2 inline-flex min-w-[134px] items-center justify-center rounded-full bg-brand px-8 py-4 text-price font-bold text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {content.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
