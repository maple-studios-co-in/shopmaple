import { ContentImage as Image } from "@/components/content-image";
import type { ReactNode } from "react";
import type { HomeCollectionTile } from "@shopmaple/contracts";
import Link from "next/link";
import { CampaignBanner } from "@/components/store/campaign-banner";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/store/product-card";
import { HomeCarousel } from "@/components/store/carousel";
import { HomeTicker } from "@/components/home-ticker";
import { SectionReveal } from "@/components/section-reveal";
import { HomeNimbus } from "@/components/home-nimbus";
import {
  HomeDifference,
  HomeSocial,
  HomeValues,
  HomeTestimonial,
  HomeNewsletterBand,
  HomeProject,
} from "@/components/home-sections";
import { getProductCards } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { railFocus } from "../carousel-styles";
import { designSection, SectionLede } from "./layout";
import { HomeCityCards } from "./cities";
import { SectionHeading } from "../section-heading";
import { PromiseStrip } from "../promise-strip";
import { ProductHighlightsProvider } from "../product-highlights";
import type { StorefrontDocument } from "@/lib/content";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { resolveHomeMerchandising } from "@/lib/home-merchandising-defaults";
import { rasterShopifyArtwork } from "@/lib/shopify-artwork";

function CategoryCircles({ items }: { items: HomeCollectionTile[] }) {
  return (
    <div data-home-categories className="grid grid-cols-6 gap-7 max-[1024px]:grid-cols-3 max-[750px]:gap-x-3 max-[750px]:gap-y-5">
      {items.filter((item) => item.enabled).map((item) => (
        <Link href={`/collections/${item.collectionHandle}`} key={item.key}
          className="group/circle flex flex-col items-center gap-4 text-center no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand max-[750px]:gap-2.5">
          <div className="relative aspect-square w-full max-w-[clamp(164px,11.4vw,260px)] overflow-hidden rounded-full bg-cream">
            <Image src={rasterShopifyArtwork(item.image)} alt={item.alt} fill
              sizes="(max-width:750px) calc((100vw - 64px) / 3), clamp(164px, 11.4vw, 260px)"
              className="object-cover transition-transform duration-500 group-hover/circle:scale-105 motion-reduce:transition-none" />
          </div>
          <h3 data-category-label className="text-price font-bold text-espresso after:ml-1.5 after:content-['→'] max-[750px]:text-ui">{item.title}</h3>
        </Link>
      ))}
    </div>
  );
}

function OfferCards({ items }: { items: HomeCollectionTile[] }) {
  return (
    <div data-home-offers className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 max-[750px]:grid-cols-2 max-[750px]:gap-3">
      {items.filter((item) => item.enabled).map((item) => (
        <Link data-offer-card href={`/collections/${item.collectionHandle}`} key={item.key}
          className="group/offer flex flex-col gap-3 rounded-xl bg-cream p-6 text-espresso no-underline transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[750px]:p-4">
          <h3 className="font-serif text-[27px] leading-[1.1] font-bold max-[750px]:text-subhead">{item.title}</h3>
          <span data-offer-link className="text-ui font-bold text-brand group-hover/offer:underline group-hover/offer:underline-offset-4">Explore →</span>
        </Link>
      ))}
    </div>
  );
}

/** The design's five-up rail of 246 px cards: six-up from 1920 px, three-up under 1024 px, two-up under 750 px. */
const designRail = "grid grid-flow-col auto-cols-[calc((100%-80px)/5)] min-[1920px]:auto-cols-[calc((100%-100px)/6)] gap-5 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden *:min-w-0 *:snap-start max-[1024px]:auto-cols-[calc((100%-40px)/3)] max-[750px]:auto-cols-[calc((100%-12px)/2)] max-[750px]:gap-3";

