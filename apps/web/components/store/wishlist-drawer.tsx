"use client";
import { useEffect, useRef, useState, type Ref, type RefObject } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShop } from "../shop-provider";
import { Favourites, primaryButton } from "./favourites";
import { HeartIcon } from "./icons";
import { headerIcon } from "./header-icon";
import { useHydrated } from "./use-hydrated";

const drawerId = "wishlist-drawer";
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
      className="absolute top-0 -right-[3px] h-4 min-w-4 rounded-full bg-brand px-[3px] text-center font-body text-[10px] leading-4 font-bold text-white"
    >
      {count}
    </span>
  );
  if (!hydrated)
    return (
      <a href="/favourites" data-wishlist-trigger className={heartClass} aria-label={label}>
        <Heart />
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
      <Heart />
      {badge}
    </button>
  );
}

/** "My Wishlist": a left-side drawer listing the saved furniture, with a link to the full page. */
export function WishlistDrawer({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const { favourites } = useShop();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // The saved pieces load the first time the drawer opens, then stay resolved between openings.
  const [visited, setVisited] = useState(false);
  if (open && !visited) setVisited(true);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      wasOpen.current = true;
      if (!element.open) element.showModal();
      close.current?.focus();
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    if (element.open) element.close();
    if (wasOpen.current) {
      wasOpen.current = false;
      returnFocus.current?.focus();
    }
  }, [open, returnFocus]);
  const count = favourites.length;
  return (
    <dialog
      ref={dialog}
      id={drawerId}
      data-store
      data-wishlist-drawer
      aria-labelledby="wishlist-drawer-title"
      className="m-0 mr-auto h-dvh max-h-none w-[min(400px,100vw-32px)] max-w-none overscroll-contain border-0 bg-linen p-0 font-body text-espresso shadow-[8px_0_32px_rgb(41_37_31/0.18)] backdrop:bg-espresso/40"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2.5 border-b border-sand bg-white px-5 py-4">
          <HeartIcon filled className="size-5 shrink-0 text-brand" />
          <h2 id="wishlist-drawer-title" className="font-serif text-h4 font-bold">
            My Wishlist <span className="font-body text-ui font-normal text-taupe">({count})</span>
          </h2>
          <button
            ref={close}
            type="button"
            aria-label="Close wishlist"
            onClick={onClose}
            className="ml-auto grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-espresso transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {visited && <Favourites variant="drawer" onNavigate={onClose} />}
        </div>
        {count > 0 && (
          <div className="border-t border-sand bg-white p-5">
            <Link data-wishlist-view href="/favourites" onClick={onClose} className={cn(primaryButton, "w-full")}>
              View Wishlist
            </Link>
          </div>
        )}
      </div>
    </dialog>
  );
}
