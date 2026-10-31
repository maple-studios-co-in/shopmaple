"use client";
import { useShop } from "../shop-provider";
import { Heart } from "lucide-react";

/** The card's save heart: the only part of a product card that needs the browser. */
export function SaveButton({ handle, title }: { handle: string; title: string }) {
  const { favourites, toggleFavourite } = useShop();
  const saved = favourites.includes(handle);
  return (
    <button
      type="button"
      data-save-button
      className="absolute top-3 right-3 grid size-[30px] cursor-pointer place-items-center rounded-full border-0 bg-white p-0 text-brand shadow-xs transition-transform after:absolute after:-inset-[7px] after:rounded-full after:content-[''] hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      aria-label={(saved ? "Unsave " : "Save ") + title}
      aria-pressed={saved}
      onClick={() => toggleFavourite(handle)}
    >
      <Heart aria-hidden="true" strokeWidth={1.6} className={saved ? "size-[18px] fill-current" : "size-[18px]"} />
    </button>
  );
}
