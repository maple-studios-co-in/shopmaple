"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShop } from "../shop-provider";
import { useHydrated } from "./use-hydrated";
import { headerIcon } from "./header-icon";
import { AccountIcon, HeartIcon } from "./icons";

const menuId = "account-menu";
/** Hidden under 750 px, where the mobile drawer links to the account page. */
const accountClass = `${headerIcon} max-[750px]:hidden`;
/** An "Account menu" entry: a 20 px burgundy line icon, a 16 px bold name and a 12 px taupe line. */
const entry =
  "flex items-start gap-3 text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-brand";
const entryName = "text-price font-bold";
const entryNote = "text-label text-taupe";

/**
 * The header account icon and the "Account menu" dropdown from "Maple / PDF Review": a 340 px white
 * panel with a sand border under the header icons, 28 px in from their right edge as in the frame. Customer accounts do not exist yet (checkout is
 * closed), so instead of the frame's sign-in, orders, profile, addresses and log-out it says so and
 * offers what works today: the wishlist, the Help Center and the account page that explains it.
 * Until hydration it is a plain link to /account.
 */
export function AccountMenu() {
  const { favourites } = useShop();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node) || (!panel.current?.contains(target) && !button.current?.contains(target));
    const pointer = (event: Event) => {
      if (outside(event.target)) setOpen(false);
    };
    const focus = (event: FocusEvent) => {
      if (outside(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!hydrated)
    return (
      <a href="/account" data-account-button className={accountClass} aria-label="Your account">
        <AccountIcon />
      </a>
    );
  return (
    <>
      <button
        ref={button}
        type="button"
        data-account-button className={accountClass}
        aria-label="Your account"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <AccountIcon />
      </button>
      {open && (
        <div
          ref={panel}
          id={menuId}
          data-store
          data-account-menu
          role="region"
          aria-labelledby="account-menu-title"
          className="absolute top-[calc(100%+5px)] right-7 z-40 flex w-[340px] flex-col gap-[18px] rounded-xl border border-sand bg-white p-6 font-body text-espresso"
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
        >
          <h2 id="account-menu-title" className="font-serif text-h3 font-bold">Your account</h2>
          <p data-account-note className="text-meta text-taupe">
            Sign-in arrives with online checkout. Until then, saved furniture stays in this browser and our team looks after orders for you.
          </p>
          <ul className="flex flex-col gap-[18px]">
            <li>
              <Link href="/favourites" data-account-entry className={entry}>
                <HeartIcon />
                <span className="grid flex-1 gap-0.5">
                  <span data-account-entry-title className={entryName}>Wishlist</span>
                  <span className={entryNote}>Return to saved pieces</span>
                </span>
                <span
                  data-account-saved-count
                  className="grid h-6 min-w-6 place-items-center rounded-full bg-cream px-1.5 text-label font-bold text-brand"
                >
                  {favourites.length}
                </span>
              </Link>
            </li>
            <li>
              <Link href="/pages/contact" data-account-entry className={entry}>
                <AccountIcon />
                <span className="grid flex-1 gap-0.5">
                  <span data-account-entry-title className={entryName}>Help Center</span>
                  <span className={entryNote}>Order help, delivery and returns</span>
                </span>
              </Link>
            </li>
          </ul>
          <Link
            href="/account"
            data-account-more
            className="text-meta text-brand no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            How accounts work today
          </Link>
        </div>
      )}
    </>
  );
}
