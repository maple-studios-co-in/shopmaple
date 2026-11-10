import { InstagramRail } from "@/components/motion-rail";
import { CityRail } from "@/components/city-rail";
import instagramPosts from "@/data/instagram-posts.json";
import { ContentImage as Image, getContentImageProps as getImageProps } from "@/components/content-image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { shopFile } from "@/lib/format";
import { HomeProjectForm, HomeNewsletterForm } from "@/components/home-forms";
import type { HomeDetails, HomeCitiesLayout, TemplateMedia, TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { defaultHomeCitiesLayout } from "@/lib/home-cities-defaults";
import { statementParts } from "@/lib/home-statement";
import { Fragment, useId } from "react";

export function HomeBanner({
  desktop,
  mobile,
  alt,
  href,
  flush = false,
}: {
  desktop: string;
  mobile: string;
  alt: string;
  href: string;
  flush?: boolean;
}) {
  const desktopProps = getImageProps({
    src: shopFile(desktop),
    alt,
    width: 2784,
    height: 700,
    sizes: "100vw",
  }).props;
  const mobileProps = getImageProps({
    src: shopFile(mobile),
    alt,
    width: 4796,
    height: 4796,
    sizes: "100vw",
  }).props;
  return (
    <div className={`home-promo ${flush ? "home-promo-flush" : ""}`}>
      <Link href={href}>
        <picture>
          <source
            media="(max-width: 749px)"
            srcSet={mobileProps.srcSet}
            sizes={mobileProps.sizes}
            width={4796}
            height={4796}
          />
          <img {...desktopProps} />
        </picture>
      </Link>
    </div>
  );
}

/**
 * The burgundy statement band: the admin's line, centred, with its last word set in italic script. The
 * closing clause ("it is crafted.") is typed out over and over by the homepage's lazy effects; the whole
 * line stays in the page for readers, and an invisible copy of the clause holds its width while it types.
 */
export function HomeStatementBand({ text }: { text: string }) {
  const parts = statementParts(text);
  if (!parts) return <p className="home-statement" data-statement-band>{text}</p>;
  const clause = <>{parts.before}<em data-statement-accent>{parts.accent}</em>{parts.after}</>;
  return (
    <p className="home-statement" data-statement-band>
      <span className="sr-only" data-statement-text>{text}</span>
      <span aria-hidden="true">
        {parts.lead}
        <span data-typed data-typed-before={parts.before} data-typed-accent={parts.accent} data-typed-after={parts.after}>
          <span data-typed-ghost>{clause}</span>
          <span data-typed-live>{clause}</span>
        </span>
      </span>
    </p>
  );
}

export function HomeDifference({
  content = defaultHomeDetails.difference,
  media,
}: { content?: HomeDetails["difference"]; media?: TemplateMedia } = {}) {
  const icons: TemplateMediaKey[] = ["home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4"];
  return (
    <section className="home-difference home-container">
      <p className="home-eyebrow" data-difference-eyebrow>{content.eyebrow}</p>
      <h2>{content.heading}</h2>
      <Link href="/contact" data-difference-link>
        {content.cta} <ArrowRight size={16} aria-hidden />
      </Link>
      <ul>
        {content.promises.map((text, index) => {
          const artwork = resolveTemplateMedia(icons[index]!, media);
          return (
            <li key={icons[index]} data-difference-promise>
              <Image src={artwork.image} width={60} height={60} alt={artwork.alt} />
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeSocial({
  second = false,
  posts = instagramPosts,
  heading,
  autoplay = true,
}: {
  second?: boolean;
  posts?: { href: string; src: string; alt?: string }[];
  heading?: string;
  autoplay?: boolean;
}) {
  return (
    <section
      className="home-social home-container"
      aria-label="Maple on Instagram"
    >
      <h2>
        {heading ?? (second ? "See our social pressence" : "Our Social Proof")}
      </h2>
      <InstagramRail posts={posts} autoplay={autoplay} />
    </section>
  );
}

export function HomeTestimonial({
  content = defaultHomeDetails.testimonial,
  media,
  heading = "Why They Love Us",
  subheading = "Thoughtful designs. Exceptional service.",
}: {
  content?: HomeDetails["testimonial"];
  media?: TemplateMedia;
  heading?: string;
  subheading?: string;
} = {}) {
  const poster = resolveTemplateMedia("home-testimonial-poster", media);
  const headingId = useId();
  return (
    <section className="home-testimonial" aria-labelledby={headingId}>
      <header className="sr-only">
        <h2 id={headingId}>{heading}</h2>
        <p>{subheading}</p>
      </header>
      <figure className="home-quote">
        <span className="home-quote-mark home-testimonial-quote" aria-hidden="true">“</span>
        <blockquote>
          <h3 data-quote-text>{content.title}</h3>
          {content.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </blockquote>
        <figcaption data-quote-author>
          <strong>{content.name}</strong>
          <span>{content.attribution}</span>
        </figcaption>
      </figure>
      <video controls playsInline preload="none" poster={poster.image} aria-label={poster.alt}>
        <source
          src="https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/aee33cd277cb42e7804bfce64be22297/aee33cd277cb42e7804bfce64be22297.HD-720p-2.1Mbps-84199271.mp4?v=0"
          type="video/mp4"
        />
      </video>
    </section>
  );
}

export function HomeNewsletter({
  content = defaultHomeDetails.newsletter,
  media,
}: { content?: HomeDetails["newsletter"]; media?: TemplateMedia } = {}) {
  const artwork = resolveTemplateMedia("home-newsletter", media);
  const bundledArtwork = artwork.image === resolveTemplateMedia("home-newsletter").image;
  const headingId = useId();
  return (
    <section className="home-newsletter" id="newsletter" aria-labelledby={headingId}>
      <div className="home-newsletter-mark" data-newsletter-mark>
        <Image
          src={artwork.image}
          alt={artwork.alt}
          width={1080}
          height={500}
          sizes="(max-width:749px) 70vw, 26vw"
          style={bundledArtwork ? { filter: "brightness(0) invert(1)" } : undefined}
        />
      </div>
      <div className="home-container">
        <div className="home-newsletter-row">
          <div>
            <h2 id={headingId}>{content.heading}</h2>
            <p>{content.body}</p>
          </div>
          <div className="home-newsletter-signup">
            <h3>{content.signupHeading}</h3>
            <HomeNewsletterForm />
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeValues({
  content = defaultHomeDetails.values,
  media,
  watermark = false,
}: {
  content?: HomeDetails["values"];
  media?: TemplateMedia;
  /** The homepage closes with the brand name behind the row and an invitation to the story; other pages show the row alone. */
  watermark?: boolean;
} = {}) {
  return (
    <section
      className="home-values home-container"
      aria-label="Made for real living"
    >
      {watermark && <div className="home-values-watermark" data-values-watermark data-reveal aria-hidden="true">Maple Furnishers</div>}
      {content.map(({ key, title, body }) => {
        const artwork = resolveTemplateMedia(`home-value-${key}`, media);
        return (
          <div key={key}>
            <Image src={artwork.image} alt={artwork.alt} width={80} height={80} />
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        );
      })}
      {watermark && <Link className="home-values-cta" href="/our-story" data-values-cta data-fill-button="">Experience Maple</Link>}
    </section>
  );
}

/** A heading drawn on two lines, its first word over the rest ("20+" over "Cities"), still one heading to read. */
function headingLines(heading: string) {
  const space = heading.search(/\s/);
  const lines = space < 0 ? [heading] : [heading.slice(0, space), heading.slice(space).trim()];
  return lines.map((line, index) => <Fragment key={index}>{index > 0 && " "}<span>{line}</span></Fragment>);
}

/** Figma 177:1159: the panel with its eyebrow, figure and promise beside the arches, between two arrows. */
export function HomeCities({
  content = defaultHomeDetails.cities,
  autoplay = true,
  media,
  layout = defaultHomeCitiesLayout,
}: {
  content?: HomeDetails["cities"];
  autoplay?: boolean;
  media?: TemplateMedia;
  layout?: HomeCitiesLayout;
} = {}) {
  const cities = layout.filter(city => city.enabled);
  if (!cities.length) return null;
  return (
    <section className="home-cities home-container">
      <header>
        <p className="home-eyebrow">{content.eyebrow}</p>
        <h2>{headingLines(content.heading)}</h2>
        <span className="home-cities-rule" data-cities-rule aria-hidden="true"><i /><i /></span>
        <p className="home-cities-description" data-cities-description>{content.description ?? defaultHomeDetails.cities.description}</p>
      </header>
      <CityRail autoplay={autoplay}>
        {cities.map(({ key }) => {
          const artwork = resolveTemplateMedia(`home-city-${key}`, media);
          return (
            <figure key={key} className="home-city-card">
              <div className="home-city-artwork">
                <Image
                  src={artwork.image}
                  alt={artwork.alt}
                  width={400}
                  height={600}
                />
              </div>
              {artwork.alt && <figcaption>{artwork.alt}</figcaption>}
            </figure>
          );
        })}
      </CityRail>
    </section>
  );
}

export function HomeProject({
  content = defaultHomeDetails.project,
}: { content?: HomeDetails["project"] } = {}) {
  return (
    <section className="home-project home-container">
      <div>
        <span className="home-project-eyebrow" data-project-eyebrow>Let’s connect</span>
        <h2>{content.heading}</h2>
        <p>
          {content.introBefore.trimEnd()}{" "}
          <strong>{content.responseTime}</strong>{" "}
          {content.introAfter.trimStart()}
        </p>
        <p>{content.body}</p>
        <div className="home-project-promise" data-project-promise>
          <Check size={18} aria-hidden />
          <span><strong>Quick response</strong> <span>We respond within {content.responseTime}.</span></span>
        </div>
      </div>
      <HomeProjectForm card />
    </section>
  );
}
