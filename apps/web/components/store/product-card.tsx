"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { shopMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductImage } from "../product-image";
import { useShop } from "../shop-provider";
import { HeartIcon } from "./icons";

/** The storefront's product card ("MF / product" in the design): image, sale badge, save, name, price. */
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw", className }: {
  product: ProductCardModel;
  imageSizes?: string;
  className?: string;
}) {
  const { favourites, toggleFavourite } = useShop();
  const saved = favourites.includes(product.handle);
  const sale = product.compareAtPaise !== null;
  const href = "/products/" + product.handle;
  return (
    <article data-store data-product-card className={cn("group/card flex flex-col overflow-hidden rounded-lg border border-sand bg-white font-body text-espresso", className)}>
      <div data-card-image className="relative aspect-square overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:justify-items-center [&_[role=img]]:gap-2 [&_[role=img]]:text-meta [&_[role=img]]:text-taupe">
        <Link href={href} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand">
          <ProductImage src={product.image ?? undefined} alt={product.title} fill sizes={imageSizes} className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none" />
        </Link>
        {sale ? <span data-card-sale className="absolute top-3 left-3 bg-brand px-1.5 py-1 text-2xs leading-none font-bold tracking-[0.04em] text-white uppercase">Sale</span> : null}
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
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <Link data-card-name href={href} className="line-clamp-2 min-h-[2.9em] text-card font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {product.title}
        </Link>
        <p data-card-price className="m-0 flex flex-wrap items-baseline gap-x-2 text-price font-bold text-brand">
          <span>
            {product.priceFrom ? "From " : ""}
            {shopMoney(product.pricePaise)}
          </span>
          {sale ? <del className="text-label font-normal text-taupe">{shopMoney(product.compareAtPaise!)}</del> : null}
        </p>
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
