import type { ProductCard as ProductCardModel } from "@shopmaple/contracts";
import Image from "next/image";
import Link from "next/link";
import { getProductCards } from "@/lib/catalog";
import { shopFile } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
import { HomeCarousel } from "@/components/home-carousel";
import { landingCollectionHref } from "@/components/store/category-landing";
import sourceCatalog from "@/data/landing-catalog.json";
// The category pages are rebuilt in components/store; the rails and value cards below stay as
// they were for the Nimbus page and the legacy Chairs editorial.
export { CategoryLanding, landingCollectionHref } from "@/components/store/category-landing";
type SourceProduct = {
  handle: string;
  title: string;
  image: string;
  price: string;
  compareAt: string;
};
const sourceProducts: Record<string, SourceProduct> = sourceCatalog;
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
      <a data-card-name className="product-card-name" href={href}>
        {product.title}
      </a>
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
