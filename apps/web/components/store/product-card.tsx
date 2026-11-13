import Link from "next/link";
import { ArrowRight, Truck } from "lucide-react";
import { discountPercent, type ProductCardModel } from "@/lib/product-card-model";
import { shopMoney } from "@/lib/format";
import { ProductImage } from "../product-image";
import { CardLimitedBadge, CardNewBadge, CardRating } from "./card-highlights";
import { CardOptionThumbs, hasOptionPhotos } from "./card-option-thumbs";
import { SaveButton } from "./save-button";

/**
 * The storefront's product card ("MF / product" in the design): image, its tags (Sale, then the staff's
 * New and Limited), save, name with the rating on its right, price. It renders on the server; the save
 * button and the staff-entered tags and rating are small client components, which keeps cards out of
 * the homepage's first-load JavaScript.
 */
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw", className }: {
  product: ProductCardModel;
  imageSizes?: string;
  className?: string;
}) {
  const sale = product.compareAtPaise !== null;
  const href = "/products/" + product.handle;
  const percent = discountPercent(product);
  return (
    <article data-store data-product-card className={["group/card flex flex-col overflow-hidden rounded-lg border border-sand bg-white shadow-[0_1px_3px_rgb(41_37_31/0.08)] font-text text-espresso", className].filter(Boolean).join(" ")}>
      <div data-card-image className="relative aspect-square overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:justify-items-center [&_[role=img]]:gap-2 [&_[role=img]]:text-meta [&_[role=img]]:text-[#5e574f]">
        <Link href={href} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand">
          <ProductImage src={product.image ?? undefined} alt={product.title} fill sizes={imageSizes} className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none" />
        </Link>
        <div data-card-badges className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {sale ? <span data-card-sale className="bg-brand px-1.5 py-1 text-2xs leading-none font-bold tracking-[0.04em] text-white uppercase">Sale</span> : null}
          <CardNewBadge handle={product.handle} />
          <CardLimitedBadge handle={product.handle} />
        </div>
        <SaveButton handle={product.handle} title={product.title} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        {/* The rating sits on the name's right; on the narrowest cards it wraps beneath rather than squeeze the name. */}
        <div data-card-heading className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <Link data-card-name href={href} className="line-clamp-2 min-h-[2.9em] min-w-0 flex-[1_1_8.5rem] text-card font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {product.title}
          </Link>
          <span data-card-rating-slot className="shrink-0 pt-[3px] whitespace-nowrap"><CardRating rating={product.rating} /></span>
        </div>
        <p data-card-price className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-price font-bold text-brand">
          <span>
            {product.priceFrom ? "From " : ""}
            {shopMoney(product.pricePaise)}
          </span>
          {sale && percent !== null ? <span data-card-discount className="rounded-[4px] bg-[#e6f2e3] px-1.5 py-1 text-[10px] leading-none font-bold text-[#2f6b3a]">{percent}% OFF</span> : null}
          {sale ? <del className="basis-full text-label font-normal text-taupe">{shopMoney(product.compareAtPaise!)}</del> : null}
        </p>
        {product.freeDelivery ? <p data-card-free-delivery className="m-0 inline-flex items-center gap-1 text-meta font-semibold text-[#2f6b32]"><Truck aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Free delivery</p> : null}
        {product.otherOptionsOnRequest && <p data-card-options className="m-0 text-meta text-taupe">Other options on request</p>}
        {product.optionCount > 1 && hasOptionPhotos(product) && <CardOptionThumbs product={product} />}
        {product.optionCount > 1 && !hasOptionPhotos(product) && (
          <Link data-card-options href={href} className="mt-auto inline-flex items-center gap-1 pt-1 text-meta font-semibold text-taupe no-underline hover:text-brand" aria-label={`View ${product.optionCount} options for ${product.title}`}>
            {product.optionCount} options <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
    </article>
  );
}
