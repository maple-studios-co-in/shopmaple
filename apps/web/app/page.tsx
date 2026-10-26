import { toProductCard } from "@/lib/product-card-model";
import Image from "next/image";
import type { ReactNode } from "react";
import type { HomeCollectionTile } from "@shopmaple/contracts";
import { getPublishedContent } from "@/lib/content";
import Link from "next/link";
import { CampaignBanner } from "@/components/campaign-banner";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { HomeCarousel } from "@/components/home-carousel";
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
import { getProduct } from "@/lib/catalog";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { resolveHomeMerchandising } from "@/lib/home-merchandising-defaults";

export const dynamic = "force-dynamic";

function CollectionTiles({
  items,
  className,
}: {
  items: HomeCollectionTile[];
  className: string;
}) {
  return (
    <div className={className}>
      {items.filter((item) => item.enabled).map((item) => (
        <Link href={`/collections/${item.collectionHandle}`} key={item.key}>
          <div>
            <Image
              src={item.image}
              alt={item.alt}
              fill
              sizes={className.includes("categories")
                ? "(max-width:749px) calc((100vw - 52px) / 2), (min-width:1440px) 210px, calc((100vw - 180px) / 6)"
                : "(max-width:749px) calc(70vw - 22.4px), (min-width:1440px) 328px, calc((100vw - 128px) / 4)"}
            />
          </div>
          {className.includes("categories") && <h3>{item.title}</h3>}
        </Link>
      ))}
    </div>
  );
}

async function HomeProducts({
  handles,
  heading,
  label,
}: {
  handles: string[];
  heading?: string;
  label: string;
}) {
  const results = await Promise.all(
    handles.map((handle) => getProduct(handle).catch(() => null)),
  );
  const products = results
    .filter((product) => product !== null)
    .filter((product) => product.published);
  return (
    <section className="home-products home-container" aria-label={label}>
      {heading && (
        <header>
          <p className="home-eyebrow">Shop By</p>
          <h2>{heading}</h2>
        </header>
      )}
      {products.length ? (
        <HomeCarousel label={label}>
          {products.map((product) => (
            <ProductCard key={product.id} product={toProductCard(product)} />
          ))}
        </HomeCarousel>
      ) : (
        <p className="home-catalogue-unavailable">
          This collection is temporarily unavailable.{" "}
          <Link href="/collections/all">Browse all furniture</Link>
        </p>
      )}
    </section>
  );
}

export default async function Home() {
  const content = await getPublishedContent();
  const copy = content.homeCopy;
  const details = resolveHomeDetails(content.homeDetails);
  const merchandising = resolveHomeMerchandising(content.homeMerchandising);
  const sections: Record<string, ReactNode> = {
    hero: <Hero content={details.hero} media={content.templateMedia?.filter(item =>
      item.key === "home-workshop-poster" || item.key.startsWith("home-hero-")
    )} />,
    announcement: <CampaignBanner campaign="landing-announcement" />,
    difference: <HomeDifference content={details.difference} media={content.templateMedia} />,
    categories: (
      <section className="home-category-section home-container">
        <h2>{copy.categoryHeading}</h2>
        <CollectionTiles items={merchandising.categories} className="home-categories" />
      </section>
    ),
    ticker: <p className="home-ticker">{copy.ticker}</p>,
    offers: (
      <section className="home-container" aria-label="Offer collections">
        <CollectionTiles
          className="home-offers home-offer-tiles"
          items={merchandising.offers}
        />
      </section>
    ),
    nimbus: <HomeNimbus content={details.nimbus} media={content.templateMedia?.filter(item => item.key === "home-nimbus")} />,
    "dining-banner": <CampaignBanner campaign="landing-dining-table" />,
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
      />
    ),
    "seating-banner": <CampaignBanner campaign="landing-sofa-accent-chair" />,
    chairs: (
      <HomeProducts
        handles={merchandising.chairs}
        label="Chair collection"
      />
    ),
    promos: (
      <div className="campaign-promo-grid home-container">
        <CampaignBanner campaign="landing-dining" compact />
        <CampaignBanner campaign="landing-storage" compact />
        <CampaignBanner campaign="landing-consoles" compact />
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
