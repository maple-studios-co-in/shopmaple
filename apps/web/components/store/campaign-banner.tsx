import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { clsx } from "clsx";
import { CampaignWindow } from "@/components/campaign-window";
import campaigns from "@/data/diwali-campaigns.json";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import { defaultStorefrontContent } from "@/lib/content-defaults";

export type CampaignKey = keyof typeof campaigns;
type Artwork = (typeof campaigns)[CampaignKey]["desktop"];

/*
 * The wide campaign banner (homepage slots, the promo trio and the bed, outdoor and TV-unit
 * collections) in the storefront's current look: legacy `.campaign-*` restated as utilities.
 * The banner is a size container; its copy is placed and sized in container-query units taken
 * from the Figma frames (1900 x 350 desktop, 500 x 500 below a 750 px wide banner), exactly as
 * before. `@max-[750px]` is the legacy `@container (max-width: 749px)`.
 */

/** Both artwork layers fill the scene behind the shade and copy. */
const artLayer = "absolute inset-0 -z-2";

function ArtworkLayer({
  artwork,
  mobile,
}: {
  artwork: Artwork;
  mobile: boolean;
}) {
  const width = mobile ? 500 : 1900;
  const height = mobile ? 500 : 350;
  return (
    <div
      className={clsx(artLayer, mobile ? "hidden @max-[750px]:block" : "@max-[750px]:hidden")}
      data-artwork={mobile ? "mobile" : "desktop"}
      aria-hidden="true"
    >
      {artwork.layers.map((layer) => (
        <div
          key={layer.nodeId}
          data-figma-node={layer.nodeId}
          className="absolute"
          style={{
            left: `${(layer.x / width) * 100}%`,
            top: `${(layer.y / height) * 100}%`,
            width: `${(layer.width / width) * 100}%`,
            height: `${(layer.height / height) * 100}%`,
          }}
        >
          <Image src={layer.src} alt="" fill sizes={mobile ? "50vw" : "25vw"} className="object-cover" />
        </div>
      ))}
    </div>
  );
}

/** Gold small print (the label and the eligibility line). */
const smallPrint = "font-semibold tracking-[.094737cqw] text-[#deba7d] @max-[750px]:tracking-[.26cqw]";

