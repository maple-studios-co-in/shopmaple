import { ContentImage as Image } from "@/components/content-image";
import type { ReactNode } from "react";
import type { HomeCollectionTile } from "@shopmaple/contracts";
import Link from "next/link";
import { CampaignBanner } from "@/components/campaign-banner";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/store/product-card";
import { HomeCarousel } from "@/components/home-carousel";
import { HomeTicker } from "@/components/home-ticker";
import { SectionReveal } from "@/components/section-reveal";
import { HomeNimbus } from "@/components/home-nimbus";
import {
  HomeDifference,
  HomeSocial,
  HomeValues,
  HomeCities,
  HomeTestimonial,
  HomeNewsletter,
  HomeProject,
} from "@/components/home-sections";
import { getProductCards } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { eyebrow, homePage, OrnamentHeading } from "./sections";
import { ProductHighlightsProvider } from "../product-highlights";
import type { StorefrontDocument } from "@/lib/content";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { resolveHomeMerchandising } from "@/lib/home-merchandising-defaults";
import { rasterShopifyArtwork } from "@/lib/shopify-artwork";

function CategoryCircles({ items }: { items: HomeCollectionTile[] }) {
  return (
    <div data-home-categories className="grid grid-cols-3 gap-x-4 gap-y-6 md:grid-cols-6 md:gap-6">
      {items.filter((item) => item.enabled).map((item) => (
        <Link href={`/collections/${item.collectionHandle}`} key={item.key}
          className="group/circle grid justify-items-center gap-3 text-center no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
          <div className="relative aspect-square w-full max-w-[170px] overflow-hidden rounded-full bg-cream shadow-[0_0_0_5px_white,0_6px_18px_rgb(41_37_31/0.12)]">
            <Image src={rasterShopifyArtwork(item.image)} alt={item.alt} fill
              sizes="(max-width:767px) calc((100vw - 64px) / 3), (min-width:1440px) 170px, calc((100vw - 216px) / 6)"
              className="object-cover transition-transform duration-500 group-hover/circle:scale-105 motion-reduce:transition-none" />
          </div>
          <h3 className="text-meta font-medium text-espresso md:text-ui">{item.title}</h3>
        </Link>
      ))}
    </div>
  );
}

function OfferCards({ items }: { items: HomeCollectionTile[] }) {
  return (
    <div data-home-offers className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0">
      {items.filter((item) => item.enabled).map((item) => (
        <Link href={`/collections/${item.collectionHandle}`} key={item.key}
          className="relative block aspect-[328/170] w-[70vw] shrink-0 snap-start overflow-hidden rounded-[14px] bg-cream shadow-[0_2px_10px_rgb(41_37_31/0.08)] transition-shadow hover:shadow-[0_6px_20px_rgb(41_37_31/0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:w-auto">
          <Image src={rasterShopifyArtwork(item.image)} alt={item.alt} fill
            sizes="(max-width:767px) 70vw, (min-width:1440px) 328px, calc((100vw - 144px) / 4)" className="object-cover" />
        </Link>
      ))}
    </div>
  );
}

async function HomeProducts({
  handles,
  heading,
  label,
  browseHref,
  tint = false,
}: {
  handles: string[];
  heading?: string;
  label: string;
  browseHref: string;
  tint?: boolean;
}) {
  const products = await getProductCards(handles).catch(async () => {
    // Preserve healthy siblings when one failed card invalidates the batch.
    const recovered = await Promise.all(
      handles.map((handle) => getProductCards([handle]).catch(() => [])),
    );
    return recovered.flat();
  });
  return (
    <section data-store data-home-products aria-label={label} className={cn(tint && "bg-linen", "py-12 font-body md:py-16")}>
      <div className={cn(homePage, "grid gap-6")}>
        {heading && (
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-2">
              <p className={eyebrow}>Handpicked favourites</p>
              <h2 className="font-serif text-[32px] leading-tight font-bold text-espresso md:text-[42px]">{heading}</h2>
            </div>
            <Link href={browseHref} aria-label={`View all ${heading}`}
              className="inline-flex h-12 items-center justify-center rounded-md border border-solid border-sand bg-white px-6 text-ui font-bold text-brand no-underline hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:min-w-[212px]">
              View all {heading.toLowerCase()} →
            </Link>
          </header>
        )}
        {products.length ? (
          <HomeCarousel label={label}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </HomeCarousel>
        ) : (
          <p data-catalogue-unavailable className="text-card text-taupe [&_a]:font-semibold [&_a]:text-brand">
            This collection is temporarily unavailable.{" "}
            <Link href="/collections/all">Browse all furniture</Link>
          </p>
        )}
      </div>
    </section>
  );
}

