import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { shopMoney } from "@/lib/format";
import { ProductImage } from "../product-image";
import { SaveButton } from "./save-button";

/**
 * The storefront's product card ("MF / product" in the design): image, sale badge, save, name, price.
 * It renders on the server; only the save button is a client component, which keeps cards out of the
 * homepage's first-load JavaScript.
 */
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw", className }: {
  product: ProductCardModel;
  imageSizes?: string;
  className?: string;
}) {
  const sale = product.compareAtPaise !== null;
  const href = "/products/" + product.handle;
  return (
    <article data-store data-product-card className={["group/card flex flex-col overflow-hidden rounded-lg border border-sand bg-white font-body text-espresso", className].filter(Boolean).join(" ")}>
      <div data-card-image className="relative aspect-square overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:justify-items-center [&_[role=img]]:gap-2 [&_[role=img]]:text-meta [&_[role=img]]:text-[#5e574f]">
        <Link href={href} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand">
          <ProductImage src={product.image ?? undefined} alt={product.title} fill sizes={imageSizes} className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none" />
        </Link>
        {sale ? <span data-card-sale className="absolute top-3 left-3 bg-brand px-1.5 py-1 text-2xs leading-none font-bold tracking-[0.04em] text-white uppercase">Sale</span> : null}
        <SaveButton handle={product.handle} title={product.title} />
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
