import Link from "next/link";
import { ContentImage as Image } from "@/components/content-image";
import { CampaignWindow } from "@/components/campaign-window";
import type { CampaignKey } from "@/components/store/campaign-banner";
import campaigns from "@/data/diwali-campaigns.json";
import type { StorefrontDocument } from "@/lib/content";
import { defaultStorefrontContent } from "@/lib/content-defaults";
import { cn } from "@/lib/utils";

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

/**
 * A seasonal campaign slot (hero or sale) drawn as the design's rounded hero card or wide banner.
 * Copy, destination, artwork and schedule come from the same published campaign as before.
 */
export function CategoryCampaign({ campaign, content, variant }: {
  campaign: CampaignKey;
  content: StorefrontDocument;
  variant: "hero" | "banner";
}) {
  if (!content.campaignsAvailable) return null;
  const override = content.campaigns.find((item) => item.key === campaign);
  const fallback = defaultStorefrontContent.campaigns.find((item) => item.key === campaign);
  const data = { ...campaigns[campaign], ...fallback, ...override } as Campaign;
  const hero = variant === "hero";
  const name = data.label || data.headline.join(" ");
  const copy = (
    <>
      {data.label && <p className={cn("m-0 text-label font-bold tracking-[0.12em] uppercase", hero ? "text-brand" : "text-white")}>{data.label}</p>}
      <p className={cn("m-0 font-serif font-medium", hero ? "text-[32px] leading-[1.05] text-espresso md:text-[44px] lg:text-[52px]" : "text-[26px] leading-[1.1] text-white md:text-h1")}>
        {data.headline.map((line, index) => <span key={line} className="block">{index > 0 && " "}{line}</span>)}
      </p>
      {data.supporting && <p className={cn("m-0 text-card md:text-lead", hero ? "text-[#5e574f]" : "text-white")}>{data.supporting}</p>}
      {data.offer.length > 0 && (
        <p className={cn("m-0 text-card md:text-lead", hero ? "text-[#5e574f]" : "text-white")}>
          {data.offer.map((line, index) => <span key={line} className="block">{index > 0 && " "}{line}</span>)}
        </p>
      )}
      {data.eligibility && <p className={cn("m-0 text-label", hero ? "text-[#5e574f]" : "text-white/90")}>{data.eligibility}</p>}
      <Link data-campaign-cta href={data.href} className={cn(ctaBase, "mt-1", hero
        ? "bg-brand text-white hover:bg-brand-deep focus-visible:outline-brand"
        : "bg-white text-brand hover:bg-cream focus-visible:outline-white")}>
        {data.cta}
        <span aria-hidden="true"> →</span>
      </Link>
    </>
  );
  const card = hero ? (
    <section data-campaign={campaign} data-category-hero data-category-section="hero" aria-label={name} className="mx-auto w-full max-w-[1440px] px-4 pt-4 md:px-8 md:pt-6 xl:px-16">
      <div className="grid overflow-hidden rounded-2xl bg-cream md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="relative min-h-[230px] overflow-hidden sm:min-h-[300px] md:min-h-[440px]">
          <Artwork data={data} eager />
        </div>
        <div className="flex flex-col items-start justify-center gap-3 p-6 md:gap-4 md:p-10 lg:p-14">{copy}</div>
      </div>
    </section>
  ) : (
    <section data-campaign={campaign} data-category-banner data-category-section="banner" aria-label={name} className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-10 xl:px-16">
      <div className="relative isolate min-h-[240px] overflow-hidden rounded-2xl bg-brand md:aspect-[1900/420] md:min-h-0">
        <div className="absolute inset-0 -z-10"><Artwork data={data} eager={false} /></div>
        <div aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 w-[88%] bg-[linear-gradient(90deg,#741a14_0%,rgba(116,26,20,0.9)_55%,rgba(116,26,20,0)_100%)] md:w-[58%]" />
        <div className="flex h-full max-w-[460px] flex-col items-start justify-center gap-3 p-6 md:p-10 lg:px-14">{copy}</div>
      </div>
    </section>
  );
  return data.schedule ? <CampaignWindow schedule={data.schedule} serverNow={Date.now()}>{card}</CampaignWindow> : card;
}
