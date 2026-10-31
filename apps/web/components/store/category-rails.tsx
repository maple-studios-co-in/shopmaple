import type { ProductCard as ProductCardModel } from "@shopmaple/contracts";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";
import { getProductCards } from "@/lib/catalog";
import { shopFile } from "@/lib/format";
import { ProductCard } from "@/components/store/product-card";
import { HomeCarousel } from "@/components/store/carousel";
import { productRail } from "@/components/store/carousel-styles";
import { landingCollectionHref } from "@/components/store/category-landing";
import sourceCatalog from "@/data/landing-catalog.json";

/*
 * The product rails, enquiry-only source cards and value cards of the legacy Chairs editorial
 * (and the standalone category rail), in the storefront's current look: legacy `.landing-*`,
 * `.home-products`, `.home-values` and `.product-card` restated as utilities, including what the
 * global serif heading and paragraph rules gave them. max-[750px] is the legacy
 * `max-width: 749px`, max-[701px] the legacy `max-width: 700px`.
 */

/** The page-width column (legacy `.home-container`). */
export const landingContainer = "mx-auto max-w-[1440px] px-10 max-[750px]:px-4";
/** The small uppercase kicker above a heading (legacy `.home-eyebrow`). */
export const landingEyebrow = "mb-1.5 font-['Red_Hat_Display',Manrope,sans-serif] text-[16px] tracking-[0.06em] uppercase";
/** Underline on hover, as the global link rule gave legacy markup. */
export const hoverUnderline = "hover:underline hover:underline-offset-[5px]";

/** A titled product section (legacy `.landing-products.home-products`). */
export const landingProducts = `${landingContainer} pt-6 pb-14 max-[750px]:pb-10`;
export const landingProductsHeader = "mb-7 flex items-center justify-between gap-6";
/** Inherits its colour: burgundy inside the Chairs editorial (legacy `.home-parity h2`), ink elsewhere. */
export const landingProductsHeading = "font-serif text-[48px] leading-[1.13] font-bold italic max-[750px]:text-[36px]";
export const landingProductsLink = `font-['Red_Hat_Display',Manrope,sans-serif] text-[16px] text-brand ${hoverUnderline}`;
/** The four-up product rail, which wraps into a two-column grid below 750 px (legacy `.landing-products .home-product-rail`). */
export const landingRail = clsx(productRail, "max-[750px]:grid-flow-row max-[750px]:auto-cols-auto max-[750px]:grid-cols-2 max-[750px]:gap-y-9 max-[750px]:overflow-visible");
export const landingRailControls = "mt-5 max-[750px]:hidden";

type SourceProduct = { title: string; image: string };

/**
 * An editorial product the live catalogue lacks, kept enquiry-only (legacy `.product-card` with
 * `.landing-source-product`). `room` is the narrower card of a room's featured-products row.
 */
export function SourceProductCard({ product, sizes, room = false, internal = true }: {
  product: SourceProduct;
  sizes: string;
  room?: boolean;
  /** Client-side navigation (Link) or a plain anchor. */
  internal?: boolean;
}) {
  const href = `/pages/contact?product=${encodeURIComponent(product.title)}`;
  const Anchor = internal ? Link : "a";
  return (
    <article data-store data-product-card data-source-product className={clsx("min-w-0", room && "flex-[0_0_250px] snap-start max-[990px]:basis-[clamp(150px,calc(50%_-_10px),250px)] max-[750px]:basis-[192px]")}>
      <div data-card-image className="group/image relative aspect-square overflow-hidden rounded-[12px] bg-[#ebe6df] max-[701px]:rounded-[8px]">
        <Anchor href={href} className="absolute inset-0">
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes={sizes}
            className="object-cover [transition:transform_0.35s_ease] group-hover/image:[transform:scale(1.025)]"
          />
        </Anchor>
      </div>
      <Anchor data-card-name className={clsx("mt-[13px] block leading-[1.5] font-medium", hoverUnderline, room ? "text-[14px]" : "text-[15px] max-[701px]:text-[12px]")} href={href}>
        {product.title}
      </Anchor>
      <p data-card-price className="mt-[5px] mb-2.5 flex flex-wrap items-baseline gap-2 text-[13px] text-brand max-[750px]:gap-1 max-[750px]:text-[11px]">
        {internal ? "Price on request" : <span>Price on request</span>}
      </p>
    </article>
  );
}

const sourceProducts: Record<string, SourceProduct> = sourceCatalog;

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
      // Keep editorial products absent from the live catalogue enquiry-only.
      <SourceProductCard key={handle} product={sourceProducts[handle]!} sizes="(max-width: 749px) 48vw, 25vw" internal={false} />
    ) : null;
  });
  return (
    <section
      data-store
      data-category-products
      className={landingProducts}
      aria-label={heading || "Nimbus Series"}
    >
      {heading && (
        <header className={landingProductsHeader}>
          <div>
            <p className={landingEyebrow}>Shop By</p>
            <h2 className={landingProductsHeading}>{heading}</h2>
          </div>
          {viewAll && (
            <Link className={landingProductsLink} href={landingCollectionHref(`/collections/${collection}`)}>
              View all →
            </Link>
          )}
        </header>
      )}
      {grid ? (
        <div className="grid grid-cols-4 gap-6 max-[750px]:grid-cols-2 max-[750px]:gap-4">{cards}</div>
      ) : (
        <HomeCarousel label={heading || "Furniture"} railClassName={landingRail} controlsClassName={landingRailControls}>{cards}</HomeCarousel>
      )}
    </section>
  );
}

/** The value cards that close the Chairs editorial (legacy `.landing-values.home-values`). */
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
    <section data-store data-category-values className={`${landingContainer} grid grid-cols-4 gap-4 pt-8 pb-12 text-center max-[750px]:grid-cols-[1fr] max-[750px]:gap-8`}>
      {items.map((item) => (
        <div key={item.key ?? item.title} className="rounded-[12px] bg-[#f6f2ed] px-4 py-6">
          <Image
            src={
              item.image.startsWith("https:")
                ? item.image
                : shopFile(item.image)
            }
            alt=""
            width={100}
            height={100}
            className="size-16 object-contain"
          />
          <h3 className="mt-4 mb-2 font-serif text-[25px] leading-[1.13] font-normal">{item.title}</h3>
          {item.body && <p className="text-[14px] leading-[1.5]">{item.body}</p>}
        </div>
      ))}
    </section>
  );
}
