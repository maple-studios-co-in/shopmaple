"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, LifeBuoy, UserRound } from "lucide-react";
import { useShop } from "../shop-provider";
import { useHydrated } from "./use-hydrated";
import { headerIcon } from "./header-icon";

const menuId = "account-menu";
/** Hidden under 750 px, where the mobile drawer links to the account page. */
const accountClass = `${headerIcon} max-[750px]:hidden`;
const entry =
  "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-espresso no-underline transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand";
const entryIcon = "grid size-9 shrink-0 place-items-center rounded-full bg-cream text-brand [&>svg]:size-[18px]";

/**
 * The header account icon. Customer accounts do not exist yet (checkout is closed), so the menu
 * offers what works today: saved furniture, the Help Center and the account page that explains it.
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
        <UserRound />
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
        <UserRound />
      </button>
      {open && (
        <div
          ref={panel}
          id={menuId}
          data-store
          data-account-menu
          role="region"
          aria-labelledby="account-menu-title"
          className="absolute top-[calc(50%+28px)] right-6 z-40 w-[320px] rounded-xl border border-sand bg-white p-4 font-body text-espresso shadow-[0_12px_40px_rgb(41_37_31/0.16)] min-[1001px]:right-10"
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
        >
          <h2 id="account-menu-title" className="font-serif text-h4 font-bold">Account</h2>
          <p className="mt-1.5 mb-3 text-meta text-taupe">
            Customer accounts arrive with online checkout. Until then, saved furniture stays in this browser and our team looks after orders for you.
          </p>
          <ul className="grid gap-0.5 border-t border-sand pt-2">
            <li>
              <Link href="/favourites" className={entry}>
                <span className={entryIcon}><Heart aria-hidden="true" /></span>
                <span className="grid flex-1 gap-0.5">
                  <span className="text-ui font-bold">Saved furniture</span>
                  <span className="text-label text-taupe">The pieces you saved</span>
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
              <Link href="/pages/contact" className={entry}>
                <span className={entryIcon}><LifeBuoy aria-hidden="true" /></span>
                <span className="grid flex-1 gap-0.5">
                  <span className="text-ui font-bold">Help Center</span>
                  <span className="text-label text-taupe">Order help, delivery and returns</span>
                </span>
              </Link>
            </li>
          </ul>
          <Link
            href="/account"
            className="mt-2 flex items-center justify-between rounded-sm border border-sand px-3.5 py-2.5 text-ui font-bold text-brand no-underline transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            How accounts work today <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      )}
    </>
  );
}
