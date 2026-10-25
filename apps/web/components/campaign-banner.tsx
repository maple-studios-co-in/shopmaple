import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CampaignWindow } from "./campaign-window";
import campaigns from "@/data/diwali-campaigns.json";
import { getPublishedContent } from "@/lib/content";
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
}: {
  campaign: CampaignKey;
  compact?: boolean;
}) {
  const content = await getPublishedContent();
  if (!content.campaignsAvailable) return null;
  const override = content.campaigns.find((item) => item.key === campaign);
  const fallback = defaultStorefrontContent.campaigns.find(
    (item) => item.key === campaign,
  );
  const data = { ...campaigns[campaign], ...fallback, ...override };
  const vars = {
    "--campaign-gradient-width": `${(data.desktop.gradientWidth / 1900) * 100}%`,
    "--campaign-gradient":
      data.desktop.gradient ??
      "linear-gradient(90deg, #741a14 0%, rgba(116,26,20,.84) 53%, rgba(116,26,20,0) 100%)",
  } as CSSProperties;
  const banner = (
    <section
      className={`campaign-banner${compact ? " campaign-compact" : ""}`}
      data-campaign={campaign}
      aria-label={data.label}
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
          <p className="campaign-label">{data.label}</p>
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
          <p className="campaign-eligibility">{data.eligibility}</p>
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
