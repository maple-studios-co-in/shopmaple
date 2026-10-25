import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import campaigns from "@/data/diwali-campaigns.json";

export type CampaignKey = keyof typeof campaigns;
type Artwork = (typeof campaigns)[CampaignKey]["desktop"];

function ArtworkLayer({ artwork, mobile }: { artwork: Artwork; mobile: boolean }) {
  const width = mobile ? 500 : 1900;
  const height = mobile ? 500 : 350;
  return (
    <div className={mobile ? "campaign-art-mobile" : "campaign-art-desktop"} data-artwork={mobile ? "mobile" : "desktop"} aria-hidden="true">
      {artwork.layers.map(layer => (
        <div key={layer.nodeId} data-figma-node={layer.nodeId} className="campaign-art-tile" style={{ left: `${layer.x / width * 100}%`, top: `${layer.y / height * 100}%`, width: `${layer.width / width * 100}%`, height: `${layer.height / height * 100}%` }}>
          <Image src={layer.src} alt="" fill sizes={mobile ? "50vw" : "25vw"} />
        </div>
      ))}
    </div>
  );
}

/** Campaign copy and individual artwork layers are preserved from the supplied Figma frames. */
export function CampaignBanner({ campaign, compact = false, href }: { campaign: CampaignKey; compact?: boolean; href?: string }) {
  const data = campaigns[campaign];
  const vars = {
    "--campaign-gradient-width": `${data.desktop.gradientWidth / 1900 * 100}%`,
    "--campaign-gradient": data.desktop.gradient ?? "linear-gradient(90deg, #741a14 0%, rgba(116,26,20,.84) 53%, rgba(116,26,20,0) 100%)",
  } as CSSProperties;
  return (
    <section className={`campaign-banner${compact ? " campaign-compact" : ""}`} data-campaign={campaign} aria-label={data.label} style={vars}>
      <div className="campaign-scene">
        <ArtworkLayer artwork={data.desktop} mobile={false} />
        <ArtworkLayer artwork={data.mobile} mobile />
        <div className="campaign-shade" aria-hidden="true" />
        {campaign.startsWith("landing-") && <div className="campaign-bottom-shade" aria-hidden="true" />}
        <div className="campaign-copy">
          <p className="campaign-label">{data.label}</p>
          <h2>{data.headline.map(line => <span key={line}>{line}</span>)}</h2>
          {data.supporting && <p className="campaign-supporting">{data.supporting}</p>}
          {data.offer.length > 0 && <p className="campaign-offer">{data.offer.map(line => <span key={line}>{line}</span>)}</p>}
          <p className="campaign-eligibility">{data.eligibility}</p>
          <Link className="campaign-cta" href={href ?? data.href}>{data.cta}<span aria-hidden="true"> →</span></Link>
        </div>
      </div>
    </section>
  );
}
