import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { categoryNames, shopMoney } from "@/lib/format";
import { ProductImage } from "./product-image";
import { SaveButton } from "./save-button";
import { CardNewBadge, CardRating, CardSwatches } from "./card-highlights";

/**
 * The storefront's product card ("MF / product" in the design): image, sale and New badges, save, name,
 * category, rating, price with its discount, and colour dots. Ratings, New and colours come from the
 * admin's product highlights and appear only where staff set them.
 * It renders on the server; only the save button and the highlights are client components, which keeps
 * cards out of the homepage's first-load JavaScript.
 * Two surfaces, as in "Maple / PDF Review / UI Components": `outlined` (the 243 px cards: white with a
 * sand border, for grids on linen) and `plain` (the 246 px cards: no fill or border, for rails on cream).
 */
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw", surface = "outlined", className }: {
  product: ProductCardModel;
  imageSizes?: string;
  surface?: "outlined" | "plain";
  className?: string;
}) {
  const sale = product.compareAtPaise !== null;
  const href = "/products/" + product.handle;
  const discount = sale ? Math.round((1 - product.pricePaise! / product.compareAtPaise!) * 100) : 0;
  return (
    <article data-store data-product-card data-card-surface={surface} className={["group/card flex flex-col overflow-hidden rounded-lg font-body text-espresso", surface === "outlined" ? "border border-sand bg-white" : "", className].filter(Boolean).join(" ")}>
      <div data-card-image className="relative aspect-square overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:justify-items-center [&_[role=img]]:gap-2 [&_[role=img]]:text-meta [&_[role=img]]:text-[#5e574f]">
        <Link href={href} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand">
          <ProductImage src={product.image ?? undefined} alt={product.title} fill sizes={imageSizes} className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none" />
        </Link>
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {sale ? <span data-card-sale className="bg-brand px-1.5 py-1 text-2xs leading-none font-bold tracking-[0.04em] text-white uppercase">Sale</span> : null}
          <CardNewBadge handle={product.handle} />
        </div>
        <SaveButton handle={product.handle} title={product.title} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pt-4 pb-3.5">
        <Link data-card-name href={href} className="line-clamp-2 min-h-[2.9em] text-card font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {product.title}
        </Link>
        <div className="flex items-center justify-between gap-2 text-meta text-[#5e574f] empty:hidden">
          {product.category ? <span data-card-category>{categoryNames[product.category]}</span> : null}
          <CardRating handle={product.handle} />
        </div>
        <div data-card-price className="grid gap-0.5">
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-price font-bold text-brand">
            <span>
              {product.priceFrom ? "From " : ""}
              {shopMoney(product.pricePaise)}
            </span>
            {discount >= 1 ? <span data-card-discount className="rounded-[4px] bg-leaf/10 px-1.5 py-0.5 text-2xs font-semibold text-[#2f6b32]">{discount}% off</span> : null}
          </p>
          {sale ? <del className="text-label font-normal text-taupe">{shopMoney(product.compareAtPaise!)}</del> : null}
        </div>
        <CardSwatches optionNames={product.optionNames} />
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
