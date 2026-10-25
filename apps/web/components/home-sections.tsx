import { InstagramRail, MovingCities } from "@/components/motion-rail";
import instagramPosts from "@/data/instagram-posts.json";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRight, Instagram } from "lucide-react";
import { shopFile } from "@/lib/format";
import { HomeProjectForm, HomeNewsletterForm } from "@/components/home-forms";
import type { HomeDetails } from "@shopmaple/contracts";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

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
}: { content?: HomeDetails["difference"] } = {}) {
  const icons = [
    "Custom_F.svg",
    "Del_mf.svg",
    "Icon_homepage.svg",
    "Maple_Banner_5.svg",
  ];
  return (
    <section className="home-difference home-container">
      <p className="home-eyebrow">{content.eyebrow}</p>
      <h2>{content.heading}</h2>
      <Link className="button" href="/pages/contact">
        {content.cta} <ArrowRight size={18} />
      </Link>
      <ul>
        {content.promises.map((text, index) => (
          <li key={index}>
            <Image src={shopFile(icons[index]!)} width={60} height={60} alt="" />
            <span>{text}</span>
          </li>
        ))}
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
  heading = "Why They Love Us",
  subheading = "Thoughtful designs. Exceptional service.",
}: {
  content?: HomeDetails["testimonial"];
  heading?: string;
  subheading?: string;
} = {}) {
  return (
    <section className="home-testimonial">
      <header>
        <h2>{heading}</h2>
        <p>{subheading}</p>
      </header>
      <div className="home-testimonial-grid">
        <video
          controls
          playsInline
          preload="none"
          poster={shopFile(
            "preview_images/aee33cd277cb42e7804bfce64be22297.thumbnail.0000000000.jpg?v=1778852379&width=960",
          )}
          aria-label="Maple customer testimonial"
        >
          <source
            src="https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/aee33cd277cb42e7804bfce64be22297/aee33cd277cb42e7804bfce64be22297.HD-720p-2.1Mbps-84199271.mp4?v=0"
            type="video/mp4"
          />
        </video>
        <figure>
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
}: { content?: HomeDetails["newsletter"] } = {}) {
  return (
    <section className="home-newsletter" id="newsletter">
      <div className="home-container">
        <Image
          src={shopFile("Cover_Image_Maple_1.png")}
          alt="Maple Furnishers"
          width={1080}
          height={500}
          sizes="(max-width:749px) 75vw, 35vw"
        />
        <div className="home-newsletter-row">
          <div>
            <h2>{content.heading}</h2>
            <p>{content.body}</p>
          </div>
          <div>
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
}: { content?: HomeDetails["values"] } = {}) {
  const images = {
    "quiet-luxury": "Icon_maple_3.svg",
    "real-living": "Cover_Image_Maple_2.svg",
    "ages-beautifully": "Icon_maple_1.svg",
    strength: "Cover_Image_Maple_5.svg",
  };
  return (
    <section
      className="home-values home-container"
      aria-label="Made for real living"
    >
      {content.map(({ key, title, body }) => (
        <div key={key}>
          <Image src={shopFile(images[key])} alt="" width={80} height={80} />
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      ))}
    </section>
  );
}

export function HomeCities({
  content = defaultHomeDetails.cities,
  autoplay = true,
}: { content?: HomeDetails["cities"]; autoplay?: boolean } = {}) {
  const cities: [string, string][] = [
    ["Delhi.svg", "Delhi"],
    ["Kolkata.svg", "Kolkata"],
    ["Hyderabad.svg", "Hyderabad"],
    ["VARANASI1.svg", "Varanasi"],
    ["Mumbai.svg", "Mumbai"],
    ["jaipur.svg", "Jaipur"],
    ["bengaluru_5d95b443-519f-4637-9d23-0cbbf2838908.svg", "Bengaluru"],
    ["chennai.svg", "Chennai"],
    ["gujrat.svg", "Gujarat"],
    ["engaged_3_2d4f6db1-cb60-497e-b2a1-061b5886d0ec.svg", ""],
    ["engaged_5.svg", ""],
    ["engaged_4.svg", ""],
    ["engaged_11.svg", ""],
    ["engaged_9.svg", ""],
    ["engaged_10.svg", ""],
    ["engaged_12.svg", ""],
    ["engaged_2_f055519a-d518-4ed3-9409-2b2a8924295a.svg", ""],
    ["Agra.svg", "Agra"],
  ];
  return (
    <section className="home-cities home-container">
      <header>
        <p className="home-eyebrow">{content.eyebrow}</p>
        <h2>{content.heading}</h2>
      </header>
      <MovingCities autoplay={autoplay}>
        {cities.map(([image, city]) => (
          <Image
            key={image}
            src={shopFile(image)}
            alt={city}
            width={150}
            height={120}
          />
        ))}
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
