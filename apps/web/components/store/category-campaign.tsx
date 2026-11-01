import Link from "next/link";
import { ContentImage as Image } from "@/components/content-image";
import { CampaignWindow } from "@/components/campaign-window";
import type { CampaignKey } from "@/components/store/campaign-banner";
import campaigns from "@/data/diwali-campaigns.json";
import type { StorefrontDocument } from "@/lib/content";
import { defaultStorefrontContent } from "@/lib/content-defaults";
import { cn } from "@/lib/utils";
import { eyebrow } from "./section-heading";

type Campaign = (typeof campaigns)[CampaignKey] & {
  artwork?: { desktopImage: string; mobileImage: string; alt: string } | null;
  schedule?: { startsAt: string | null; endsAt: string | null } | null;
};

/**
 * The campaign's desktop artwork, anchored to the right edge and cropped from the left at the
 * box's height, so the scene (always on the right in these frames) stays in view at any width.
 */
function Artwork({ data, eager }: { data: Campaign; eager: boolean }) {
  const loading = eager ? { loading: "eager" as const, fetchPriority: "high" as const } : {};
  if (data.artwork)
    return <Image src={data.artwork.desktopImage} alt={data.artwork.alt} fill sizes="(max-width:767px) 100vw, 900px" className="object-cover object-right" {...loading} />;
  return (
    <div aria-hidden="true" className="absolute inset-y-0 right-0 aspect-[1900/350] h-full">
      {data.desktop.layers.map((layer) => (
        <div key={layer.nodeId} data-figma-node={layer.nodeId} className="absolute" style={{
          left: `${(layer.x / 1900) * 100}%`, top: `${(layer.y / 350) * 100}%`,
          width: `${(layer.width / 1900) * 100}%`, height: `${(layer.height / 350) * 100}%`,
        }}>
          <Image src={layer.src} alt="" fill sizes="(max-width:767px) 360px, 620px" className="object-cover" {...loading} />
        </div>
      ))}
    </div>
  );
}

const ctaBase = "inline-flex items-center justify-center gap-2 rounded-sm px-5 py-3 text-ui font-bold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

/** The published campaign for a slot (copy, destination, artwork, schedule), or null while campaigns are unavailable. */
export function resolveCampaign(campaign: CampaignKey, content: StorefrontDocument): Campaign | null {
  if (!content.campaignsAvailable) return null;
  const override = content.campaigns.find((item) => item.key === campaign);
  const fallback = defaultStorefrontContent.campaigns.find((item) => item.key === campaign);
  return { ...campaigns[campaign], ...fallback, ...override } as Campaign;
}

/**
 * The hero campaign as the "Maple / PDF Review / Chairs" feature card: the picture on the left
 * (700 of 1312 px), and on cream the category's name as the eyebrow and the page's h1, the campaign
 * headline, its offer and its link. It stacks under 750 px. Scheduling is the caller's.
 */
export function CategoryHero({ campaign, data, title }: { campaign: CampaignKey; data: Campaign; title: string }) {
  const lines = [data.supporting, ...data.offer, data.eligibility].filter(Boolean);
  return (
    <section data-campaign={campaign} data-category-hero data-category-section="hero" aria-label={data.label || data.headline.join(" ")} className="mx-auto w-full max-w-[1440px] p-16 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-5 max-[750px]:pt-6 max-[750px]:pb-10">
      <div className="grid grid-cols-[minmax(0,700fr)_minmax(0,612fr)] overflow-hidden rounded-[14px] bg-cream max-[750px]:grid-cols-1">
        <div data-hero-media className="relative h-[380px] overflow-hidden rounded-[12px] max-[1024px]:h-[340px] max-[750px]:h-[240px]">
          <Artwork data={data} eager />
        </div>
        <div data-hero-copy className="flex flex-col items-start gap-5 p-[42px] max-[1024px]:p-8 max-[750px]:gap-4 max-[750px]:p-6">
          <h1 data-hero-eyebrow className={cn("m-0", eyebrow)}>{title}</h1>
          <p data-hero-headline className="m-0 font-serif text-h1 font-bold text-espresso max-[1024px]:text-title max-[750px]:text-h2">
            {data.headline.map((line, index) => <span key={line}>{index > 0 && " "}{line}</span>)}
          </p>
          {lines.length > 0 && (
            <p className="m-0 max-w-[500px] text-lead text-taupe max-[750px]:text-card">
              {lines.map((line, index) => <span key={line} className="block">{index > 0 && " "}{line}</span>)}
            </p>
          )}
          <Link data-campaign-cta href={data.href} className="inline-flex min-w-[210px] items-center justify-center rounded-[6px] bg-brand p-[14px] text-ui font-bold text-white no-underline transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {data.cta}
            <span aria-hidden="true">&nbsp;&nbsp;→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * The sale campaign slot drawn as the design's wide banner. Copy, destination, artwork and
 * schedule come from the same published campaign as before.
 */
export function CategoryCampaign({ campaign, content }: {
  campaign: CampaignKey;
  content: StorefrontDocument;
}) {
  const data = resolveCampaign(campaign, content);
  if (!data) return null;
  const name = data.label || data.headline.join(" ");
  const card = (
    <section data-campaign={campaign} data-category-banner data-category-section="banner" aria-label={name} className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-10 xl:px-16">
      <div className="relative isolate min-h-[240px] overflow-hidden rounded-2xl bg-brand md:min-h-[290px]">
        <div className="absolute inset-0 -z-10"><Artwork data={data} eager={false} /></div>
        <div aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 w-[88%] bg-[linear-gradient(90deg,#741a14_0%,rgba(116,26,20,0.9)_55%,rgba(116,26,20,0)_100%)] md:w-[58%]" />
        <div className="flex h-full max-w-[460px] flex-col items-start justify-center gap-3 p-6 md:p-10 lg:px-14">
          {data.label && <p className="m-0 text-label font-bold tracking-[0.12em] text-white uppercase">{data.label}</p>}
          <p className="m-0 font-serif text-[26px] leading-[1.1] font-medium text-white md:text-h1">
            {data.headline.map((line, index) => <span key={line} className="block">{index > 0 && " "}{line}</span>)}
          </p>
          {data.supporting && <p className="m-0 text-card text-white md:text-lead">{data.supporting}</p>}
          {data.offer.length > 0 && (
            <p className="m-0 text-card text-white md:text-lead">
              {data.offer.map((line, index) => <span key={line} className="block">{index > 0 && " "}{line}</span>)}
            </p>
          )}
          {data.eligibility && <p className="m-0 text-label text-white/90">{data.eligibility}</p>}
          <Link data-campaign-cta href={data.href} className={cn(ctaBase, "mt-1 bg-white text-brand hover:bg-cream focus-visible:outline-white")}>
            {data.cta}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </div>
    </section>
  );
  return data.schedule ? <CampaignWindow schedule={data.schedule} serverNow={Date.now()}>{card}</CampaignWindow> : card;
}
