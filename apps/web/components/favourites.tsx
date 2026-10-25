"use client";
import { useEffect, useState } from "react";
import { productSchema, type Product } from "@shopmaple/contracts";
import { useShop } from "./shop-provider";
import { ProductCard } from "./product-card";
import Link from "next/link";
export function Favourites() {
  const { favourites, toggleFavourite } = useShop();
  const [products, setProducts] = useState<Product[]>([]),
    [missing, setMissing] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    Promise.all(
      favourites.map(async (handle) => {
        const response = await fetch(
          "/api/products/" + encodeURIComponent(handle),
          { signal: controller.signal },
        );
        if (response.status === 404) return { handle, product: null };
        if (!response.ok) throw new Error("Saved furniture unavailable");
        return { handle, product: productSchema.parse(await response.json()) };
      }),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        setProducts(
          results.flatMap((result) => (result.product ? [result.product] : [])),
        );
        setMissing(
          results
            .filter((result) => !result.product)
            .map((result) => result.handle),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [favourites]);
  if (loading) return <p role="status">Loading saved furniture…</p>;
  if (error)
    return (
      <p role="alert">
        Saved furniture couldn’t be loaded. Please refresh to try again.
      </p>
    );
  return favourites.length ? (
    <>
      <div className="product-grid">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {missing.map((handle) => (
        <p key={handle}>
          This saved piece is no longer available: {handle}.{" "}
          <button
            className="text-button"
            onClick={() => toggleFavourite(handle)}
          >
            Remove
          </button>
        </p>
      ))}
    </>
  ) : (
    <div className="empty-state">
      <h2>A little room for inspiration</h2>
      <p>
        Tap the heart on a piece to keep it here. Saved furniture stays in this
        browser.
      </p>
      <Link className="button" href="/collections/all">
        Explore furniture
      </Link>
    </div>
  );
}
