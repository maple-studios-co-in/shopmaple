import type { ProductCard as ProductCardModel } from "@shopmaple/contracts";
import { ContentImage as Image, getContentImageProps } from "@/components/content-image";
import { CampaignBanner } from "@/components/campaign-banner";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Fragment, Suspense, type CSSProperties } from "react";
import { getProductCards } from "@/lib/catalog";
import { collectionTitles } from "@/lib/collections";
import { shopFile } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
import { CardRating } from "@/components/store/card-highlights";
import { HomeCarousel } from "@/components/home-carousel";
import { CategoryIntroduction } from "@/components/category-controls";
import type { CategoryPageSlug } from "@shopmaple/contracts";
import { resolveCategoryPage } from "@/lib/category-content-defaults";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import sourceCatalog from "@/data/landing-catalog.json";
type SourceProduct = {
  handle: string;
  title: string;
  image: string;
  price: string;
  compareAt: string;
};
const sourceProducts: Record<string, SourceProduct> = sourceCatalog;
export function landingCollectionHref(path: string) {
  const handle = path.split("/").filter(Boolean).at(-1) || "all";
  return Object.hasOwn(collectionTitles, handle)
    ? `/collections/${handle}`
    : `/collections/all?q=${encodeURIComponent(handle.replaceAll("-", " "))}`;
}
export function CategoryBanner({
  desktop,
  mobile,
  alt,
  width,
  height,
  eager = false,
}: {
  desktop: string;
  mobile: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
}) {
  const image = getContentImageProps({
    src: shopFile(desktop),
    alt,
    width,
    height,
    sizes:
      "(min-width: 1440px) 1360px, (max-width: 749px) calc(100vw - 32px), calc(100vw - 80px)",
    loading: eager ? "eager" : "lazy",
    fetchPriority: eager ? "high" : "auto",
  }).props;
  const small = getContentImageProps({
    src: shopFile(mobile),
    alt,
    width: 4796,
    height: 4796,
    sizes:
      "(min-width: 1440px) 1360px, (max-width: 749px) calc(100vw - 32px), calc(100vw - 80px)",
    loading: eager ? "eager" : "lazy",
    fetchPriority: eager ? "high" : "auto",
  }).props;
  return (
    <div className="landing-banner">
      <picture>
        <source
          media="(max-width: 768px)"
          srcSet={small.srcSet}
          sizes={small.sizes}
        />
        <img {...image} />
      </picture>
    </div>
  );
}
function SourceProductCard({ product }: { product: SourceProduct }) {
  // Keep editorial products absent from the live catalogue enquiry-only.
  const href = `/pages/contact?product=${encodeURIComponent(product.title)}`;
  return (
    <article data-product-card className="product-card landing-source-product">
      <div data-card-image className="product-card-image">
        <a href={href}>
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 749px) 48vw, 25vw"
          />
        </a>
      </div>
      <div data-card-heading className="product-card-heading">
        <a data-card-name className="product-card-name" href={href}>
          {product.title}
        </a>
        <span data-card-rating-slot className="product-card-rating"><CardRating /></span>
      </div>
      <p data-card-price className="product-card-price">
        <span>Price on request</span>
      </p>
    </article>
  );
}
export async function CategoryProducts({
  handles,
  heading,
  collection,
  viewAll,
  grid = false,
  catalogue,
}: {
  handles: string[];
  heading?: string;
  collection?: string;
  viewAll?: boolean;
  grid?: boolean;
  catalogue?: () => Promise<ReadonlyMap<string, ProductCardModel>>;
}) {
  const products = catalogue ? await catalogue() : new Map(
    (await getProductCards(handles)).map((product) => [product.handle, product]),
  );
  const cards = handles.map((handle) => {
    const product = products.get(handle);
    return product ? (
      <ProductCard key={handle} product={product} />
    ) : sourceProducts[handle] ? (
      <SourceProductCard key={handle} product={sourceProducts[handle]!} />
    ) : null;
  });
  return (
    <section
      className="landing-products home-products home-container"
      aria-label={heading || "Nimbus Series"}
    >
      {heading && (
        <header>
          <div>
            <p className="home-eyebrow">Shop By</p>
            <h2>{heading}</h2>
          </div>
          {viewAll && (
            <Link href={landingCollectionHref(`/collections/${collection}`)}>
              View all →
            </Link>
          )}
        </header>
      )}
      {grid ? (
        <div className="landing-product-grid">{cards}</div>
      ) : (
        <HomeCarousel label={heading || "Furniture"}>{cards}</HomeCarousel>
      )}
    </section>
  );
}
export function CategoryValues({
  items,
}: {
  items: {
    key?: string;
    title: string;
    body?: string;
    image: string;
  }[];
}) {
  return (
    <section className="landing-values home-values home-container">
      {items.map((item) => (
        <div key={item.key ?? item.title}>
          <Image
            src={
              item.image.startsWith("https:")
                ? item.image
                : shopFile(item.image)
            }
            alt=""
            width={100}
            height={100}
          />
          <h3>{item.title}</h3>
          {item.body && <p>{item.body}</p>}
        </div>
      ))}
    </section>
  );
}
export async function CategoryLanding({ slug, content: supplied }: { slug: CategoryPageSlug; content?: StorefrontDocument }) {
  const content = supplied ?? await getPublishedContent();
  const data = resolveCategoryPage(slug, content.landingPages);
  const handles = [...new Set(data.sections
    .filter((section) => section.type === "products")
    .flatMap((section) => section.handles ?? []))];
  let catalogueRequest: Promise<ReadonlyMap<string, ProductCardModel>> | undefined;
  // Start only when a server rail renders; the hero tree need not wait for cards.
  const catalogue = () => catalogueRequest ??= getProductCards(handles).then(
    (products) => new Map(products.map((product) => [product.handle, product])),
  );
  const heroVisible = data.sections.some((section) => section.key === "hero");
  return (
    <div className="home-parity landing-parity">
      {!heroVisible && (
        <CategoryIntroduction
          title={data.title}
          description={data.description}
        />
      )}
      {data.sections.map((section) => {
        if (section.type === "banner") {
          const hero = section.key === "hero";
          const campaign =
            section.key === "hero" || section.key === "sale"
              ? (`${slug}-${section.key}` as const)
              : null;
          // The owner's sizes (9 Nov 2026): the hero runs edge to edge at 350px; every other banner is 200px tall,
          // inside the page's side margins with the product cards' rounded corners.
          return (
            <Fragment key={section.key}>
              <div className={hero ? "landing-banner-frame" : "landing-banner-frame home-container"} data-landing-banner={hero ? "hero" : "inset"}>
                {campaign ? (
                  <CampaignBanner campaign={campaign} content={content} eager={hero} />
                ) : (
                  <CategoryBanner
                    desktop={section.desktop!}
                    mobile={section.mobile!}
                    width={section.width!}
                    height={section.height!}
                    eager={hero}
                    alt={`${data.title} — ${hero ? "furniture for every occasion" : "find furniture for your space"}`}
                  />
                )}
              </div>
              {hero && (
                <CategoryIntroduction
                  title={data.title}
                  description={data.description}
                />
              )}
            </Fragment>
          );
        }
        if (section.type === "categories")
          return (
            <nav
              key={section.key}
              className="landing-categories home-container"
              style={{ "--landing-columns": section.columns } as CSSProperties}
              aria-label={`${data.title} categories`}
            >
              {section.items!.map((item) => (
                <Link href={landingCollectionHref(item.href!)} key={item.href} data-landing-category>
                  <div>
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      sizes="(max-width:749px) 48vw, 20vw"
                    />
                  </div>
                  <h2>{item.title}</h2>
                  <ArrowRight aria-hidden size={14} data-category-arrow />
                </Link>
              ))}
            </nav>
          );
        if (section.type === "products")
          // The banners and circles above are sent first; a rail streams in once its cards are read.
          return (
            <Suspense
              key={section.key}
              fallback={<section className="landing-products home-products home-container" aria-label={section.heading || "Products"} aria-busy="true" data-rail-placeholder />}
            >
              <CategoryProducts
                handles={section.handles!}
                catalogue={catalogue}
                heading={section.heading}
                collection={section.collection}
                viewAll={section.viewAll}
              />
            </Suspense>
          );
        if (section.type === "divider") return null;
        if (section.type === "heading")
          return (
            <header
              key={section.key}
              className="landing-difference home-container"
            >
              <p className="home-eyebrow">{section.eyebrow}</p>
              <h2>{section.heading}</h2>
            </header>
          );
        if (section.type === "values")
          return <CategoryValues key={section.key} items={section.items!} />;
        return null;
      })}
    </div>
  );
}
