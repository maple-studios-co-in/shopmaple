"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { cx } from "@/lib/cx";
import { useShop } from "../shop-provider";
import { primaryButton } from "./wishlist-styles";
import { drawerId } from "./wishlist-drawer";

// The saved-pieces list (with its product cards) loads on demand, keeping cards out of every page's first-load JavaScript.
const Favourites = dynamic(() => import("./favourites").then((module) => module.Favourites));

/**
 * "My wishlist": the "Wishlist empty" / "Wishlist with items" drawer from "Maple / PDF Review". A linen
 * panel floating 20 px from the top-left corner (16 px under 750 px), 420 px wide while empty and 460 px
 * with saved pieces, over a 32% black scrim. It scrolls as a whole when the list outgrows the screen.
 */
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
      data-wishlist-state={count ? "saved" : "empty"}
      aria-labelledby="wishlist-drawer-title"
      className={cx(
        "m-5 h-fit max-h-[calc(100dvh-40px)] max-w-[calc(100vw-40px)] overflow-y-auto overscroll-contain rounded-xl border-0 bg-linen p-8 font-body text-espresso backdrop:bg-black/32 max-[750px]:m-4 max-[750px]:max-h-[calc(100dvh-32px)] max-[750px]:max-w-[calc(100vw-32px)] max-[750px]:p-6",
        count ? "w-[460px]" : "w-[420px]",
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
          if (!inside) onClose();
        }
      }}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="wishlist-drawer-title" className="font-serif text-[24px]/[1.1] font-bold">
            My wishlist{count ? ` (${count})` : ""}
          </h2>
          <button
            ref={close}
            type="button"
            aria-label="Close wishlist"
            onClick={onClose}
            className="-my-2 -mr-2.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-espresso transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          >
            <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
          </button>
        </div>
        {visited && <Favourites variant="drawer" onNavigate={onClose} />}
        {count > 0 && (
          <>
            <Link data-wishlist-view href="/favourites" onClick={onClose} className={cx(primaryButton, "w-full")}>
              View wishlist →
            </Link>
            <p className="text-meta text-taupe">Keep all your favourites together.</p>
          </>
        )}
      </div>
    </dialog>
  );
}
