"use client";
import Link from "next/link";
import { ProductImage } from "./product-image";
import { pricedVariants } from "@/lib/product-availability";
import { Heart, ArrowUpRight } from "lucide-react";
import type { Product } from "@shopmaple/contracts";
import { useShop } from "./shop-provider";
import { shopMoney } from "@/lib/format";
export function ProductCard({ product, imageSizes = "(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw" }: {
  product: Product;
  imageSizes?: string;
}) {
  const { favourites, toggleFavourite } = useShop();
  const saved = favourites.includes(product.handle);
  const priced = pricedVariants(product);
  const cheapest = priced.sort((a, b) => a.pricePaise - b.pricePaise)[0];
  const price = cheapest?.pricePaise ?? null;
  const unknownPrices = priced.length < product.variants.length;
  const sale = price !== null && cheapest?.compareAtPaise && cheapest.compareAtPaise > price;
  return (
    <article className="product-card">
      <div className="product-card-image">
        <Link href={"/products/" + product.handle}>
          <ProductImage
            src={product.images[0]}
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
          {price !== null && (unknownPrices || new Set(priced.map((v) => v.pricePaise)).size > 1)
            ? "From "
            : ""}
          {shopMoney(price)}
        </span>
        {sale ? <del>{shopMoney(cheapest!.compareAtPaise!)}</del> : null}
      </p>
      {unknownPrices && price !== null && <p className="product-card-options">Other options on request</p>}
      {product.variants.length > 1 && (
        <Link
          className="product-card-options"
          href={"/products/" + product.handle}
          aria-label={`View ${product.variants.length} options for ${product.title}`}
        >
          {product.variants.length} options{" "}
          <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
