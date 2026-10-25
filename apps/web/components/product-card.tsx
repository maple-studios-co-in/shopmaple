"use client";
import Link from "next/link";
import Image from "next/image";
import { Heart, ArrowUpRight } from "lucide-react";
import type { Product } from "@shopmaple/contracts";
import { useShop } from "./shop-provider";
import { money } from "@/lib/format";
export function ProductCard({ product }: { product: Product }) {
  const { favourites, toggleFavourite } = useShop();
  const saved = favourites.includes(product.handle);
  const price = Math.min(...product.variants.map((v) => v.pricePaise));
  return (
    <article className="product-card">
      <div className="product-card-image">
        <Link href={"/products/" + product.handle}>
          <Image
            src={product.images[0]!}
            alt={product.title}
            fill
            sizes="(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 24vw"
          />
        </Link>
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
        {product.variants.length > 1 ? "From " : ""}
        {money(price)}
      </p>
    </article>
  );
}
