"use client";
import { type Ref } from "react";
import { useShop } from "../shop-provider";

import { headerIcon } from "./header-icon";
import { useHydrated } from "./use-hydrated";
import { HeartIcon } from "./icons";

export const drawerId = "wishlist-drawer";
const heartClass = `${headerIcon} max-[701px]:hidden`;

/**
 * The header heart. Until the page is hydrated it is a plain link to /favourites, so it works
 * without script; afterwards it is a button that opens the wishlist drawer. It is a header icon,
 * hidden under 701 px (the mobile drawer links to saved furniture instead).
 */
export function WishlistTrigger({ open, onOpen, ref }: { open: boolean; onOpen: () => void; ref?: Ref<HTMLButtonElement> }) {
  const { favourites } = useShop();
  const hydrated = useHydrated();
  const count = favourites.length;
  const label = "Saved furniture (" + count + ")";
  const badge = count > 0 && (
    <span
      data-wishlist-count
      aria-hidden="true"
      className="absolute top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-brand px-[3px] text-center font-body text-[10px] leading-4 font-bold text-white"
    >
      {count}
    </span>
  );
  if (!hydrated)
    return (
      <a href="/favourites" data-wishlist-trigger className={heartClass} aria-label={label}>
        <HeartIcon />
        {badge}
      </a>
    );
  return (
    <button
      ref={ref}
      type="button"
      data-wishlist-trigger className={heartClass}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={drawerId}
      onClick={onOpen}
    >
      <HeartIcon />
      {badge}
    </button>
  );
}
