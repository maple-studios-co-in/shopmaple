"use client";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { categoryNames, shopMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";
import { useShop } from "../shop-provider";
import { HeartIcon } from "./icons";
import { useProductHighlights } from "./product-highlights";

/**
 * The storefront's product card ("MF / product" in the design): image, sale and New badges, save, name,
 * category, rating, price with its discount, and colour dots. Ratings, New and colours come from the
 * admin's product highlights and appear only where staff set them.
 */
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw", className }: {
  product: ProductCardModel;
  imageSizes?: string;
  className?: string;
}) {
  const { favourites, toggleFavourite } = useShop();
  const saved = favourites.includes(product.handle);
  const sale = product.compareAtPaise !== null;
  const href = "/products/" + product.handle;
  const highlights = useProductHighlights();
  const extra = highlights.product(product.handle);
  const swatches = product.optionNames.flatMap((name) => { const hex = highlights.swatch(name); return hex ? [{ name, hex }] : []; });
  const discount = sale ? Math.round((1 - product.pricePaise! / product.compareAtPaise!) * 100) : 0;
  return (
    <article data-store data-product-card className={cn("group/card flex flex-col overflow-hidden rounded-lg border border-sand bg-white font-body text-espresso", className)}>
      <div data-card-image className="relative aspect-square overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:justify-items-center [&_[role=img]]:gap-2 [&_[role=img]]:text-meta [&_[role=img]]:text-taupe">
        <Link href={href} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand">
          <ProductImage src={product.image ?? undefined} alt={product.title} fill sizes={imageSizes} className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none" />
        </Link>
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {sale ? <span data-card-sale className="bg-brand px-1.5 py-1 text-2xs leading-none font-bold tracking-[0.04em] text-white uppercase">Sale</span> : null}
          {extra?.isNew ? <span data-card-new className="rounded-[4px] bg-[#6b2fd6] px-2 py-1 text-2xs leading-none font-bold text-white">New</span> : null}
        </div>
        <button
          type="button"
          data-save-button
          className="absolute top-3 right-3 grid size-[30px] place-items-center rounded-full bg-white text-brand shadow-xs transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          aria-label={(saved ? "Unsave " : "Save ") + product.title}
          aria-pressed={saved}
          onClick={() => toggleFavourite(product.handle)}
        >
          <HeartIcon filled={saved} className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pt-4 pb-3.5">
        <Link data-card-name href={href} className="line-clamp-2 min-h-[2.9em] text-card font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {product.title}
        </Link>
        {(product.category || extra?.rating) && (
          <div className="flex min-h-5 items-center justify-between gap-2 text-meta text-taupe">
            {product.category ? <span data-card-category>{categoryNames[product.category]}</span> : <span />}
            {extra?.rating ? (
              <span data-card-rating aria-label={`Rated ${extra.rating.value.toFixed(1)} out of 5 from ${extra.rating.count} ${extra.rating.count === 1 ? "review" : "reviews"}`}
                className="inline-flex items-center gap-1 text-espresso">
                <span aria-hidden="true">{extra.rating.value.toFixed(1)}</span>
                <Star aria-hidden="true" className="size-3.5 fill-[#f5a623] text-[#f5a623]" />
                <span aria-hidden="true" className="text-taupe">({extra.rating.count})</span>
              </span>
            ) : null}
          </div>
        )}
        <div data-card-price className="grid gap-0.5">
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-price font-bold text-brand">
            <span>
              {product.priceFrom ? "From " : ""}
              {shopMoney(product.pricePaise)}
            </span>
            {sale ? <span data-card-discount className="rounded-[4px] bg-leaf/10 px-1.5 py-0.5 text-2xs font-semibold text-leaf">{discount}% off</span> : null}
          </p>
          {sale ? <del className="text-label font-normal text-taupe">{shopMoney(product.compareAtPaise!)}</del> : null}
        </div>
        {swatches.length > 0 && (
          <ul data-card-swatches aria-label={`Available in ${swatches.map((swatch) => swatch.name).join(", ")}`} className="mt-1 flex flex-wrap gap-1.5">
            {swatches.slice(0, 6).map((swatch) => (
              <li key={swatch.name} data-swatch title={swatch.name} style={{ backgroundColor: swatch.hex }}
                className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgb(41_37_31/0.18)]" />
            ))}
            {swatches.length > 6 ? <li aria-hidden="true" className="text-label text-taupe">+{swatches.length - 6}</li> : null}
          </ul>
        )}
        {product.otherOptionsOnRequest && <p data-card-options className="m-0 text-meta text-taupe">Other options on request</p>}
        {product.optionCount > 1 && (
          <Link data-card-options href={href} className="mt-auto inline-flex items-center gap-1 pt-1 text-meta font-semibold text-taupe no-underline hover:text-brand" aria-label={`View ${product.optionCount} options for ${product.title}`}>
            {product.optionCount} options <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
    </article>
  );
}
