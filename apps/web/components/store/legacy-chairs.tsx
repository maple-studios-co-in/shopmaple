import type { ProductCardModel } from "@/lib/product-card-model";
import Image from "next/image";
import Link from "next/link";
import { sourceCollections } from "@shopmaple/contracts/catalogue-registry";
import { ProductCard } from "@/components/store/product-card";
import { HomeCarousel } from "@/components/store/carousel";
import {
  CategoryValues,
  SourceProductCard,
  hoverUnderline,
  landingContainer,
  landingEyebrow,
  landingProducts,
  landingProductsHeader,
  landingProductsHeading,
  landingProductsLink,
  landingRail,
  landingRailControls,
} from "@/components/store/category-rails";
import { shopFile } from "@/lib/format";
import data from "@/data/legacy-chairs.json";
import sourceCatalog from "@/data/landing-catalog.json";

/*
 * The owner-exported legacy Chairs template at the top of /collections/chairs (independent of
 * /pages/chairs), in the storefront's current look: legacy-chairs.css and the landing and home
 * rules it borrowed, restated as utilities. max-[750px] is the legacy `max-width: 749px`.
 */

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

/** The white outlined button (legacy `.legacy-chairs-button`). */
const chairsButton = "inline-block border border-[#ddd] bg-white px-6 py-3 text-black";
/** A serif section heading in burgundy (the global `h2` rule plus `.home-parity h2`). */
const serifHeading = "font-serif font-medium";

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
    return (
      <SourceProductCard
        key={handle}
        product={source}
        room={room}
        sizes={
          room
            ? "(max-width:749px) 192px, 250px"
            : "(max-width:749px) 45vw, 24vw"
        }
      />
    );
  });
  return room ? (
    <HomeCarousel
      label={label}
      railClassName="flex snap-x snap-mandatory gap-5 overflow-x-auto [scrollbar-width:none] max-[750px]:gap-4"
    >
      {cards}
    </HomeCarousel>
  ) : (
    <HomeCarousel label={label} railClassName={landingRail} controlsClassName={landingRailControls}>
      {cards}
    </HomeCarousel>
  );
}

