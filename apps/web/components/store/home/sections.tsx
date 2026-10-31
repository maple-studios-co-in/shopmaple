import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ArrowRight, Check, Instagram } from "lucide-react";
import { SectionHeading, eyebrow } from "../section-heading";
import instagramPosts from "@/data/instagram-posts.json";
import type { HomeDetails, TemplateMedia, TemplateMediaKey } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { InstagramRail } from "./instagram-rail";
import { HomeNewsletterForm, HomeProjectForm } from "./forms";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { cn } from "@/lib/utils";
import { designSection, SectionLede } from "./layout";

export const homePage = "mx-auto w-full max-w-[1440px] px-4 md:px-8 xl:px-12";
export { eyebrow };

/** The difference copy as the design's "Our promise" block: heading, then the four promises on the cream strip. */
export function HomeDifference({
  content = defaultHomeDetails.difference,
  media,
}: { content?: HomeDetails["difference"]; media?: TemplateMedia } = {}) {
  const icons: TemplateMediaKey[] = ["home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4"];
  const headingId = useId();
  return (
    <section data-store data-home-difference aria-labelledby={headingId} className={designSection}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow={content.eyebrow} title={content.heading} id={headingId} />
        <Link href="/pages/contact" className="text-ui font-bold text-brand no-underline hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand after:ml-1.5 after:content-['→']">
          {content.cta}
        </Link>
      </div>
      <ul data-difference-promises className="m-0 grid max-w-[1280px] list-none grid-cols-4 gap-6 rounded-xl bg-cream p-6 max-[1024px]:grid-cols-2 max-[750px]:gap-x-4 max-[750px]:gap-y-5 max-[750px]:p-5">
        {content.promises.map((text, index) => {
          const artwork = resolveTemplateMedia(icons[index]!, media);
          return (
            <li key={icons[index]} className="flex items-center gap-3">
              <Image src={artwork.image} width={60} height={60} alt={artwork.alt} className="size-7 shrink-0" />
              <span className="text-card font-bold text-espresso max-[750px]:text-ui">{text}</span>
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
    <section data-store data-home-social aria-label="Maple on Instagram" className={cn(homePage, "grid justify-items-center gap-3 py-12 font-body md:py-16")}>
      <h2 className="font-serif text-[30px] leading-tight font-medium text-espresso md:text-[40px]">
        {heading ?? (second ? "See our social pressence" : "Our Social Proof")}
      </h2>
      <a href="https://www.instagram.com/the_maple_experience/" target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 text-ui text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <Instagram aria-hidden="true" className="size-5" /> @the_maple_experience <ArrowRight aria-hidden="true" className="size-4" />
      </a>
      <div className="w-full"><InstagramRail posts={posts} autoplay={autoplay} /></div>
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
    <section data-store data-home-testimonial aria-labelledby={headingId} className="bg-cream">
      <div className={designSection}>
        <SectionHeading eyebrow={heading} title="Loved for more than just our sofas." id={headingId} />
        <SectionLede>{subheading}</SectionLede>
        <div className="grid grid-cols-2 items-start gap-10 max-[1024px]:grid-cols-1 max-[750px]:gap-5">
          <video controls playsInline preload="none" poster={poster.image} aria-label={poster.alt}
            className="h-[460px] w-full rounded-xl bg-espresso object-cover max-[1024px]:h-auto max-[1024px]:aspect-video">
            <source src="https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/aee33cd277cb42e7804bfce64be22297/aee33cd277cb42e7804bfce64be22297.HD-720p-2.1Mbps-84199271.mp4?v=0" type="video/mp4" />
          </video>
          <figure data-testimonial-card className="m-0 flex flex-col gap-6 rounded-2xl bg-white p-8 text-espresso max-[750px]:gap-4 max-[750px]:p-5">
            <span aria-hidden="true" className="font-serif text-[64px] leading-[0.6] font-bold text-brand">“</span>
            <blockquote className="m-0 flex flex-col gap-6 max-[750px]:gap-4">
              <h3 className="font-serif text-[30px] leading-[1.1] font-bold max-[750px]:text-h3">{content.title}</h3>
              <div className="flex flex-col gap-3 text-lead max-[750px]:text-card">
                {content.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            </blockquote>
            <figcaption className="text-ui font-bold">{content.name}{content.attribution}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/** The newsletter panel in the current look, still shown on the product page. */
export function HomeNewsletter({
  content = defaultHomeDetails.newsletter,
  media,
}: { content?: HomeDetails["newsletter"]; media?: TemplateMedia } = {}) {
  const artwork = resolveTemplateMedia("home-newsletter", media);
  const bundledArtwork = artwork.image === resolveTemplateMedia("home-newsletter").image;
  const headingId = useId();
  return (
    <section data-store data-home-newsletter id="newsletter" aria-labelledby={headingId} className={cn(homePage, "py-6 font-body")}>
      <div className="grid items-center gap-8 rounded-[18px] bg-brand px-6 py-10 text-white md:grid-cols-2 md:px-12 md:py-14">
        <div className="grid gap-3">
          <h2 id={headingId} className="font-serif text-[32px] leading-tight font-medium md:text-[44px]">{content.heading}</h2>
          <p className="max-w-[360px] text-price text-white/85 md:text-lead">{content.body}</p>
        </div>
        <div className="grid gap-4">
          <Image src={artwork.image} alt={artwork.alt} width={1080} height={500} sizes="(max-width:767px) 75vw, 35vw"
            className="h-auto w-[min(280px,75%)]" style={bundledArtwork ? { filter: "brightness(0) invert(1)" } : undefined} />
          <h3 className="text-lead">{content.signupHeading}</h3>
          <HomeNewsletterForm />
        </div>
      </div>
    </section>
  );
}

/** The homepage newsletter ("Maple / PDF Review / Home"): a full-width burgundy band with no artwork. */
export function HomeNewsletterBand({
  content = defaultHomeDetails.newsletter,
}: { content?: HomeDetails["newsletter"] } = {}) {
  const headingId = useId();
  return (
    <section data-store data-home-newsletter id="newsletter" aria-labelledby={headingId} className="bg-brand text-white">
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[640px_minmax(0,580px)] gap-20 p-16 font-body max-[1140px]:grid-cols-2 max-[1140px]:gap-10 max-[1024px]:grid-cols-1 max-[1024px]:gap-8 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-5 max-[750px]:py-10">
        <div className="flex flex-col gap-4">
          <h2 id={headingId} className="max-w-[600px] font-serif text-[44px] leading-[1.1] font-bold max-[750px]:text-h2">{content.heading}</h2>
          <p className="max-w-[600px] text-lead text-[#f0e3d9] max-[750px]:text-card">{content.body}</p>
        </div>
        <div className="flex flex-col gap-3.5">
          <h3 data-newsletter-eyebrow className="text-label font-bold uppercase">{content.signupHeading}</h3>
          <HomeNewsletterForm look="band" />
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
    <section data-store data-home-values aria-label="Made for real living" className={cn(homePage, "grid justify-items-center gap-10 py-14 font-body md:py-20")}>
      <div data-watermark aria-hidden="true"
        className="bg-[linear-gradient(180deg,rgb(116_26_20/0.12),rgb(116_26_20/0.02))] bg-clip-text text-center text-[clamp(48px,10vw,140px)] leading-none font-extrabold tracking-[-0.02em] text-transparent">
        Maple Furnishers
      </div>
      <div className="grid w-full grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {content.map(({ key, title, body }) => {
          const artwork = resolveTemplateMedia(`home-value-${key}`, media);
          return (
            <div key={key} className="grid justify-items-center gap-3 text-center">
              <Image src={artwork.image} alt={artwork.alt} width={80} height={80} className="size-[72px]" />
              <h3 className="text-subhead font-medium text-espresso">{title}</h3>
              <p className="max-w-[260px] text-ui leading-[1.5] text-taupe">{body}</p>
            </div>
          );
        })}
      </div>
      <Link href="/pages/our-story"
        className="inline-flex items-center justify-center rounded-full bg-brand px-9 py-4 text-price font-bold text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        Experience Maple
      </Link>
    </section>
  );
}

export function HomeProject({
  content = defaultHomeDetails.project,
}: { content?: HomeDetails["project"] } = {}) {
  const headingId = useId();
  return (
    <section data-store data-home-project aria-labelledby={headingId} className="bg-cream">
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[600px_minmax(0,648px)] justify-between gap-16 p-16 font-body max-[1140px]:grid-cols-2 max-[1140px]:gap-10 max-[1024px]:grid-cols-1 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:gap-8 max-[750px]:px-5 max-[750px]:py-10">
        <div className="flex flex-col gap-6 max-[750px]:gap-4">
          <p data-section-eyebrow className={eyebrow}>Let’s connect</p>
          <h2 id={headingId} className="font-serif text-[54px] leading-[1.1] font-bold text-espresso max-[750px]:text-[36px]">{content.heading}</h2>
          <p data-project-intro className="max-w-[530px] text-[18px] leading-[1.45] text-espresso max-[750px]:text-price">
            {content.introBefore.trimEnd()} <strong className="font-bold">{content.responseTime}</strong> {content.introAfter.trimStart()}
          </p>
          <p data-project-body className="flex max-w-[528px] items-start gap-3.5 text-ui text-taupe">
            <Check aria-hidden="true" className="size-6 shrink-0 text-brand" />{content.body}
          </p>
        </div>
        <div data-form-card className="rounded-2xl bg-white p-7 max-[750px]:p-5">
          <HomeProjectForm />
        </div>
      </div>
    </section>
  );
}
