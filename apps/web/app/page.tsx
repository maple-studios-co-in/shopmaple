import Image from "next/image";
import Link from "next/link";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { HomeCarousel } from "@/components/home-carousel";
import { HomeNimbus } from "@/components/home-nimbus";
import {
  HomeBanner,
  HomeDifference,
  HomeSocial,
  HomeTestimonial,
  HomeNewsletter,
  HomeValues,
  HomeCities,
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
const offers: [string, string, string][] = [
  ["Clearance Sale", "clearance-sale", "Clearance_Sale.webp?v=1778257635"],
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
];
const collections: [string, string, string][] = [
  ["Dining", "dining", "Bottom_Dining_Mobile_banner_Hompage.png?v=1791288470"],
  [
    "Storage",
    "storage",
    "Independence_Day_Category_Storage_Collection_-_Mobile.png?v=1790923829",
  ],
  [
    "Console Tables",
    "console-tables",
    "Independence_Day_Category_Console_Collection_-_Mobile.png?v=1790923886",
  ],
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

export default function Home() {
  return (
    <div className="home-parity">
      <h1 className="sr-only">Maple Furnishers — furniture for your home</h1>
      <Hero />
      <HomeBanner
        desktop="1_Sofa_web_banner_Hompage_44dfb940-c378-4980-9268-f6d79c2d5ac0.png?v=1791220477"
        mobile="2_-_Sofa_Mobile_banner_Announcment_9330e4f1-cd1c-464c-9331-43d1d0493619.png"
        alt="Festive Seating. Warm seating for festive moments together. Explore chairs."
        href="/collections/chair-collection"
      />
      <div className="home-divider home-divider-short" />
      <HomeDifference />
      <section className="home-category-section home-container">
        <h2>Shop By Category</h2>
        <CollectionTiles items={categories} className="home-categories" />
      </section>
      <div className="home-marquee">
        <p>Elegance isn’t found. At Maple, it is custom-built.</p>
      </div>
      <section
        className="home-offers home-container"
        aria-label="Shop furniture offers"
      >
        <CollectionTiles items={offers} className="home-offer-tiles" />
      </section>
      <HomeNimbus />
      <HomeBanner
        desktop="1_Sofa_web_banner_Occasion_49c3c263-028f-4c30-aaf1-8a6958341d03.png"
        mobile="2_-_Sofa_Mobile_banner_Hompage_6a17e9ed-de09-45fe-bd0f-0326bc909f88.png"
        alt="Furniture for every occasion — explore tables"
        href="/pages/tables"
      />
      <HomeSocial />
      <HomeProducts
        handles={[
          "aera-swivel-lounge-chair",
          "aero-dining-chair",
          "aileron-signature-bed",
          "aileron-upholstered-bench",
          "alcyone-7-seater-sofa",
          "alina-7-seater-sofa",
        ]}
        heading="Bestsellers"
        label="Bestsellers"
      />
      <HomeBanner
        desktop="1_Sofa_web_banner_Hompage_f6b7af18-c1b6-43c3-99cd-979b550ad92c.png"
        mobile="2_-_Sofa_Mobile_banner_Homepage_51dae10b-a774-4a27-8dca-8f21aa99bf5d.png"
        alt="Sofas for your home — explore the sofa collection"
        href="/pages/sofas"
        flush
      />
      <HomeProducts
        handles={["caro", "ario", "nola", "tara", "arno", "rollo"]}
        label="Chair collection"
      />
      <section
        className="home-collection-section home-container"
        aria-label="Shop by collection"
      >
        <CollectionTiles
          items={collections}
          className="home-collection-tiles"
        />
      </section>
      <HomeTestimonial />
      <HomeSocial second />
      <div className="home-divider home-divider-before-newsletter" />
      <HomeNewsletter />
      <HomeValues />
      <div className="home-divider" />
      <HomeCities />
      <div className="home-divider home-divider-before-project" />
      <HomeProject />
    </div>
  );
}
