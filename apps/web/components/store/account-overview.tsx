"use client";
import Link from "next/link";
import { ArrowRight, Heart, MessageCircle, UserRound } from "lucide-react";
import { useShop } from "../shop-provider";

const card =
  "group flex h-full flex-col gap-3 rounded-xl border border-sand bg-white p-5 text-espresso no-underline transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const cardIcon = "grid size-11 place-items-center rounded-full bg-cream text-brand [&>svg]:size-5";
const cardLink = "mt-auto inline-flex items-center gap-1.5 pt-1 text-ui font-bold text-brand";

/** The /account page. There is no customer sign-in yet, so it says so and points to what works today. */
export function AccountOverview() {
  const { favourites } = useShop();
  return (
    <section data-store data-account-page aria-labelledby="account-title" className="bg-linen font-body text-espresso">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-10 md:px-8 md:py-16">
        <p className="text-label font-bold tracking-[0.08em] text-brand uppercase">My account</p>
        <h1 id="account-title" className="mt-2 font-serif text-title font-bold md:text-h1">Account</h1>
        <div className="mt-5 flex max-w-[720px] gap-3 rounded-xl bg-cream p-5">
          <UserRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p className="text-card text-espresso">
            Customer accounts arrive with online checkout. Until then there is no sign-in on this storefront: your saved
            furniture stays in this browser, and our team looks after orders and delivery details directly.
          </p>
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          <li>
            <Link href="/favourites" className={card}>
              <span className="flex items-center justify-between">
                <span className={cardIcon}><Heart aria-hidden="true" /></span>
                <span data-account-saved-count className="grid h-7 min-w-7 place-items-center rounded-full bg-cream px-2 text-meta font-bold text-brand">
                  {favourites.length}
                </span>
              </span>
              <span className="text-subhead font-bold">Saved furniture</span>
              <span className="text-ui text-taupe">The pieces you saved on this device.</span>
              <span className={cardLink}>View saved furniture <ArrowRight aria-hidden="true" className="size-4" /></span>
            </Link>
          </li>
          <li>
            <Link href="/pages/contact?product=Order%20support" className={card}>
              <span className={cardIcon}><MessageCircle aria-hidden="true" /></span>
              <span className="text-subhead font-bold">Help with an order</span>
              <span className="text-ui text-taupe">Ask about an order, its delivery or a return.</span>
              <span className={cardLink}>Contact our team <ArrowRight aria-hidden="true" className="size-4" /></span>
            </Link>
          </li>
          <li>
            <Link href="/pages/contact?product=Account%20support" className={card}>
              <span className={cardIcon}><UserRound aria-hidden="true" /></span>
              <span className="text-subhead font-bold">Update your details</span>
              <span className="text-ui text-taupe">Tell us about a new phone number, email or delivery address.</span>
              <span className={cardLink}>Contact our team <ArrowRight aria-hidden="true" className="size-4" /></span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
