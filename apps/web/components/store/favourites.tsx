"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductCardModel } from "@/lib/product-card-model";
import { requestSavedProduct } from "@/lib/saved-product-request";
import { shopMoney } from "@/lib/format";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";
import { useShop } from "../shop-provider";
import { ProductCard } from "./product-card";
import { HeartIcon } from "./icons";
import { primaryButton } from "./wishlist-styles";

type Resolution = { product: ProductCardModel | null; failed: boolean };
const removeSelector = '[data-save-button][aria-pressed="true"], [data-remove-saved], [data-remove-missing]';
const textButton =
  "cursor-pointer border-0 bg-transparent p-0 font-body font-bold text-brand underline underline-offset-2 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
// The row's small taupe actions, underlined on hover.
const rowAction =
  "text-label text-taupe no-underline hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const imageSizes = "(max-width:767px) calc((100vw - 44px) / 2), (max-width:1279px) calc((100vw - 96px) / 3), (min-width:1440px) 312px, calc((100vw - 176px) / 4)";

/**
 * Saved furniture, resolved from the handles kept in this browser. `page` shows the product
 * cards (the /favourites page); `drawer` shows the "Wishlist with items" rows for the header's drawer.
 * With nothing saved, both show the "Wishlist empty" guidance card.
 */
export function Favourites({
  onNavigate,
  variant = "page",
}: {
  onNavigate?: () => void;
  variant?: "page" | "drawer";
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
      container.current?.querySelector<HTMLAnchorElement>("[data-wishlist-empty] a") ??
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
  const drawer = variant === "drawer";
  const EmptyHeading = drawer ? "h3" : "h2";
  return (
    <div
      ref={container}
      data-store
      data-saved-furniture={variant}
      role="region"
      aria-label="Saved furniture"
      tabIndex={-1}
      className={cx("grid font-body text-espresso outline-none", drawer ? "gap-6" : "gap-4")}
      onClickCapture={(event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>(removeSelector);
        if (!button || document.activeElement !== button) return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(removeSelector)];
        removedFocus.current = { button, index: controls.indexOf(button) };
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      {loading && <p role="status" className="text-ui text-taupe">Loading saved furniture…</p>}
      {error && (
        <p role="alert" className="rounded-lg border border-sand bg-white p-3 text-ui text-espresso">
          Saved furniture couldn’t be loaded. Please try again.{" "}
          <button
            type="button"
            className={textButton}
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
          {drawer ? (
            <ul data-wishlist-items className="grid gap-6">
              {products.map((product) => (
                <WishlistRow key={product.id} product={product} onRemove={() => toggleFavourite(product.handle)} />
              ))}
            </ul>
          ) : (
            <div data-saved-grid className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {products.map((product) => <ProductCard key={product.id} product={product} imageSizes={imageSizes} />)}
            </div>
          )}
          {missing.map((handle) => (
            <p key={handle} className="rounded-lg border border-sand bg-white p-3 text-ui text-taupe">
              This saved piece is no longer available: {handle}.{" "}
              <button
                type="button"
                className={textButton}
                data-remove-missing
                onClick={() => toggleFavourite(handle)}
              >
                Remove
              </button>
            </p>
          ))}
        </>
      ) : (
        // "Empty list guidance": a cream card (heart, 29 px serif line, 16 px note), then the button and a note.
        // The frame's "Wishlist inspiration" photo is left out: it is a generated render, and the shop uses only its own photos.
        <div data-wishlist-empty className={cx("grid gap-6", !drawer && "w-full max-w-[420px] justify-self-center")}>
          <div className="flex flex-col items-start gap-4 bg-cream p-6">
            <HeartIcon className="size-8 text-brand" />
            <EmptyHeading className="font-serif text-h2 font-bold text-espresso">
              Your next favourite <br />is waiting.
            </EmptyHeading>
            <p className="text-price text-taupe">Save the pieces you love and return to them whenever inspiration strikes.</p>
          </div>
          <Link className={cx(primaryButton, "w-full")} href="/collections/all">
            Explore collections →
          </Link>
          <p className="text-meta text-taupe">Saved furniture stays in this browser.</p>
        </div>
      )}
    </div>
  );
}

/** A "Wishlist with items" row: a 94 px photo, the name, the price, then "Check availability · Remove". */
function WishlistRow({ product, onRemove }: { product: ProductCardModel; onRemove: () => void }) {
  const href = "/products/" + product.handle;
  return (
    <li data-wishlist-item className="flex items-start gap-4">
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block size-[94px] shrink-0 overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:text-2xs [&_[role=img]]:text-taupe [&_[role=img]_span]:sr-only"
      >
        <ProductImage src={product.image ?? undefined} alt={product.title} fill sizes="94px" className="object-cover" />
      </Link>
      <div className="grid min-w-0 flex-1 gap-1">
        <Link
          data-wishlist-item-name
          href={href}
          className="line-clamp-2 text-price font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {product.title}
        </Link>
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-card font-bold text-brand">
          <span data-wishlist-item-price>
            {product.priceFrom ? "From " : ""}
            {shopMoney(product.pricePaise)}
          </span>
          {product.compareAtPaise !== null ? (
            <del className="text-label font-normal text-taupe">{shopMoney(product.compareAtPaise)}</del>
          ) : null}
        </p>
        {product.otherOptionsOnRequest && <p className="text-label text-taupe">Other options on request</p>}
        <p className="flex items-center gap-2 text-label text-taupe">
          <Link
            data-wishlist-availability
            href={"/pages/contact?product=" + encodeURIComponent(product.title)}
            className={rowAction}
          >
            Check availability
          </Link>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            data-remove-saved
            aria-label={`Remove ${product.title} from wishlist`}
            onClick={onRemove}
            className={cx(rowAction, "cursor-pointer border-0 bg-transparent p-0 font-body")}
          >
            Remove
          </button>
        </p>
      </div>
    </li>
  );
}
