"use client";
import Link from "next/link";
import { ProductImage } from "./product-image";
import type { ProductCardModel } from "@/lib/product-card-model";
import { Heart, ArrowUpRight } from "lucide-react";
import { useShop } from "./shop-provider";
import { shopMoney } from "@/lib/format";
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw" }: {
  product: ProductCardModel;
  imageSizes?: string;
}) {
  const { favourites, toggleFavourite } = useShop();
  const saved = favourites.includes(product.handle);
  const sale = product.compareAtPaise !== null;
  return (
    <article className="product-card">
      <div className="product-card-image">
        <Link href={"/products/" + product.handle}>
          <ProductImage
            src={product.image ?? undefined}
            alt={product.title}
            fill
            sizes={imageSizes}
          />
        </Link>
        {sale ? <span className="card-sale">Sale</span> : null}
        <button
          className={"save-button" + (saved ? " saved" : "")}
          aria-label={(saved ? "Unsave " : "Save ") + product.title}
          aria-pressed={saved}
          onClick={() => toggleFavourite(product.handle)}
        >
          <Heart size={19} />
        </button>
        <Link className="view-product" href={"/products/" + product.handle}>
          View details <ArrowUpRight size={17} />
        </Link>
      </div>
      <Link className="product-card-name" href={"/products/" + product.handle}>
        {product.title}
      </Link>
      <p className="product-card-price">
        <span>
          {product.priceFrom ? "From " : ""}
          {shopMoney(product.pricePaise)}
        </span>
        {sale ? <del>{shopMoney(product.compareAtPaise!)}</del> : null}
      </p>
      {product.otherOptionsOnRequest && <p className="product-card-options">Other options on request</p>}
      {product.optionCount > 1 && (
        <Link
          className="product-card-options"
          href={"/products/" + product.handle}
          aria-label={`View ${product.optionCount} options for ${product.title}`}
        >
          {product.optionCount} options{" "}
          <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
