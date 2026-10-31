import type { ProductCardModel } from "@/lib/product-card-model";
import Image from "next/image";
import Link from "next/link";
import { sourceCollections } from "@shopmaple/contracts/catalogue-registry";
import { ProductCard } from "./product-card";
import { HomeCarousel } from "./home-carousel";
import { CategoryValues } from "./category-landing";
import { shopFile } from "@/lib/format";
import data from "@/data/legacy-chairs.json";
import sourceCatalog from "@/data/landing-catalog.json";

type EditorialProduct = { title: string; image: string };
const sourceProducts: Record<string, EditorialProduct> = {
  ...sourceCatalog,
  ...data.sourceProducts,
};
const collections: Record<string, { title: string; handles: string[] }> =
  sourceCollections;

export const legacyChairHandles = [...new Set([
  ...data.bestsellers,
  ...data.rooms.flatMap(room => collections[room.collection]!.handles.slice(0, 6)),
  ...collections["accent-chair"]!.handles.slice(0, 6),
])];

function LegacyProducts({
  handles,
  products,
  label,
  room = false,
}: {
  handles: string[];
  products: Map<string, ProductCardModel>;
  label: string;
  room?: boolean;
}) {
  const cards = handles.map((handle) => {
    const product = products.get(handle);
    if (product) return <ProductCard key={handle} product={product} />;
    const source = sourceProducts[handle];
    if (!source) return null;
    const href = `/pages/contact?product=${encodeURIComponent(source.title)}`;
    return (
      <article data-product-card className="product-card landing-source-product" key={handle}>
        <div data-card-image className="product-card-image">
          <Link href={href}>
            <Image
              src={source.image}
              alt={source.title}
              fill
              sizes={
                room
                  ? "(max-width:749px) 192px, 250px"
                  : "(max-width:749px) 45vw, 24vw"
              }
            />
          </Link>
        </div>
        <Link data-card-name className="product-card-name" href={href}>
          {source.title}
        </Link>
        <p data-card-price className="product-card-price">Price on request</p>
      </article>
    );
  });
  return (
    <HomeCarousel
      label={label}
      railClassName={room ? "legacy-chairs-room-products" : "home-product-rail"}
    >
      {cards}
    </HomeCarousel>
  );
}

export function LegacyChairs({ products }: { products: ProductCardModel[] }) {
  const byHandle = new Map(
    products.map((product) => [product.handle, product]),
  );
  return (
    <div className="home-parity landing-parity legacy-chairs">
      <section className="legacy-chairs-hero">
        <Image
          src={shopFile(data.hero.image)}
          alt="Furniture in a thoughtfully designed living space"
          fill
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
        />
        <div className="legacy-chairs-hero-copy home-container">
          <p>
            <em>{data.hero.eyebrow}</em>
          </p>
          <h1>{data.hero.heading}</h1>
          <p className="legacy-chairs-hero-description">{data.hero.description}</p>
          <Link className="legacy-chairs-button" href="#collection-products">
            Browse all chairs →
          </Link>
        </div>
      </section>
      <nav
        className="landing-categories legacy-chairs-categories home-container"
        aria-label="Sofa categories"
      >
        {data.categories.map((item) => (
          <Link key={item.href} href={item.href}>
            <div>
              <Image
                src={item.image}
                alt={item.title}
                fill
                sizes="(max-width:749px) 45vw, 19vw"
              />
            </div>
            <h2>{item.title}</h2>
          </Link>
        ))}
      </nav>
      <p className="legacy-chairs-tagline home-container">
        <em>{data.tagline}</em>
      </p>
      <section
        className="landing-products home-products home-container"
        aria-label="Best Sellers"
      >
        <header>
          <div>
            <p className="home-eyebrow">Shop By</p>
            <h2>Best Sellers</h2>
          </div>
          <Link href="/collections/all">Shop now →</Link>
        </header>
        <LegacyProducts
          handles={data.bestsellers}
          products={byHandle}
          label="Best Sellers"
        />
      </section>
      <section
        className="legacy-chairs-offers home-container"
        aria-label="Offer collections"
      >
        <header>
          <div>
            <p className="home-eyebrow">Shop By</p>
            <h2>{data.offerHeading}</h2>
          </div>
          <p>{data.offerExpired}</p>
        </header>
        <div className="home-offers home-offer-tiles">
          {data.offers.map((item) => (
            <Link href={item.href} key={item.href} aria-label={item.title}>
              <div>
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(max-width:749px) 45vw, 24vw"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className="legacy-chairs-rhythm home-container">
        <HomeCarousel
          label="Room rhythm"
          autoplay
          railClassName="legacy-chairs-rhythm-viewport"
        >
          <div className="legacy-chairs-rhythm-track">
            <span>{data.rhythm}</span>
            <span aria-hidden="true">{data.rhythm}</span>
            <span aria-hidden="true">{data.rhythm}</span>
          </div>
        </HomeCarousel>
      </div>
      {data.rooms.map((room) => (
        <section
          className="legacy-chairs-room home-container"
          key={room.collection}
          aria-label={room.title}
        >
          <div className="legacy-chairs-room-image">
            <Image
              src={room.image}
              alt={room.title}
              fill
              sizes="(max-width:749px) 100vw, 45vw"
            />
            <div>
              <h2>{room.title}</h2>
              <Link href={`/collections/${room.collection}`}>
                Shop collection
              </Link>
            </div>
          </div>
          <div>
            <header>
              <h3>Featured products</h3>
              <Link href={`/collections/${room.collection}`}>View all</Link>
            </header>
            <LegacyProducts
              handles={collections[room.collection]!.handles.slice(0, 6)}
              products={byHandle}
              label={`${room.title} featured products`}
              room
            />
          </div>
        </section>
      ))}
      <section className="legacy-chairs-signature home-container">
        <div className="legacy-chairs-signature-image">
          <Image
            src={shopFile(data.signature.image)}
            alt="Maple signature furniture"
            fill
            sizes="(max-width:749px) 100vw, 48vw"
          />
        </div>
        <div>
          <h2>{data.signature.heading}</h2>
          <p>{data.signature.description}</p>
          <Link className="legacy-chairs-button" href="/collections/all">
            Shop now
          </Link>
        </div>
      </section>
      <section
        className="landing-products home-products home-container"
        aria-label="Bentley Chair"
      >
        <header>
          <div>
            <p className="home-eyebrow">Shop By Design</p>
            <h2>Bentley Chair</h2>
          </div>
          <Link href="/collections/all">Shop now →</Link>
        </header>
        <p>No products are currently available in this collection.</p>
      </section>
      <section
        className="landing-products home-products home-container"
        aria-label="Accent Chair"
      >
        <header>
          <div>
            <p className="home-eyebrow">Shop By Design</p>
            <h2>Accent Chair</h2>
          </div>
          <Link href="/collections/all">Shop now →</Link>
        </header>
        <LegacyProducts
          handles={collections["accent-chair"]!.handles.slice(0, 6)}
          products={byHandle}
          label="Accent Chair"
        />
      </section>
      <div className="home-divider" />
      <section
        className="legacy-chairs-faq home-container"
        aria-label="Frequently asked questions"
      >
        <h2>Frequently asked questions</h2>
        <p className="legacy-chairs-service-note">
          Online checkout is disabled. Contact Maple to confirm ordering,
          delivery charges and returns for your enquiry.
        </p>
        {data.faq.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>
      <CategoryValues items={data.values} />
      <p className="legacy-chairs-browse home-container">
        <Link href="/collections/all?category=chairs">Browse all chairs →</Link>
      </p>
    </div>
  );
}