export function LegacyChairs({ products }: { products: ProductCardModel[] }) {
  const byHandle = new Map(
    products.map((product) => [product.handle, product]),
  );
  return (
    <div data-store data-legacy-chairs className="overflow-x-clip [&_:is(a,summary):focus-visible]:outline-2 [&_:is(a,summary):focus-visible]:outline-offset-[5px] [&_:is(a,summary):focus-visible]:outline-current">
      <section data-chairs-hero className="relative isolate flex min-h-[max(280px,calc(80svh_-_200px))] items-end text-white after:absolute after:inset-0 after:-z-1 after:bg-[linear-gradient(0deg,#00000026,transparent)] after:content-[''] min-[750px]:max-[960px]:min-h-[max(280px,calc(70svh_-_200px))] max-[750px]:min-h-[calc(35rem_-_108px)]">
        <Image
          src={shopFile(data.hero.image)}
          alt="Furniture in a thoughtfully designed living space"
          fill
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          className="-z-2 object-cover"
        />
        <div className={`${landingContainer} grid w-full grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] [align-items:end] gap-x-[18px] gap-y-1.5 py-10 max-[750px]:grid-cols-[1fr] max-[750px]:py-7`}>
          <p className="font-redhat text-[14px] leading-[1.1] uppercase">
            <em>{data.hero.eyebrow}</em>
          </p>
          <h1 className="col-[1] font-serif text-[48px] leading-[1.1] font-normal tracking-[-0.025em] not-italic max-[750px]:text-[36px]">{data.hero.heading}</h1>
          <p className="col-[2] row-[1/3] text-[16px] leading-[1.6] max-[750px]:col-[1] max-[750px]:row-auto max-[750px]:mt-3">{data.hero.description}</p>
          <Link className={`${chairsButton} col-[1/-1] mt-3 [justify-self:start]`} href="#collection-products">
            Browse all chairs →
          </Link>
        </div>
      </section>
      <nav
        data-chairs-categories
        className="mx-auto grid max-w-[1440px] grid-cols-6 gap-6 px-10 pt-[120px] pb-10 max-[750px]:snap-x max-[750px]:snap-mandatory max-[750px]:grid-cols-2 max-[750px]:gap-4 max-[750px]:overflow-visible max-[750px]:px-[18px] max-[750px]:pt-[100px] max-[750px]:pb-5"
        aria-label="Sofa categories"
      >
        {data.categories.map((item) => (
          <Link key={item.href} href={item.href} className={`min-w-0 flex-[0_0_calc((100%_-_24px)/4)] snap-start ${hoverUnderline} max-[750px]:flex-[0_0_112px]`}>
            <div className="relative aspect-square overflow-hidden rounded-[50%] border-5 border-[#eee6dc] max-[750px]:border-3">
              <Image
                src={item.image}
                alt={item.title}
                fill
                sizes="(max-width:749px) 45vw, 19vw"
                className="object-cover"
              />
            </div>
            <h2 className="mt-2 mb-1 text-center font-['Red_Hat_Display',Manrope,sans-serif] text-[13px] leading-[1.13] font-medium text-brand">{item.title}</h2>
          </Link>
        ))}
      </nav>
      <p className={`${landingContainer} my-2.5 py-6 text-center text-[length:clamp(20px,2.4vw,32px)]`}>
        <em>{data.tagline}</em>
      </p>
      <section
        className={landingProducts}
        aria-label="Best Sellers"
      >
        <header className={landingProductsHeader}>
          <div>
            <p className={landingEyebrow}>Shop By</p>
            <h2 className={`${landingProductsHeading} text-brand`}>Best Sellers</h2>
          </div>
          <Link className={landingProductsLink} href="/collections/all">Shop now →</Link>
        </header>
        <LegacyProducts
          handles={data.bestsellers}
          products={byHandle}
          label="Best Sellers"
        />
      </section>
      <section
        data-chairs-offers
        className={`${landingContainer} py-8`}
        aria-label="Offer collections"
      >
        <header className="mb-6 flex items-center justify-between gap-6 max-[750px]:flex-col max-[750px]:items-start max-[750px]:gap-3">
          <div>
            <p className={landingEyebrow}>Shop By</p>
            <h2 className={`${serifHeading} text-[length:clamp(28px,3vw,40px)] leading-[1.13] text-brand italic`}>{data.offerHeading}</h2>
          </div>
          <p className="my-2.5 max-[750px]:m-0">{data.offerExpired}</p>
        </header>
        <div className="grid grid-cols-4 gap-4 py-5 max-[750px]:snap-x max-[750px]:snap-mandatory max-[750px]:auto-cols-[70%] max-[750px]:grid-flow-col max-[750px]:grid-cols-none max-[750px]:overflow-x-auto">
          {data.offers.map((item) => (
            <Link href={item.href} key={item.href} aria-label={item.title} className={`${hoverUnderline} max-[750px]:snap-start`}>
              <div className="relative aspect-[288/126] overflow-hidden rounded-[16px]">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(max-width:749px) 45vw, 24vw"
                  className="object-contain"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className={`${landingContainer} py-10`}>
        <HomeCarousel
          label="Room rhythm"
          autoplay
          railClassName="overflow-x-auto [scrollbar-width:none]"
        >
          <div data-chairs-rhythm-track className="flex w-max gap-16 text-[length:clamp(28px,4.5vw,64px)] font-semibold text-[#8a3029] motion-reduce:w-full">
            <span className="whitespace-nowrap motion-reduce:whitespace-normal">{data.rhythm}</span>
            <span aria-hidden="true" className="whitespace-nowrap motion-reduce:hidden motion-reduce:whitespace-normal">{data.rhythm}</span>
            <span aria-hidden="true" className="whitespace-nowrap motion-reduce:hidden motion-reduce:whitespace-normal">{data.rhythm}</span>
          </div>
        </HomeCarousel>
      </div>
      {data.rooms.map((room) => (
        <section
          data-chairs-room
          className={`${landingContainer} my-12 grid grid-cols-[1fr_1fr] [align-items:start] gap-8 max-[990px]:grid-cols-[1fr] max-[750px]:my-8 max-[750px]:gap-6`}
          key={room.collection}
          aria-label={room.title}
        >
          <div className="relative aspect-square min-w-0 overflow-hidden">
            <Image
              src={room.image}
              alt={room.title}
              fill
              sizes="(max-width:749px) 100vw, 45vw"
              className="object-cover"
            />
            <div className="absolute inset-x-0 top-auto bottom-0 bg-[linear-gradient(transparent,#0008)] px-8 pt-12 pb-8 text-white max-[750px]:px-6 max-[750px]:pt-10 max-[750px]:pb-6">
              <h2 className={`${serifHeading} mb-5 text-[32px] leading-[1.13] text-white`}>{room.title}</h2>
              <Link className={chairsButton} href={`/collections/${room.collection}`}>
                Shop collection
              </Link>
            </div>
          </div>
          <div className="min-w-0">
            <header className="mb-6 flex items-center justify-between gap-6">
              <h3 className={`${serifHeading} text-[24px] leading-[1.13]`}>Featured products</h3>
              <Link className={hoverUnderline} href={`/collections/${room.collection}`}>View all</Link>
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
      <section className={`${landingContainer} my-16 grid grid-cols-[1fr_1fr] items-center gap-8 max-[750px]:my-8 max-[750px]:grid-cols-[1fr] max-[750px]:gap-6`}>
        <div className="relative aspect-square">
          <Image
            src={shopFile(data.signature.image)}
            alt="Maple signature furniture"
            fill
            sizes="(max-width:749px) 100vw, 48vw"
            className="object-cover"
          />
        </div>
        <div>
          <h2 className={`${serifHeading} mb-6 text-[length:clamp(32px,4vw,56px)] leading-[1.12] text-brand`}>{data.signature.heading}</h2>
          <p className="mb-6 max-w-[520px] leading-[1.7]">{data.signature.description}</p>
          <Link className={chairsButton} href="/collections/all">
            Shop now
          </Link>
        </div>
      </section>
      <section
        className={landingProducts}
        aria-label="Bentley Chair"
      >
        <header className={landingProductsHeader}>
          <div>
            <p className={landingEyebrow}>Shop By Design</p>
            <h2 className={`${landingProductsHeading} text-brand`}>Bentley Chair</h2>
          </div>
          <Link className={landingProductsLink} href="/collections/all">Shop now →</Link>
        </header>
        <p className="my-2.5">No products are currently available in this collection.</p>
      </section>
      <section
        className={landingProducts}
        aria-label="Accent Chair"
      >
        <header className={landingProductsHeader}>
          <div>
            <p className={landingEyebrow}>Shop By Design</p>
            <h2 className={`${landingProductsHeading} text-brand`}>Accent Chair</h2>
          </div>
          <Link className={landingProductsLink} href="/collections/all">Shop now →</Link>
        </header>
        <LegacyProducts
          handles={collections["accent-chair"]!.handles.slice(0, 6)}
          products={byHandle}
          label="Accent Chair"
        />
      </section>
      <div className="mx-auto my-8 border-t border-t-[#292d2826]" />
      <section
        data-chairs-faq
        className="mx-auto max-w-[900px] px-10 py-12 max-[750px]:px-4 max-[750px]:py-8"
        aria-label="Frequently asked questions"
      >
        <h2 className={`${serifHeading} mb-6 text-center text-[length:clamp(30px,3vw,40px)] leading-[1.13] text-brand italic`}>Frequently asked questions</h2>
        <p className="mt-2.5 mb-8 leading-[1.6] text-[#59534f]">
          Online checkout is disabled. Contact Maple to confirm ordering,
          delivery charges and returns for your enquiry.
        </p>
        {data.faq.map((item) => (
          <details key={item.question} className="border-b border-b-[#d8d2cc] py-5">
            <summary className="cursor-pointer leading-[1.5] font-semibold">{item.question}</summary>
            <p className="mt-4 leading-[1.7]">{item.answer}</p>
          </details>
        ))}
      </section>
      <CategoryValues items={data.values} />
      <p className={`${landingContainer} my-2.5 pb-12 text-center`}>
        <Link className={hoverUnderline} href="/collections/all?category=chairs">Browse all chairs →</Link>
      </p>
    </div>
  );
}
