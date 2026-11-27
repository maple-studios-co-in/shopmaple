import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CampaignWindow } from "./campaign-window";
import campaigns from "@/data/diwali-campaigns.json";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import { defaultStorefrontContent } from "@/lib/content-defaults";
import { campaignArtworkDisplay } from "@/lib/campaign-artwork";
import { bannerLookOf } from "@shopmaple/contracts";

export type CampaignKey = keyof typeof campaigns;
type Artwork = (typeof campaigns)[CampaignKey]["desktop"];

function ArtworkLayer({
  artwork,
  mobile,
  framed = false,
  eager = false,
}: {
  artwork: Artwork;
  mobile: boolean;
  /** Load the pictures at once: the page's first banner, in view as it opens. */
  eager?: boolean;
  /** Keep the slices in one frame at the artwork's own proportions (the strip shows a crop of it, not a squeezed copy). */
  framed?: boolean;
}) {
  const width = mobile ? 500 : 1900;
  const height = mobile ? 500 : 350;
  const tiles = artwork.layers.map((layer) => (
    <div
      key={layer.nodeId}
      data-figma-node={layer.nodeId}
      className="campaign-art-tile"
      style={{
        left: `${(layer.x / width) * 100}%`,
        top: `${(layer.y / height) * 100}%`,
        // Each slice reaches 1px past its edge: at percentage sizes the edges fall between pixels, and without the overlap
        // a hairline of the dark background shows where two slices meet. The scene clips the outer edges.
        width: `calc(${(layer.width / width) * 100}% + 1px)`,
        height: `calc(${(layer.height / height) * 100}% + 1px)`,
      }}
    >
      <Image src={layer.src} alt="" fill sizes={mobile ? "50vw" : "25vw"} {...(eager ? { loading: "eager" as const } : {})} />
    </div>
  ));
  return (
    <div
      className={mobile ? "campaign-art-mobile" : "campaign-art-desktop"}
      data-artwork={mobile ? "mobile" : "desktop"}
      aria-hidden="true"
    >
      {framed ? <div className="campaign-art-frame" data-art-frame style={{ aspectRatio: `${width} / ${height}` }}>{tiles}</div> : tiles}
    </div>
  );
}

/** Campaign copy and individual artwork layers are preserved from the supplied Figma frames. */
export async function CampaignBanner({
  campaign,
  compact = false,
  layout,
  content: supplied,
  eager = false,
}: {
  campaign: CampaignKey;
  compact?: boolean;
  /** "strip": the homepage's split announcement (copy beside the photo); otherwise a full banner, or a card when compact. */
  layout?: "strip";
  /** A specific content document (for example a staff draft); defaults to the published snapshot. */
  content?: StorefrontDocument;
  /** The page's first banner, in view as it opens: its wide-screen pictures load at once. */
  eager?: boolean;
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
  // The announcement strip showing a finished banner staff uploaded (owner, 19 Nov 2026; lib/campaign-artwork.ts): the
  // picture is the whole banner, uncropped at its own proportions, the phone banner on phones, and one link to the
  // campaign. Its words are the picture's own, so the strip writes none over or beside it; the button's words stay for
  // screen readers. Every other banner, and the strip's photo design, is drawn below as before.
  if (layout === "strip" && data.artwork && campaignArtworkDisplay(data.artwork) === "banner") {
    const art = data.artwork;
    const whole = (
      <section className="campaign-banner" data-campaign={campaign} data-campaign-layout="strip" data-campaign-whole=""
        aria-label={data.label || data.headline.join(" ")}>
        <Link className="campaign-scene campaign-whole-link" href={data.href} data-picture-target={`campaign:${campaign}`}>
          <picture className="campaign-whole-picture">
            <source media="(max-width: 749px)" srcSet={art.mobileImage} />
            {/* Not the image optimizer: the banner keeps its own proportions, whatever size staff upload, and library
                uploads are already web-sized WebP. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art.desktopImage} alt={art.alt} decoding="async" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} />
          </picture>
          <span className="sr-only">{data.cta}</span>
        </Link>
      </section>
    );
    return data.schedule ? <CampaignWindow schedule={data.schedule} serverNow={Date.now()}>{whole}</CampaignWindow> : whole;
  }
  // How the banner shows (owner, 25 Nov 2026: "gradient, texts, cta all should be completely editable"; banner-look.ts):
  // each part is drawn only when it is on and has words, so a cleared button leaves nothing behind; the shade sits
  // behind words only; without a button the banner itself is the link to the campaign's destination.
  const look = bannerLookOf("look" in data ? data.look : undefined);
  const headline = data.headline.filter((line) => line.trim());
  const offer = data.offer.filter((line) => line.trim());
  const words = look.words && Boolean(data.label.trim() || headline.length || data.supporting?.trim() || offer.length || data.eligibility.trim());
  const button = look.button && data.cta.trim().length > 0;
  const shade = words && look.shade !== "none";
  const name = data.label.trim() || headline.join(" ") || data.artwork?.alt || data.cta.trim() || "Campaign";
  const sceneChildren = (
    <>
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
            <ArtworkLayer artwork={data.desktop} mobile={false} framed={layout === "strip"} eager={eager} />
            <ArtworkLayer artwork={data.mobile} mobile />
          </>
        )}
        {shade && <div className="campaign-shade" aria-hidden="true" />}
        {shade && campaign.startsWith("landing-") && (
          <div className="campaign-bottom-shade" aria-hidden="true" />
        )}
        {(words || button) && <div className="campaign-copy">
          {words && layout === "strip" && (
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
          {words && data.label.trim() && <p className="campaign-label">{data.label}</p>}
          {words && headline.length > 0 && (
            <h2>
              {headline.map((line, index) => (
                <span key={index}>{line}</span>
              ))}
            </h2>
          )}
          {words && data.supporting?.trim() && (
            <p className="campaign-supporting">{data.supporting}</p>
          )}
          {words && offer.length > 0 && (
            <p className="campaign-offer">
              {offer.map((line, index) => (
                <span key={index}>{line}</span>
              ))}
            </p>
          )}
          {words && data.eligibility.trim() && <p className="campaign-eligibility">{data.eligibility}</p>}
          {button && (
            <Link className="campaign-cta" href={data.href} data-fill-button="">
              {data.cta}
              <span aria-hidden="true"> →</span>
            </Link>
          )}
        </div>}
    </>
  );
  const banner = (
    <section
      className={`campaign-banner${compact ? " campaign-compact" : ""}`}
      data-campaign={campaign}
      data-campaign-layout={layout ?? (compact ? "card" : "band")}
      data-banner-shade={shade ? look.shade : "none"}
      data-banner-tone={look.tone}
      data-banner-size={look.size}
      data-banner-font={look.font}
      data-banner-words={words ? undefined : "none"}
      data-banner-button={button ? undefined : "none"}
      aria-label={name}
      style={vars}
    >
      {button ? (
        <div className="campaign-scene" data-picture-target={`campaign:${campaign}`}>{sceneChildren}</div>
      ) : (
        // No button: the whole banner is the link. Its words, when shown, name it; otherwise the campaign's name does.
        <Link className="campaign-scene campaign-scene-link" href={data.href} data-picture-target={`campaign:${campaign}`}
          aria-label={words ? undefined : name}>{sceneChildren}</Link>
      )}
    </section>
  );
  return data.schedule ? <CampaignWindow schedule={data.schedule} serverNow={Date.now()}>{banner}</CampaignWindow> : banner;
}