/** The homepage assembled from one content document: the published snapshot for visitors, a draft for staff previews. */
export function HomePage({ content }: { content: StorefrontDocument }) {
  const copy = content.homeCopy;
  const details = resolveHomeDetails(content.homeDetails);
  const merchandising = resolveHomeMerchandising(content.homeMerchandising);
  const sections: Record<string, ReactNode> = {
    hero: <Hero content={details.hero} media={content.templateMedia?.filter(item =>
      item.key === "home-workshop-poster" || item.key.startsWith("home-hero-")
    )} />,
    announcement: <CampaignBanner campaign="landing-announcement" content={content} />,
    difference: <HomeDifference content={details.difference} media={content.templateMedia} />,
    categories: (
      <section data-store data-home-category-section className={cn(homePage, "grid gap-8 py-10 font-body md:py-14")}>
        <OrnamentHeading>{copy.categoryHeading}</OrnamentHeading>
        <CategoryCircles items={merchandising.categories} />
      </section>
    ),
    ticker: <HomeTicker text={copy.ticker} autoplay={content.motion.autoplayTicker ?? true} />,
    offers: (
      <section data-store aria-label="Offer collections" className={cn(homePage, "py-4 font-body")}>
        <OfferCards items={merchandising.offers} />
      </section>
    ),
    nimbus: <HomeNimbus content={details.nimbus} media={content.templateMedia?.filter(item => item.key === "home-nimbus")} />,
    "dining-banner": <CampaignBanner campaign="landing-dining-table" content={content} />,
    instagram: (
      <HomeSocial
        posts={content.instagramPosts}
        heading={copy.socialHeading}
        autoplay={content.motion.autoplaySocial}
      />
    ),
    bestsellers: (
      <HomeProducts
        handles={merchandising.bestsellers}
        heading={copy.bestsellersHeading}
        label="Bestsellers"
        browseHref="/collections/all"
        tint
      />
    ),
    "seating-banner": <CampaignBanner campaign="landing-sofa-accent-chair" content={content} />,
    chairs: (
      <HomeProducts
        handles={merchandising.chairs}
        heading={copy.chairsHeading ?? "Chairs"}
        label="Chair collection"
        browseHref="/collections/chairs"
      />
    ),
    promos: (
      <div className="campaign-promo-grid home-container">
        <CampaignBanner campaign="landing-dining" compact content={content} />
        <CampaignBanner campaign="landing-storage" compact content={content} />
        <CampaignBanner campaign="landing-consoles" compact content={content} />
      </div>
    ),
    testimonial: (
      <HomeTestimonial
        content={details.testimonial}
        media={content.templateMedia}
        heading={copy.testimonialHeading}
        subheading={copy.testimonialSubheading}
      />
    ),
    newsletter: <HomeNewsletter content={details.newsletter} media={content.templateMedia} />,
    values: <HomeValues content={details.values} media={content.templateMedia} />,
    cities: (
      <HomeCities content={details.cities} autoplay={content.motion.autoplayCities} media={content.templateMedia} layout={content.homeCitiesLayout} />
    ),
    project: <HomeProject content={details.project} />,
  };
  return (
    // The document's own highlights, so a staff draft previews its colours, ratings and New flags.
    <ProductHighlightsProvider value={content.productHighlights}>
    <SectionReveal enabled={content.motion.revealSections}>
      <h1 className="sr-only">Maple Furnishers</h1>
      {content.homeSections
        .filter((section) => section.enabled)
        .map((section) => (
          <div
            className="contents"
            key={section.key}
            data-home-section={section.key}
          >
            {sections[section.key]}
          </div>
        ))}
    </SectionReveal>
    </ProductHighlightsProvider>
  );
}
