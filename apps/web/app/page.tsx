import Image from "next/image";
import type { ReactNode } from "react";
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

export const dynamic = "force-dynamic";

const categories: [string, string, string][] = [
  ["Sofas", "sofas", "Cover_Image_Maple_6.svg?v=1778649785"],
  [
    "Dining Chair",
    "dining-chair",
    "Dining_Chairs_bac53a57-f5ab-4af0-beec-7ca279851dc3.png?v=1776235600",
  ],
  ["Coffee Tables", "center-tables", "Cover_Image_Maple_7.svg?v=1778649944"],
  [
    "Accent Chair",
    "accent-chair",
    "ChatGPTImageJun18_2025_08_27_31PM.png?v=1776235338",
  ],
  ["Beds", "beds", "Cover_Image_Maple_8.svg?v=1778650094"],
  ["Dinings", "dinings", "Cover_Image_Maple_10.svg?v=1780689685"],
];
function CollectionTiles({
  items,
  className,
}: {
  items: [string, string, string][];
  className: string;
}) {
  return (
    <div className={className}>
      {items.map(([name, handle, image]) => (
        <Link href={`/collections/${handle}`} key={handle}>
          <div>
            <Image
              src={`https://shop.maplefurnishers.com/cdn/shop/collections/${image}`}
              alt={name}
              fill
              sizes="(max-width:749px) 50vw, 33vw"
            />
          </div>
          {className.includes("categories") && <h3>{name}</h3>}
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
  const products = results.filter((product) => product !== null);
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
            <ProductCard key={product.id} product={product} />
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
  const sections: Record<string, ReactNode> = {
    hero: <Hero />,
    announcement: <CampaignBanner campaign="landing-announcement" />,
    difference: <HomeDifference />,
    categories: (
      <section className="home-category-section home-container">
        <h2>{copy.categoryHeading}</h2>
        <CollectionTiles items={categories} className="home-categories" />
      </section>
    ),
    ticker: <p className="home-ticker">{copy.ticker}</p>,
    offers: (
      <section className="home-container" aria-label="Offer collections">
        <CollectionTiles
          className="home-offers home-offer-tiles"
          items={[
            [
              "Clearance Sale",
              "clearance-sale",
              "Clearance_Sale.webp?v=1778257635",
            ],
            [
              "Minimum 30% Off",
              "minimum-60-off",
              "min_30_off_sale_banner.webp?v=1778255612",
            ],
            [
              "Best Buy Under Rs.50,000",
              "best-buy-under-rs-50-000",
              "Maple_Banner_1.webp?v=1778268771",
            ],
            [
              "Furniture Store under Rs. 25,000",
              "furniture-store-under-rs-25-000",
              "Maple_Banner_2.webp?v=1778269923",
            ],
          ]}
        />
      </section>
    ),
    nimbus: <HomeNimbus />,
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
        handles={[
          "aera-swivel-lounge-chair",
          "aero-dining-chair",
          "aileron-signature-bed",
          "aileron-upholstered-bench",
          "alcyone-7-seater-sofa",
          "alina-7-seater-sofa",
        ]}
        heading={copy.bestsellersHeading}
        label="Bestsellers"
      />
    ),
    "seating-banner": <CampaignBanner campaign="landing-sofa-accent-chair" />,
    chairs: (
      <HomeProducts
        handles={["caro", "ario", "nola", "tara", "arno", "rollo"]}
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
        heading={copy.testimonialHeading}
        subheading={copy.testimonialSubheading}
      />
    ),
    newsletter: <HomeNewsletter />,
    values: <HomeValues />,
    cities: <HomeCities autoplay={content.motion.autoplayCities} />,
    project: <HomeProject />,
  };
  return (
    <SectionReveal enabled={content.motion.revealSections}>
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
