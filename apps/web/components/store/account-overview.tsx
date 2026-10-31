"use client";
import Link from "next/link";
import { useShop } from "../shop-provider";
import { AccountIcon, HeartIcon } from "./icons";
import { eyebrow } from "./section-heading";
import { useHydrated } from "./use-hydrated";

/** An entry card in the "Account menu" dropdown's language: white, sand border, 12 px corners. */
const card =
  "flex h-full items-start gap-3 rounded-xl border border-sand bg-white p-6 text-espresso no-underline transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-brand";
const cardName = "text-price font-bold";
const cardNote = "text-ui text-taupe";
const cardLink = "mt-2 text-meta font-bold text-brand";

/**
 * The /account page, built from the "Account menu" frame. There is no customer sign-in yet, so it says
 * so and lists what works today: the wishlist and two requests our team handles directly.
 */
export function AccountOverview() {
  const { favourites } = useShop();
  // The saved list lives in this browser, so the server has no count to show.
  const hydrated = useHydrated();
  return (
    <section data-store data-account-page aria-labelledby="account-title" className="bg-linen font-body text-espresso">
      <div className="mx-auto w-full max-w-[1100px] px-8 py-16 max-[750px]:px-4 max-[750px]:py-10">
        <div className="flex flex-col gap-6 max-[750px]:gap-3">
          <p className={eyebrow}>My account</p>
          <h1 id="account-title" className="font-serif text-display font-bold max-[750px]:text-h2">Your account</h1>
        </div>
        <p data-account-note className="mt-5 max-w-[640px] text-card text-taupe">
          Sign-in arrives with online checkout. Until then there is no customer account on this storefront: your saved
          furniture stays in this browser, and our team looks after orders and delivery details directly.
        </p>
        <ul className="mt-10 grid grid-cols-3 gap-4 max-[1024px]:grid-cols-1 max-[750px]:mt-8">
          <li>
            <Link href="/favourites" data-account-entry className={card}>
              <HeartIcon />
              <span className="grid flex-1 gap-1">
                <span className="flex items-center justify-between gap-3">
                  <span data-account-entry-title className={cardName}>Wishlist</span>
                  <span data-account-saved-count className="grid h-6 min-w-6 place-items-center rounded-full bg-cream px-1.5 text-label font-bold text-brand empty:hidden">
                    {hydrated ? favourites.length : null}
                  </span>
                </span>
                <span className={cardNote}>Return to the pieces you saved on this device.</span>
                <span className={cardLink}>View wishlist →</span>
              </span>
            </Link>
          </li>
          <li>
            <Link href="/pages/contact?product=Order%20support" data-account-entry className={card}>
              <AccountIcon />
              <span className="grid flex-1 gap-1">
                <span data-account-entry-title className={cardName}>Help with an order</span>
                <span className={cardNote}>Ask about an order, its delivery or a return.</span>
                <span className={cardLink}>Contact our team →</span>
              </span>
            </Link>
          </li>
          <li>
            <Link href="/pages/contact?product=Account%20support" data-account-entry className={card}>
              <AccountIcon />
              <span className="grid flex-1 gap-1">
                <span data-account-entry-title className={cardName}>Update your details</span>
                <span className={cardNote}>Tell us about a new phone number, email or delivery address.</span>
                <span className={cardLink}>Contact our team →</span>
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