async function HomeProducts({
  handles,
  heading,
  eyebrow,
  lede,
  label,
  browseHref,
  controls = true,
}: {
  handles: string[];
  heading: string;
  eyebrow: string;
  lede?: string;
  label: string;
  browseHref: string;
  /** Arrow buttons and the "View all" link; without them the row still scrolls by touch, trackpad and keyboard. */
  controls?: boolean;
}) {
  const products = await getProductCards(handles).catch(async () => {
    // Preserve healthy siblings when one failed card invalidates the batch.
    const recovered = await Promise.all(
      handles.map((handle) => getProductCards([handle]).catch(() => [])),
    );
    return recovered.flat();
  });
  const headingId = `home-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
  const cards = products.map((product) => (
    <ProductCard key={product.id} product={product} imageSizes="(max-width: 750px) 48vw, (max-width: 1024px) 31vw, (min-width: 1920px) 16vw, 20vw" />
  ));
  return (
    <section data-store data-home-products aria-labelledby={headingId} className={designSection}>
      <SectionHeading eyebrow={eyebrow} title={heading} id={headingId} />
      {lede && <SectionLede>{lede}</SectionLede>}
      {products.length ? (
        controls ? (
          <HomeCarousel label={label} railClassName={designRail}>{cards}</HomeCarousel>
        ) : (
          <div data-carousel-rail role="group" aria-label={label} tabIndex={0} className={cn(designRail, railFocus)}>{cards}</div>
        )
      ) : (
        <p data-catalogue-unavailable className="text-card text-taupe [&_a]:font-semibold [&_a]:text-brand">
          This collection is temporarily unavailable.{" "}
          <Link href="/collections/all">Browse all furniture</Link>
        </p>
      )}
      {(controls || !products.length) && (
        <Link data-rail-cta href={browseHref} aria-label={`View all ${heading}`}
          className="inline-flex w-fit min-w-[212px] items-center justify-center rounded-sm border border-solid border-sand bg-white p-[15px] text-ui font-bold text-brand no-underline hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          View all {heading.toLowerCase()} →
        </Link>
      )}
    </section>
  );
}

/** The homepage assembled from one content document: the published snapshot for visitors, a draft for staff previews. */
export function HomePage({ content }: { content: StorefrontDocument }) {
  const copy = content.homeCopy;
  const details = resolveHomeDetails(content.homeDetails);
  const merchandising = resolveHomeMerchandising(content.homeMerchandising);
  const sections: Record<string, ReactNode> = {
    hero: (
      <Hero content={details.hero} media={content.templateMedia?.filter(item =>
        item.key === "home-workshop-poster" || item.key.startsWith("home-hero-")
      )}>
        <PromiseStrip />
      </Hero>
    ),
    announcement: <CampaignBanner campaign="landing-announcement" content={content} />,
    difference: <HomeDifference content={details.difference} media={content.templateMedia} />,
    categories: (
      <section data-store data-home-category-section aria-labelledby="home-categories-heading" className={designSection}>
        <SectionHeading eyebrow="Designed around you" title={copy.categoryHeading} id="home-categories-heading" />
        <SectionLede>Any colour. Any material. A piece made for your space.</SectionLede>
        <CategoryCircles items={merchandising.categories} />
      </section>
    ),
    ticker: <HomeTicker text={copy.ticker} autoplay={content.motion.autoplayTicker ?? true} />,
    offers: (
      <section data-store aria-label="Offer collections" className={cn(designSection, "pt-0 max-[1024px]:pt-0 max-[750px]:pt-0")}>
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
        eyebrow="Handpicked favourites"
        heading={copy.bestsellersHeading}
        lede="Discover the pieces that make a room feel complete."
        label="Bestsellers"
        browseHref="/collections/all"
        controls={false}
      />
    ),
    "seating-banner": <CampaignBanner campaign="landing-sofa-accent-chair" content={content} />,
    chairs: (
      <HomeProducts
        handles={merchandising.chairs}
        eyebrow="Comfort, your way"
        heading={copy.chairsHeading ?? "Chairs"}
        label="Chair collection"
        browseHref="/collections/chairs"
      />
    ),
    promos: (
      <div data-campaign-promos className="my-9 grid w-full grid-cols-3 gap-6 px-16 max-[1024px]:px-8 max-[750px]:flex max-[750px]:snap-x max-[750px]:snap-mandatory max-[750px]:gap-3.5 max-[750px]:overflow-x-auto max-[750px]:px-4 max-[750px]:pb-3">
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
    newsletter: <HomeNewsletterBand content={details.newsletter} />,
    values: <HomeValues content={details.values} media={content.templateMedia} />,
    cities: (
      <HomeCityCards content={details.cities} autoplay={content.motion.autoplayCities} media={content.templateMedia} layout={content.homeCitiesLayout} />
    ),
    project: <HomeProject content={details.project} />,
  };
  return (
    // The document's own highlights, so a staff draft previews its colours, ratings and New flags.
    <ProductHighlightsProvider value={content.productHighlights}>
    <div data-store data-home className="bg-linen">
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
    </div>
    </ProductHighlightsProvider>
  );
}
