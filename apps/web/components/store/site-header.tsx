"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import type { SiteChrome } from "@shopmaple/contracts";
import { useShop } from "../shop-provider";
import dynamic from "next/dynamic";
import { AccountMenu } from "./account-menu";
import { WishlistTrigger } from "./wishlist-drawer";
import { DesktopNavigation } from "./site-navigation";

// Overlays load when first needed, keeping them out of every page's first-load JavaScript.
const SearchDialog = dynamic(() => import("../search-dialog").then((module) => module.SearchDialog));
const WishlistDrawer = dynamic(() => import("./wishlist-panel").then((module) => module.WishlistDrawer));
const MobileNavigation = dynamic(() => import("./mobile-navigation").then((module) => module.MobileNavigation));
import { headerIcon } from "./header-icon";
import { BagIcon, SearchIcon } from "./icons";
import { defaultSiteChrome } from "@/lib/site-chrome-defaults";

/*
 * The announcement bar and the main navigation ("MF / Announcement" and "MF / Main navigation" in
 * the "Maple / PDF Review / UI Components" frame): one linen row with the logo, the menu, a search
 * field and the account, saved and bag icons (spacing tightens under 1140 px, below the design's
 * 1173 px variant). From 750 to 1023 px the menu wraps onto a second row;
 * under 750 px (Tailwind's max-[750px] means `width < 750`) the drawer replaces it and search
 * becomes an icon. The design has no utility links, so the header no longer shows them.
 */
export function Header({
  siteChrome = defaultSiteChrome,
}: { siteChrome?: SiteChrome } = {}) {
  const { cart, setCartOpen } = useShop();
  const [search, setSearch] = useState(false),
    [wishlist, setWishlist] = useState(false),
    [mobile, setMobile] = useState(false),
    // Drawers mount on first use only: a lazily loaded component that renders at all is fetched during hydration.
    [wishlistOpened, setWishlistOpened] = useState(false),
    [mobileOpened, setMobileOpened] = useState(false);
  if (wishlist && !wishlistOpened) setWishlistOpened(true);
  if (mobile && !mobileOpened) setMobileOpened(true);
  const heart = useRef<HTMLButtonElement>(null);
  return (
    <>
      <a
        href="#main"
        data-store
        data-skip-link
        className="absolute -top-[100px] left-4 z-[100] bg-white p-3 font-body text-espresso focus:top-2"
      >
        Skip to content
      </a>
      {siteChrome.announcement.enabled && (
        <div
          data-store
          data-announcement
          className="flex items-start gap-x-[140px] bg-brand p-2.5 font-body text-label leading-[17px] text-white wrap-anywhere max-[1024px]:justify-center max-[1024px]:text-center"
        >
          <Link href={siteChrome.announcement.href} className="font-bold no-underline hover:underline hover:underline-offset-4 lg:w-[490px] lg:shrink-0">
            {siteChrome.announcement.text}
          </Link>
          <p data-announcement-detail className="whitespace-pre-wrap max-[1024px]:hidden">
            CRAFTED IN DELHI{"   "}·{"   "}DELIVERY ACROSS INDIA
          </p>
        </div>
      )}
      {/* `data-site-header` is the hook the stylesheet's base hides public scrollbars by. */}
      <header data-store data-site-header className="relative z-[35] bg-linen font-body text-espresso">
        <div
          data-header-main
          className="relative flex flex-wrap items-center gap-x-9 px-8 py-8 lg:flex-nowrap max-[1140px]:gap-x-6 max-[1140px]:px-6 max-[1024px]:gap-x-6 max-[1024px]:gap-y-3 max-[1024px]:py-5 max-[750px]:gap-x-1 max-[750px]:px-2 max-[750px]:py-2.5"
        >
          <button
            data-mobile-menu-button
            className="hidden size-11 items-center justify-center border-0 bg-transparent p-0 text-brand hover:text-brand-deep max-[750px]:inline-flex [&_svg]:size-[22px] [&_svg]:stroke-[1.4]"
            aria-label="Open navigation"
            aria-expanded={mobile}
            aria-controls="maple-mobile-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <Link
            href="/"
            data-brand
            className="block h-[72px] w-[170px] shrink-0 max-[1140px]:h-16 max-[1140px]:w-[150px] max-[1024px]:h-16 max-[1024px]:w-[150px] max-[750px]:h-[52px] max-[750px]:w-28"
            aria-label="Maple Furnishers home"
          >
            <Image
              src="/media/footer/maple-logo.webp"
              width={1080}
              height={500}
              sizes="170px"
              alt="Maple Furnishers"
              className="size-full object-contain"
              preload
            />
          </Link>
          <DesktopNavigation siteChrome={siteChrome} />
          <button
            type="button"
            data-header-search
            className="ml-auto flex w-[240px] shrink-0 items-center gap-3 rounded-full border-0 bg-cream p-3 text-left text-ui text-taupe transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[1140px]:w-[200px] max-[1024px]:w-[220px] max-[750px]:size-10 max-[750px]:justify-center max-[750px]:bg-transparent max-[750px]:p-0 max-[750px]:text-brand max-[750px]:hover:bg-transparent"
            aria-label="Search furniture"
            onClick={() => setSearch(true)}
          >
            <SearchIcon className="size-[18px] shrink-0 text-brand max-[750px]:size-5" />
            <span className="max-[750px]:hidden">Search furniture…</span>
          </button>
          <div
            data-header-actions
            className="relative flex items-center gap-[17px] max-[1024px]:gap-2 max-[750px]:gap-0"
          >
            <AccountMenu />
            <WishlistTrigger
              ref={heart}
              open={wishlist}
              onOpen={() => setWishlist(true)}
            />
            <button
              className={headerIcon}
              aria-label={"Open cart (" + cart.itemCount + " items)"}
              onClick={() => setCartOpen(true)}
            >
              <BagIcon />
              {cart.itemCount > 0 && (
                <span
                  data-cart-count
                  className="absolute top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-brand px-[3px] text-center text-[10px] leading-4 font-bold text-white"
                >
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {wishlistOpened && (
        <WishlistDrawer
          open={wishlist}
          onClose={() => setWishlist(false)}
          returnFocus={heart}
        />
      )}
      {mobileOpened && (
        <MobileNavigation
          siteChrome={siteChrome}
          open={mobile}
          onClose={() => setMobile(false)}
        />
      )}
    </>
  );
}
