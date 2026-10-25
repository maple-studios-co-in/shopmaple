import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { cache, type CSSProperties } from "react";
import { getProducts } from "@/lib/catalog";
import { collectionTitles } from "@/lib/collections";
import { shopFile } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
import { HomeCarousel } from "@/components/home-carousel";
import { CategoryIntroduction } from "@/components/category-controls";
import categories from "@/data/landing-categories.json";
import sourceCatalog from "@/data/landing-catalog.json";

type SourceProduct = {
  handle: string;
  title: string;
  image: string;
  price: string;
  compareAt: string;
};
const sourceProducts: Record<string, SourceProduct> = sourceCatalog;
type LandingSection = {
  type: string;
  columns?: number;
  width?: number;
  height?: number;
  desktop?: string;
  mobile?: string;
  items?: { href?: string; title: string; image: string; body?: string }[];
  heading?: string;
  eyebrow?: string;
  handles?: string[];
  collection?: string;
  viewAll?: boolean;
};

export function landingCollectionHref(path: string) {
  const handle = path.split("/").filter(Boolean).at(-1) || "all";
  return Object.hasOwn(collectionTitles, handle)
    ? `/collections/${handle}`
    : `https://shop.maplefurnishers.com/collections/${handle}`;
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
  const image = getImageProps({
    src: shopFile(desktop),
    alt,
    width,
    height,
    sizes:
      "(min-width: 1440px) 1360px, (max-width: 749px) calc(100vw - 32px), calc(100vw - 80px)",
    loading: eager ? "eager" : "lazy",
    fetchPriority: eager ? "high" : "auto",
  }).props;
  const small = getImageProps({
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
    <div className="landing-banner home-container">
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
  // A product absent from the owned catalogue remains a truthful link to the source store.
  const href = `https://shop.maplefurnishers.com/products/${product.handle}`;
  return (
    <article className="product-card landing-source-product">
      <div className="product-card-image">
        <a href={href}>
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 749px) 48vw, 25vw"
          />
        </a>
        {product.compareAt && <span className="card-sale">Sale</span>}
      </div>
      <a className="product-card-name" href={href}>
        {product.title}
      </a>
      <p className="product-card-price">
        <span>{product.price}</span>
        {product.compareAt && <del>{product.compareAt}</del>}
      </p>
    </article>
  );
}

const landingCatalogue = cache(async () => {
  const first = await getProducts({ limit: "50", sort: "featured" });
  const remaining = await Promise.all(
    Array.from(
      { length: Math.max(0, Math.ceil(first.total / 50) - 1) },
      (_, index) =>
        getProducts({ limit: "50", sort: "featured", page: String(index + 2) }),
    ),
  );
  return new Map(
    [...first.products, ...remaining.flatMap((page) => page.products)].map(
      (product) => [product.handle, product],
    ),
  );
});

export async function CategoryProducts({
  handles,
  heading,
  collection,
  viewAll,
  grid = false,
}: {
  handles: string[];
  heading?: string;
  collection?: string;
  viewAll?: boolean;
  grid?: boolean;
}) {
  const products = await landingCatalogue();
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
  items: { title: string; body?: string; image: string }[];
}) {
  return (
    <section className="landing-values home-values home-container">
      {items.map((item) => (
        <div key={item.title}>
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

export function CategoryLanding({ slug }: { slug: keyof typeof categories }) {
  const data = categories[slug];
  return (
    <div className="home-parity landing-parity">
      {(data.sections as LandingSection[]).map((section, index) => {
        if (section.type === "banner")
          return (
            <div key={index}>
              <CategoryBanner
                desktop={section.desktop!}
                mobile={section.mobile!}
                width={section.width!}
                height={section.height!}
                eager={index === 0}
                alt={`${data.title} — ${index === 0 ? "furniture for every occasion" : "find furniture for your space"}`}
              />
              {index === 0 && (
                <CategoryIntroduction
                  title={data.title}
                  description={data.description}
                />
              )}
            </div>
          );
        if (section.type === "categories")
          return (
            <nav
              key={index}
              className="landing-categories home-container"
              style={{ "--landing-columns": section.columns } as CSSProperties}
              aria-label={`${data.title} categories`}
            >
              {section.items!.map((item) => (
                <Link href={landingCollectionHref(item.href!)} key={item.href}>
                  <div>
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      sizes="(max-width:749px) 48vw, 20vw"
                    />
                  </div>
                  <h2>{item.title}</h2>
                </Link>
              ))}
            </nav>
          );
        if (section.type === "products")
          return (
            <CategoryProducts
              key={index}
              handles={section.handles!}
              heading={section.heading}
              collection={section.collection}
              viewAll={section.viewAll}
            />
          );
        if (section.type === "divider")
          return <div key={index} className="home-divider" />;
        if (section.type === "heading")
          return (
            <header key={index} className="landing-difference home-container">
              <p className="home-eyebrow">{section.eyebrow}</p>
              <h2>{section.heading}</h2>
            </header>
          );
        if (section.type === "values")
          return <CategoryValues key={index} items={section.items!} />;
        return null;
      })}
    </div>
  );
}
