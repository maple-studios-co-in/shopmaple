import { InstagramRail, MovingCities } from "@/components/motion-rail";
import instagramPosts from "@/data/instagram-posts.json";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRight, Instagram } from "lucide-react";
import { shopFile } from "@/lib/format";
import { HomeProjectForm, HomeNewsletterForm } from "@/components/home-forms";
import type { HomeDetails, HomeCitiesLayout, TemplateMedia, TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { defaultHomeCitiesLayout } from "@/lib/home-cities-defaults";
import { useId } from "react";

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

export function HomeDifference({
  content = defaultHomeDetails.difference,
  media,
}: { content?: HomeDetails["difference"]; media?: TemplateMedia } = {}) {
  const icons: TemplateMediaKey[] = ["home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4"];
  return (
    <section className="home-difference home-container">
      <p className="home-eyebrow">{content.eyebrow}</p>
      <h2>{content.heading}</h2>
      <Link className="button" href="/pages/contact">
        {content.cta} <ArrowRight size={18} />
      </Link>
      <ul>
        {content.promises.map((text, index) => {
          const artwork = resolveTemplateMedia(icons[index]!, media);
          return (
            <li key={icons[index]}>
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
      <a
        href="https://www.instagram.com/the_maple_experience/"
        target="_blank"
        rel="noreferrer"
      >
        <Instagram size={20} /> @the_maple_experience <ArrowRight size={18} />
      </a>
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
      <div className="home-testimonial-grid">
        <div className="home-testimonial-story">
          <header>
            <h2 id={headingId}>{heading}</h2>
            <p>{subheading}</p>
          </header>
          <video
            controls
            playsInline
            preload="none"
            poster={poster.image}
            aria-label={poster.alt}
          >
            <source
              src="https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/aee33cd277cb42e7804bfce64be22297/aee33cd277cb42e7804bfce64be22297.HD-720p-2.1Mbps-84199271.mp4?v=0"
              type="video/mp4"
            />
          </video>
        </div>
        <figure>
          <span className="home-testimonial-quote" aria-hidden="true">“</span>
          <blockquote>
            <h3>{content.title}</h3>
            {content.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </blockquote>
          <figcaption>
            <strong>{content.name}</strong>
            <span>{content.attribution}</span>
          </figcaption>
          <div className="home-review-stars" aria-label="5 out of 5 stars">
            ★ ★ ★ ★ ★
          </div>
        </figure>
      </div>
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
      <div className="home-container">
        <div className="home-newsletter-row">
          <div>
            <h2 id={headingId}>{content.heading}</h2>
            <p>{content.body}</p>
          </div>
          <div className="home-newsletter-signup">
            <Image
              src={artwork.image}
              alt={artwork.alt}
              width={1080}
              height={500}
              sizes="(max-width:749px) 75vw, 35vw"
              style={bundledArtwork ? { filter: "brightness(0) invert(1)" } : undefined}
            />
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
}: { content?: HomeDetails["values"]; media?: TemplateMedia } = {}) {
  return (
    <section
      className="home-values home-container"
      aria-label="Made for real living"
    >
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
    </section>
  );
}

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
        <h2>{content.heading}</h2>
        <a className="city-photo-credits" href="/media/cities/credits.html">Image credits</a>
      </header>
      <MovingCities autoplay={autoplay}>
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
      </MovingCities>
    </section>
  );
}

export function HomeProject({
  content = defaultHomeDetails.project,
}: { content?: HomeDetails["project"] } = {}) {
  return (
    <section className="home-project home-container">
      <div>
        <h2>{content.heading}</h2>
        <p>
          {content.introBefore.trimEnd()}{" "}
          <strong>{content.responseTime}</strong>{" "}
          {content.introAfter.trimStart()}
        </p>
        <p>{content.body}</p>
      </div>
      <HomeProjectForm />
    </section>
  );
}
