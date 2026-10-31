import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ArrowRight, Check, Instagram } from "lucide-react";
import instagramPosts from "@/data/instagram-posts.json";
import type { HomeDetails, TemplateMedia, TemplateMediaKey } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { InstagramRail } from "./instagram-rail";
import { HomeNewsletterForm, HomeProjectForm } from "./forms";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { cn } from "@/lib/utils";

export const homePage = "mx-auto w-full max-w-[1440px] px-4 md:px-8 xl:px-12";
export const eyebrow = "text-label font-bold tracking-[0.04em] text-brand uppercase";

/** A centred serif heading with the design's thin rule-and-flower ornament under it. */
export function OrnamentHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="grid justify-items-center gap-2 text-center">
      <h2 id={id} className="font-serif text-[30px] leading-tight font-semibold text-brand md:text-[34px]">{children}</h2>
      <span data-ornament aria-hidden="true" className="flex items-center gap-2 text-brand">
        <span className="h-px w-12 bg-brand/30" />✻<span className="h-px w-12 bg-brand/30" />
      </span>
    </div>
  );
}

export function HomeDifference({
  content = defaultHomeDetails.difference,
  media,
}: { content?: HomeDetails["difference"]; media?: TemplateMedia } = {}) {
  const icons: TemplateMediaKey[] = ["home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4"];
  return (
    <section data-store data-home-difference className={cn(homePage, "grid justify-items-center gap-3 py-12 text-center font-body md:py-16")}>
      <p data-eyebrow className="text-ui font-semibold tracking-[0.04em] text-espresso uppercase md:text-price">{content.eyebrow}</p>
      <h2 className="font-serif text-[30px] leading-tight font-bold text-brand md:text-[40px]">{content.heading}</h2>
      <Link href="/pages/contact" className="inline-flex items-center gap-2 text-price text-brand no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        {content.cta} <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      <ul className="mt-6 grid w-full grid-cols-2 gap-y-6 md:mt-8 lg:grid-cols-4">
        {content.promises.map((text, index) => {
          const artwork = resolveTemplateMedia(icons[index]!, media);
          return (
            <li key={icons[index]} className="flex flex-col items-center justify-center gap-3 px-3 text-center [&+&]:[border-left:1px_solid_var(--color-sand)] md:flex-row md:text-left max-lg:[&:nth-child(3)]:[border-left:0]">
              <Image src={artwork.image} width={60} height={60} alt={artwork.alt} className="size-12 shrink-0 md:size-[60px]" />
              <span className="font-serif text-price font-bold text-espresso md:text-subhead">{text}</span>
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
    <section data-store data-home-testimonial aria-labelledby={headingId} className={cn(homePage, "grid gap-10 py-12 font-body md:py-20")}>
      <header className="grid justify-items-center gap-1 text-center">
        <p className={eyebrow}>{subheading}</p>
        <h2 id={headingId} className="font-serif text-[30px] leading-tight font-semibold text-espresso md:text-[40px]">{heading}</h2>
      </header>
      <figure className="relative mx-auto grid max-w-[880px] justify-items-center gap-5 text-center">
        <span aria-hidden="true" className="absolute -top-6 -left-2 font-serif text-[120px] leading-none text-espresso/10 md:-left-10">“</span>
        <blockquote className="grid gap-5">
          <h3 className="text-[24px] leading-[1.25] font-bold text-espresso before:content-['“'] after:content-['”'] md:text-[32px]">{content.title}</h3>
          <div className="grid gap-3 text-card leading-[1.6] text-taupe md:text-price">
            {content.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </blockquote>
        <figcaption className="text-price text-espresso"><strong className="font-bold">{content.name}</strong><span>{content.attribution}</span></figcaption>
        <div data-review-stars aria-label="5 out of 5 stars" className="tracking-[0.3em] text-brand">★ ★ ★ ★ ★</div>
      </figure>
      <video controls playsInline preload="none" poster={poster.image} aria-label={poster.alt}
        className="mx-auto aspect-video w-full max-w-[880px] rounded-[18px] bg-espresso object-cover">
        <source src="https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/aee33cd277cb42e7804bfce64be22297/aee33cd277cb42e7804bfce64be22297.HD-720p-2.1Mbps-84199271.mp4?v=0" type="video/mp4" />
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
  return (
    <section data-store data-home-project className="bg-linen py-12 font-body md:py-20">
      <div className={cn(homePage, "grid items-start gap-10 lg:grid-cols-2")}>
        <div className="grid gap-5">
          <p data-eyebrow className={eyebrow}>Let’s connect</p>
          <h2 className="font-serif text-[34px] leading-tight font-bold text-espresso md:text-[46px]">{content.heading}</h2>
          <p data-project-intro className="max-w-[480px] text-price leading-[1.5] text-espresso md:text-lead">
            {content.introBefore.trimEnd()} <strong className="font-semibold">{content.responseTime}</strong> {content.introAfter.trimStart()}
          </p>
          <p data-project-body className="flex max-w-[480px] items-start gap-3 text-ui leading-[1.5] text-taupe">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />{content.body}
          </p>
        </div>
        <div data-form-card className="rounded-[14px] bg-white p-5 shadow-[0_1px_0_var(--color-sand)] md:p-6">
          <HomeProjectForm />
        </div>
      </div>
    </section>
  );
}