/** Campaign copy and individual artwork layers are preserved from the supplied Figma frames. */
export async function CampaignBanner({
  campaign,
  compact = false,
  content: supplied,
}: {
  campaign: CampaignKey;
  /** One of the three banners in the homepage promo row. */
  compact?: boolean;
  /** A specific content document (for example a staff draft); defaults to the published snapshot. */
  content?: StorefrontDocument;
}) {
  const content = supplied ?? await getPublishedContent();
  if (!content.campaignsAvailable) return null;
  const override = content.campaigns.find((item) => item.key === campaign);
  const fallback = defaultStorefrontContent.campaigns.find(
    (item) => item.key === campaign,
  );
  const data = { ...campaigns[campaign], ...fallback, ...override };
  const vars = {
    "--campaign-copy-x": `${(data.desktop.copy.x / 1900) * 100}cqw`,
    "--campaign-copy-y": `${(data.desktop.copy.y / 1900) * 100}cqw`,
    "--campaign-copy-width": `${(data.desktop.copy.width / 1900) * 100}cqw`,
    "--campaign-copy-gap": `${(data.desktop.copy.gap / 1900) * 100}cqw`,
    "--campaign-mobile-copy-x": `${(data.mobile.copy.x / 500) * 100}cqw`,
    "--campaign-mobile-copy-y": `${(data.mobile.copy.y / 500) * 100}cqw`,
    "--campaign-mobile-copy-width": `${(data.mobile.copy.width / 500) * 100}cqw`,
    "--campaign-mobile-copy-gap": `${(data.mobile.copy.gap / 500) * 100}cqw`,
    "--campaign-gradient-width": `${(data.desktop.gradientWidth / 1900) * 100}%`,
    "--campaign-gradient":
      data.desktop.gradient ??
      "linear-gradient(90deg, #741a14 0%, rgba(116,26,20,.84) 53%, rgba(116,26,20,0) 100%)",
  } as CSSProperties;
  // Published campaigns may retain the fuller original copy. It keeps its compact spacing so
  // the simplified Figma positions cannot clip existing calls to action.
  const fuller = Boolean(data.label || data.supporting || data.eligibility);
  const banner = (
    <section
      data-store
      className={clsx(
        "@container w-full bg-brand text-[#fff3d3]",
        compact
          ? "m-0 max-[750px]:flex-[0_0_88%] max-[750px]:snap-start"
          : // The original homepage image sections use the theme's page-width gutters.
            "mx-0 my-9 max-[750px]:my-6 [[data-home-section]>&]:mx-auto [[data-home-section]>&]:w-[calc(100%-80px)] [[data-home-section]>&]:max-w-[2400px] max-[750px]:[[data-home-section]>&]:w-[calc(100%-32px)]",
      )}
      data-campaign={campaign}
      aria-label={data.label || data.headline.join(" ")}
      style={vars}
    >
      <div className="relative isolate aspect-[1900/350] overflow-hidden @max-[750px]:aspect-square">
        {data.artwork ? (
          <>
            <div className={clsx(artLayer, "@max-[750px]:hidden")} data-artwork="desktop">
              <Image
                src={data.artwork.desktopImage}
                alt={data.artwork.alt}
                fill
                sizes="100vw"
                style={{ objectFit: "cover" }}
              />
            </div>
            <div className={clsx(artLayer, "hidden @max-[750px]:block")} data-artwork="mobile">
              <Image
                src={data.artwork.mobileImage}
                alt={data.artwork.alt}
                fill
                sizes="100vw"
                style={{ objectFit: "cover" }}
              />
            </div>
          </>
        ) : (
          <>
            <ArtworkLayer artwork={data.desktop} mobile={false} />
            <ArtworkLayer artwork={data.mobile} mobile />
          </>
        )}
        <div className="absolute inset-y-0 right-auto left-0 -z-1 w-(--campaign-gradient-width) bg-(image:--campaign-gradient) @max-[750px]:h-1/2 @max-[750px]:w-full @max-[750px]:bg-[linear-gradient(180deg,rgba(116,26,20,.91)_0%,rgba(116,26,20,.76)_46%,rgba(116,26,20,0)_100%)]" aria-hidden="true" />
        {campaign.startsWith("landing-") && (
          <div className="hidden @max-[750px]:absolute @max-[750px]:inset-x-0 @max-[750px]:top-[78%] @max-[750px]:bottom-0 @max-[750px]:-z-1 @max-[750px]:block @max-[750px]:bg-[linear-gradient(180deg,transparent,rgba(27,17,11,.72))]" aria-hidden="true" />
        )}
        <div className={clsx(
          "absolute left-(--campaign-copy-x) flex w-(--campaign-copy-width) flex-col items-start font-manrope @max-[750px]:left-(--campaign-mobile-copy-x) @max-[750px]:w-(--campaign-mobile-copy-width)",
          fuller
            ? "top-[2cqw] gap-[.421053cqw] @max-[750px]:top-[5cqw] @max-[750px]:gap-[1cqw]"
            : "top-(--campaign-copy-y) gap-(--campaign-copy-gap) @max-[750px]:top-(--campaign-mobile-copy-y) @max-[750px]:gap-(--campaign-mobile-copy-gap)",
        )}>
          {data.label && <p data-campaign-label className={clsx(smallPrint, "text-[length:.578947cqw] leading-[.842105cqw] @max-[750px]:text-[length:max(10px,2cqw)] @max-[750px]:leading-[max(14px,2.8cqw)]")}>{data.label}</p>}
          <h2 className="font-[Newsreader,serif] text-[length:2.421053cqw] leading-[2.578947cqw] font-normal tracking-normal @max-[750px]:text-[length:6.4cqw] @max-[750px]:leading-[7cqw]">
            {data.headline.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </h2>
          {data.supporting && (
            <p data-campaign-supporting className="text-[length:.947368cqw] leading-[1.315789cqw] @max-[750px]:text-[length:3cqw] @max-[750px]:leading-[4cqw]">{data.supporting}</p>
          )}
          {data.offer.length > 0 && (
            <p data-campaign-offer className="text-[length:.947368cqw] leading-[1.315789cqw] font-normal @max-[750px]:text-[length:3cqw] @max-[750px]:leading-[4.2cqw]">
              {data.offer.map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
            </p>
          )}
          {data.eligibility && <p data-campaign-eligibility className={clsx(smallPrint, "text-[length:.631579cqw] leading-[.894737cqw] @max-[750px]:text-[length:max(10px,2.2cqw)] @max-[750px]:leading-[max(14px,3cqw)]")}>{data.eligibility}</p>}
          <Link data-campaign-cta className="inline-flex items-center justify-center gap-[.3em] rounded-[2px] border border-[rgba(255,243,220,.85)] bg-transparent px-[.947368cqw] py-[.526316cqw] text-[length:.684211cqw] leading-[1.052632cqw] font-semibold tracking-[.005263cqw] text-[#fff3dc] hover:underline hover:underline-offset-[5px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#fff3d3] @max-[750px]:min-h-11 @max-[750px]:px-[3.6cqw] @max-[750px]:py-[2cqw] @max-[750px]:text-[length:max(12px,2.4cqw)] @max-[750px]:leading-[max(18px,3.6cqw)] @max-[750px]:tracking-[.02cqw]" href={data.href}>
            {data.cta}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </div>
    </section>
  );
  return data.schedule ? <CampaignWindow schedule={data.schedule} serverNow={Date.now()}>{banner}</CampaignWindow> : banner;
}
