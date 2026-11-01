"use client";
import { useShop } from "../shop-provider";
import { Favourites } from "./favourites";
import { eyebrow } from "./section-heading";
import { useHydrated } from "./use-hydrated";

/**
 * The /favourites page, in the wishlist drawer's language: the "Saved furniture" eyebrow and a 40 px
 * "My wishlist" title (29 px under 750 px), the count once the browser has read the saved list, then
 * the saved pieces as product cards, or the drawer's guidance card when nothing is saved.
 */
export function FavouritesPage() {
  const { favourites } = useShop();
  const count = favourites.length;
  const hydrated = useHydrated();
  return (
    <section data-store data-favourites-page aria-labelledby="favourites-title" className="bg-linen font-body text-espresso">
      <div className="mx-auto w-full max-w-[1440px] px-16 py-16 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-4 max-[750px]:py-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 max-[750px]:mb-6">
          <div className="flex flex-col gap-6 max-[750px]:gap-3">
            <p data-section-eyebrow className={eyebrow}>Saved furniture</p>
            <h1 id="favourites-title" className="font-serif text-display font-bold max-[750px]:text-h2">My wishlist</h1>
          </div>
          <p data-saved-count className="text-price font-bold text-brand" aria-live="polite">
            {hydrated ? `${count} ${count === 1 ? "piece" : "pieces"}` : null}
          </p>
        </div>
        <Favourites />
        {count > 0 && (
          <p className="mt-8 text-meta text-taupe">Saved furniture stays in this browser. Prices and availability are from the preview snapshot.</p>
        )}
      </div>
    </section>
  );
}
