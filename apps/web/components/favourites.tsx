"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { requestSavedProduct } from "@/lib/saved-product-request";
import { useShop } from "./shop-provider";
import { ProductCard } from "./product-card";
import Link from "next/link";
import { Heart } from "lucide-react";
type Resolution = { product: ProductCardModel | null; failed: boolean };
const removeSelector = '.save-button[aria-pressed="true"], [data-remove-missing]';

export function Favourites({
  onNavigate,
  compact = false,
}: {
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { favourites, toggleFavourite } = useShop();
  const [resolved, setResolved] = useState<Map<string, Resolution>>(new Map());
  const [retryAttempt, setRetryAttempt] = useState(0);
  const cache = useRef(new Map<string, Resolution>());
  const requests = useRef(new Map<string, AbortController>());
  const container = useRef<HTMLDivElement>(null);
  const removedFocus = useRef<{
    button: HTMLButtonElement;
    index: number;
  } | null>(null);
  useEffect(() => {
    const wanted = new Set(favourites);
    for (const [handle, controller] of requests.current) {
      if (!wanted.has(handle)) {
        controller.abort();
        requests.current.delete(handle);
      }
    }
    for (const handle of cache.current.keys()) {
      if (!wanted.has(handle)) cache.current.delete(handle);
    }
    for (const handle of wanted) {
      if (cache.current.has(handle) || requests.current.has(handle)) continue;
      const controller = new AbortController();
      requests.current.set(handle, controller);
      const settle = (result: Resolution) => {
        if (controller.signal.aborted || requests.current.get(handle) !== controller)
          return;
        requests.current.delete(handle);
        cache.current.set(handle, result);
        // The product's address was renamed: show it under the new one and keep it saved there.
        if (result.product && result.product.handle !== handle) {
          cache.current.set(result.product.handle, result);
          toggleFavourite(handle);
          if (!favourites.includes(result.product.handle)) toggleFavourite(result.product.handle);
        }
        setResolved(new Map(cache.current));
      };
      requestSavedProduct(handle, controller.signal)
        .then((product) => settle({ product, failed: false }))
        .catch(() => settle({ product: null, failed: true }));
    }
    setResolved(new Map(cache.current));
  }, [favourites, retryAttempt]);
  useEffect(() => {
    return () => {
      for (const controller of requests.current.values()) controller.abort();
      requests.current.clear();
    };
  }, []);
  useLayoutEffect(() => {
    const removed = removedFocus.current;
    removedFocus.current = null;
    if (!removed || removed.button.isConnected) return;
    const controls = container.current?.querySelectorAll<HTMLButtonElement>(
      removeSelector,
    );
    const next = controls?.[Math.min(removed.index, controls.length - 1)];
    (next ??
      container.current?.querySelector<HTMLAnchorElement>(".wishlist-empty a") ??
      container.current)?.focus();
  }, [favourites]);
  const products = favourites.flatMap((handle) => {
    const result = resolved.get(handle);
    return result?.product ? [result.product] : [];
  });
  const missing = favourites.filter((handle) => {
    const result = resolved.get(handle);
    return result && !result.product && !result.failed;
  });
  const loading = favourites.some((handle) => !resolved.has(handle));
  const error = favourites.some((handle) => resolved.get(handle)?.failed);
  return (
    <div
      ref={container}
      role="region"
      aria-label="Saved furniture"
      tabIndex={-1}
      onClickCapture={(event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>(removeSelector);
        if (!button || document.activeElement !== button) return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(removeSelector)];
        removedFocus.current = { button, index: controls.indexOf(button) };
      }}
    >
      {loading && <p role="status">Loading saved furniture…</p>}
      {error && (
        <p role="alert">
          Saved furniture couldn’t be loaded. Please try again.{" "}
          <button
            className="text-button"
            onClick={(event) => {
              if (document.activeElement === event.currentTarget) container.current?.focus();
              for (const handle of favourites) {
                if (cache.current.get(handle)?.failed) cache.current.delete(handle);
              }
              setResolved(new Map(cache.current));
              setRetryAttempt((attempt) => attempt + 1);
            }}
          >
            Retry failed items
          </button>
        </p>
      )}
      {favourites.length ? (
        <>
          <div
            className={`product-grid ${compact ? "wishlist-preview" : ""}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) onNavigate?.();
            }}
          >
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {missing.map((handle) => (
            <p key={handle}>
              This saved piece is no longer available: {handle}.{" "}
              <button
                className="text-button"
                data-remove-missing
                onClick={() => toggleFavourite(handle)}
              >
                Remove
              </button>
            </p>
          ))}
        </>
      ) : (
        <div className="empty-state wishlist-empty">
          <Heart size={44} strokeWidth={1} aria-hidden="true" />
          <h2>Your wishlist is empty</h2>
          <p>
            Tap the heart on a piece to keep it here. Saved furniture stays in this
            browser.
          </p>
          <Link className="button" href="/collections/all" onClick={onNavigate}>
            Explore Collections
          </Link>
        </div>
      )}
    </div>
  );
}
