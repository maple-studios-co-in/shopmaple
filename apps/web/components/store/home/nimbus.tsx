import Link from "next/link";
import { useId } from "react";
import { eyebrow } from "../section-heading";
import { designSection, solidButton } from "./layout";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

/** The Nimbus feature card ("Maple / PDF Review / Home"): the photograph beside a cream panel with name, tagline, features and Explore. */
export function HomeNimbus({
  content = defaultHomeDetails.nimbus,
  media,
}: { content?: HomeDetails["nimbus"]; media?: TemplateMedia } = {}) {
  const artwork = resolveHomeTemplateMedia("home-nimbus", media);
  const headingId = useId();
  return (
    <section data-store data-home-nimbus aria-labelledby={headingId} className={designSection}>
      <div data-feature-card className="grid grid-cols-[700fr_612fr] overflow-hidden rounded-2xl bg-cream max-[1024px]:grid-cols-1">
        <picture data-nimbus-media className="relative block h-[clamp(380px,26.4vw,680px)] overflow-hidden rounded-xl max-[1024px]:h-auto max-[1024px]:aspect-[700/380]">
          <source media="(max-width: 767px)" srcSet={artwork.mobileImage} />
          <img src={artwork.image} alt={artwork.alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
        </picture>
        <div className="flex flex-col items-start gap-5 p-[42px] max-[750px]:gap-4 max-[750px]:p-6">
          <p data-section-eyebrow className={eyebrow}>Introducing</p>
          <h2 id={headingId} className="font-serif text-h1 font-bold text-espresso max-[750px]:text-h2">{content.heading}</h2>
          <p data-feature-body className="max-w-[500px] text-lead text-taupe max-[750px]:text-card">{content.tagline}</p>
          <ul aria-label="What makes Nimbus" className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-label font-bold text-espresso uppercase">
            {content.features.map((label) => <li key={label}>{label}</li>)}
          </ul>
          <Link data-feature-cta href="/pages/nimbus-collection" className={`${solidButton} after:ml-1.5 after:content-['→']`}>{content.cta}</Link>
        </div>
      </div>
    </section>
  );
}
