"use client";
import { useShop } from "../shop-provider";
import { Favourites } from "./favourites";

/** The /favourites page: heading, count and the saved furniture as product cards. */
export function FavouritesPage() {
  const { favourites } = useShop();
  const count = favourites.length;
  return (
    <section data-store data-favourites-page aria-labelledby="favourites-title" className="bg-linen font-body text-espresso">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-10 md:px-8 md:py-14 xl:px-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-8">
          <div className="grid gap-2">
            <p className="text-label font-bold tracking-[0.08em] text-brand uppercase">My Wishlist</p>
            <h1 id="favourites-title" className="font-serif text-title font-bold md:text-h1">Saved furniture</h1>
          </div>
          <p data-saved-count className="text-price font-bold" aria-live="polite">
            {count} {count === 1 ? "piece" : "pieces"}
          </p>
        </div>
        <Favourites />
        {count > 0 && (
          <p className="mt-6 text-label text-taupe">Saved furniture stays in this browser. Prices and availability are from the preview snapshot.</p>
        )}
      </div>
    </section>
  );
}
