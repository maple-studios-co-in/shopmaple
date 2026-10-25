import Image from "next/image";
import Link from "next/link";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { HomeCarousel } from "@/components/home-carousel";
import { HomeNimbus } from "@/components/home-nimbus";
import {
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
          <p className="home-eyebrow">Explore Maple</p>
          <h2>{heading}</h2>
          <Link href="/collections/all" className="home-browse-link">
            View all furniture →
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
    <div className="home-parity home-refined">
      <Hero />
      <section className="home-category-section home-container">
        <h2>Find your favourite corner</h2>
        <p className="home-section-intro">
          Pieces for quiet mornings, shared meals and everything in between.
        </p>
        <CollectionTiles items={categories} className="home-categories" />
      </section>
      <HomeProducts
        handles={[
          "aera-swivel-lounge-chair",
          "aero-dining-chair",
          "aileron-signature-bed",
          "aileron-upholstered-bench",
          "alcyone-7-seater-sofa",
          "alina-7-seater-sofa",
        ]}
        heading="Selected for your home"
        label="Selected furniture"
      />
      <HomeNimbus />
      <HomeProducts
        handles={["caro", "ario", "nola", "tara", "arno", "rollo"]}
        heading="A seat for every space"
        label="Chair collection"
      />
      <HomeTestimonial />
      <HomeProject />
      <HomeNewsletter />
    </div>
  );
}
