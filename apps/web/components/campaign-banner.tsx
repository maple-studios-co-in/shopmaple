import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CampaignWindow } from "./campaign-window";
import campaigns from "@/data/diwali-campaigns.json";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import { defaultStorefrontContent } from "@/lib/content-defaults";

export type CampaignKey = keyof typeof campaigns;
type Artwork = (typeof campaigns)[CampaignKey]["desktop"];

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
      className={mobile ? "campaign-art-mobile" : "campaign-art-desktop"}
      data-artwork={mobile ? "mobile" : "desktop"}
      aria-hidden="true"
    >
      {artwork.layers.map((layer) => (
        <div
          key={layer.nodeId}
          data-figma-node={layer.nodeId}
          className="campaign-art-tile"
          style={{
            left: `${(layer.x / width) * 100}%`,
            top: `${(layer.y / height) * 100}%`,
            width: `${(layer.width / width) * 100}%`,
            height: `${(layer.height / height) * 100}%`,
          }}
        >
          <Image src={layer.src} alt="" fill sizes={mobile ? "50vw" : "25vw"} />
        </div>
      ))}
    </div>
  );
}

/** Campaign copy and individual artwork layers are preserved from the supplied Figma frames. */
export async function CampaignBanner({
  campaign,
  compact = false,
  layout,
  content: supplied,
}: {
  campaign: CampaignKey;
  compact?: boolean;
  /** "strip": the homepage's split announcement (copy beside the photo); otherwise a full banner, or a card when compact. */
  layout?: "strip";
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
  const banner = (
    <section
      className={`campaign-banner${compact ? " campaign-compact" : ""}`}
      data-campaign={campaign}
      data-campaign-layout={layout ?? (compact ? "card" : "band")}
      aria-label={data.label || data.headline.join(" ")}
      style={vars}
    >
      <div className="campaign-scene">
        {data.artwork ? (
          <>
            <div className="campaign-art-desktop" data-artwork="desktop">
              <Image
                src={data.artwork.desktopImage}
                alt={data.artwork.alt}
                fill
                sizes="100vw"
                style={{ objectFit: "cover" }}
              />
            </div>
            <div className="campaign-art-mobile" data-artwork="mobile">
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
        <div className="campaign-shade" aria-hidden="true" />
        {campaign.startsWith("landing-") && (
          <div className="campaign-bottom-shade" aria-hidden="true" />
        )}
        <div className="campaign-copy">
          {layout === "strip" && (
            <span className="campaign-ornament" data-campaign-ornament aria-hidden="true">
              <i />
              <svg data-strip-rosette viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.3">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => <ellipse key={angle} cx="12" cy="5.2" rx="2.1" ry="3.6" transform={`rotate(${angle} 12 12)`} />)}
                <circle cx="12" cy="12" r="3.6" />
                <rect x="10.8" y="10.8" width="2.4" height="2.4" fill="currentColor" stroke="none" transform="rotate(45 12 12)" />
              </svg>
              <i />
            </span>
          )}
          {data.label && <p className="campaign-label">{data.label}</p>}
          <h2>
            {data.headline.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          {data.supporting && (
            <p className="campaign-supporting">{data.supporting}</p>
          )}
          {data.offer.length > 0 && (
            <p className="campaign-offer">
              {data.offer.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
          )}
          {data.eligibility && <p className="campaign-eligibility">{data.eligibility}</p>}
          <Link className="campaign-cta" href={data.href}>
            {data.cta}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </div>
    </section>
  );
  return data.schedule ? <CampaignWindow schedule={data.schedule} serverNow={Date.now()}>{banner}</CampaignWindow> : banner;
}
