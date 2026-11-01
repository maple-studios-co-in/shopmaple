import { ContentImage as Image } from "@/components/content-image";
import type { ReactNode } from "react";
import type { HomeCollectionTile } from "@shopmaple/contracts";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CampaignBanner } from "@/components/campaign-banner";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { HomeCarousel } from "@/components/home-carousel";
import { HomeScrollRail } from "@/components/home-scroll-rail";
import { SectionReveal } from "@/components/section-reveal";
import { HomeNimbus } from "@/components/home-nimbus";
import {
  HomeStatementBand,
  HomeDifference,
  HomeSocial,
  HomeValues,
  HomeCities,
  HomeTestimonial,
  HomeNewsletter,
  HomeProject,
} from "@/components/home-sections";
import { getProductCards } from "@/lib/catalog";
import { homeStats } from "@/lib/home-stats";
import type { StorefrontDocument } from "@/lib/content";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { resolveHomeMerchandising } from "@/lib/home-merchandising-defaults";
import { rasterShopifyArtwork } from "@/lib/shopify-artwork";

function CollectionTiles({
  items,
  className,
}: {
  items: HomeCollectionTile[];
  className: string;
}) {
  const categories = className.includes("categories");
  return (
    <div className={className}>
      {items.filter((item) => item.enabled).map((item) => (
        <Link href={`/collections/${item.collectionHandle}`} key={item.key} {...(categories ? { "data-category-tile": "" } : { "data-offer-tile": "" })}>
          <div>
            <Image
              src={rasterShopifyArtwork(item.image)}
              alt={item.alt}
              fill
              sizes={className.includes("categories")
                ? "(max-width:749px) calc((100vw - 52px) / 2), (min-width:1440px) 210px, calc((100vw - 180px) / 6)"
                : "(max-width:749px) calc(70vw - 22.4px), (min-width:1440px) 328px, calc((100vw - 128px) / 4)"}
            />
          </div>
          {categories ? <h3 data-category-title>{item.title}</h3> : null}
          {categories && <ArrowRight aria-hidden size={14} data-category-arrow />}
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
  lede,
  scrollbar = false,
}: {
  handles: string[];
  heading?: string;
  label: string;
  browseHref: string;
  /** A sentence under the heading. */
  lede?: string;
  /** A plain row: no arrows and no scrollbar, just dragging and touch (Bestsellers). */
  scrollbar?: boolean;
}) {
  const products = await getProductCards(handles).catch(async () => {
    // Preserve healthy siblings when one failed card invalidates the batch.
    const recovered = await Promise.all(
      handles.map((handle) => getProductCards([handle]).catch(() => [])),
    );
    return recovered.flat();
  });
  return (
    <section className="home-products home-container" aria-label={label}>
      {heading && (
        <header className="home-rail-heading">
          <div>
            <p className="home-eyebrow" data-rail-eyebrow>Handpicked favourites</p>
            <h2>{heading}</h2>
            {lede && <p className="home-rail-lede" data-rail-lede>{lede}</p>}
          </div>
          <Link href={browseHref} aria-label={`View all ${heading}`} data-rail-viewall>View all {heading.toLowerCase()} →</Link>
        </header>
      )}
      {products.length ? (
        scrollbar ? (
          <HomeScrollRail label={label}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </HomeScrollRail>
        ) : (
          <HomeCarousel label={label}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </HomeCarousel>
        )
      ) : (
        <p className="home-catalogue-unavailable">
          This collection is temporarily unavailable.{" "}
          <Link href="/collections/all">Browse all furniture</Link>
        </p>
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
    hero: <Hero content={details.hero} media={content.templateMedia?.filter(item =>
      item.key === "home-workshop-poster" || item.key.startsWith("home-hero-")
    )} />,
    announcement: <CampaignBanner campaign="landing-announcement" layout="strip" content={content} />,
    difference: <HomeDifference content={details.difference} media={content.templateMedia} />,
    categories: (
      <section className="home-category-section home-container">
        <h2>{copy.categoryHeading}</h2>
        <span className="home-heading-ornament" data-heading-ornament aria-hidden="true">
          <i data-ornament-line />
          <svg data-ornament-flower viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => <ellipse key={angle} cx="12" cy="5.4" rx="2" ry="4.4" transform={`rotate(${angle} 12 12)`} />)}
            <circle cx="12" cy="12" r="1.7" fill="#fff" />
          </svg>
          <i data-ornament-line />
        </span>
        <CollectionTiles items={merchandising.categories} className="home-categories" />
      </section>
    ),
    ticker: <HomeStatementBand text={copy.ticker} />,
    offers: (
      <section className="home-container" aria-label="Offer collections">
        <CollectionTiles
          className="home-offers home-offer-tiles"
          items={merchandising.offers}
        />
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
        lede="Discover the pieces that make a room feel complete."
        scrollbar
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
    values: <HomeValues content={details.values} media={content.templateMedia} watermark />,
    cities: (
      <HomeCities content={details.cities} autoplay={content.motion.autoplayCities} media={content.templateMedia} layout={content.homeCitiesLayout} stats={homeStats(details.difference.promises, details.cities.heading)} />
    ),
    project: <HomeProject content={details.project} />,
  };
  return (
    <SectionReveal enabled={content.motion.revealSections}>
      <h1 className="sr-only">Maple Furnishers</h1>
      {content.homeSections
        .filter((section) => section.enabled)
        .map((section) => (
          <div
            className="managed-home-section"
            key={section.key}
            data-home-section={section.key}
          >
            {sections[section.key]}
          </div>
        ))}
    </SectionReveal>
  );
}
