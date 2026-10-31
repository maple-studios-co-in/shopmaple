"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { Search, ShoppingBag, Menu } from "lucide-react";
import type { SiteChrome } from "@shopmaple/contracts";
import { useShop } from "../shop-provider";
import { SearchDialog } from "../search-dialog";
import { AccountMenu } from "./account-menu";
import { WishlistDrawer, WishlistTrigger } from "./wishlist-drawer";
import { DesktopNavigation, MobileNavigation } from "./site-navigation";
import { headerIcon } from "./header-icon";
import { textLink } from "./current-look";
import { shopFile } from "@/lib/format";
import { defaultSiteChrome, chromeHref } from "@/lib/site-chrome-defaults";

/*
 * The announcement bar and the site header in the storefront's current look (paper, ink,
 * burgundy, Manrope), re-skinned onto utilities without visual change. Tailwind's max-[N] means
 * `width < N`: max-[750px] is the legacy `max-width: 749px`, max-[701px] is `700px`.
 */
export function Header({
  siteChrome = defaultSiteChrome,
}: { siteChrome?: SiteChrome } = {}) {
  const { cart, setCartOpen } = useShop();
  const [search, setSearch] = useState(false),
    [wishlist, setWishlist] = useState(false),
    [mobile, setMobile] = useState(false);
  const heart = useRef<HTMLButtonElement>(null);
  return (
    <>
      <a
        href="#main"
        data-store
        data-skip-link
        className={`absolute -top-[100px] left-4 z-[100] bg-white p-3 focus:top-2 ${textLink}`}
      >
        Skip to content
      </a>
      {siteChrome.announcement.enabled && (
        <div
          data-store
          data-announcement
          className="flex min-h-[42px] items-center justify-center bg-brand px-3 text-center text-[12px] text-white wrap-anywhere max-[768px]:min-h-8 max-[701px]:text-[10px]"
        >
          <Link href={siteChrome.announcement.href} className={textLink}>
            {siteChrome.announcement.text}
          </Link>
        </div>
      )}
      {/* `site-header` is kept as the hook storefront-interactions.css hides public scrollbars by. */}
      <header data-store data-site-header className="site-header bg-paper">
        <div
          data-header-main
          className="relative flex h-[108px] items-center justify-between border-b border-b-[#eae8e2] px-10 max-[1001px]:px-6 max-[750px]:h-[76px] max-[750px]:px-[14px]"
        >
          {siteChrome.utilityLinks.some((link) => link.enabled) && (
            <div
              data-utility-links
              className="flex max-w-[calc(50%-110px)] flex-wrap gap-x-7 gap-y-2 max-[1001px]:gap-x-[15px] max-[1001px]:text-[12px] max-[750px]:hidden"
            >
              {siteChrome.utilityLinks
                .filter((link) => link.enabled)
                .map((link) => (
                  <Link
                    key={link.id}
                    href={chromeHref(link)}
                    className={`font-manrope text-[15px] leading-6 font-medium ${textLink}`}
                  >
                    {link.label}
                  </Link>
                ))}
            </div>
          )}
          <button
            data-mobile-menu-button
            className="relative hidden h-10 w-8 items-center justify-center border-none border-current bg-transparent p-[5px] hover:text-brand max-[750px]:inline-flex max-[750px]:h-11 max-[750px]:w-10 [&_svg]:size-5 [&_svg]:stroke-[1.6]"
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
            className={`absolute top-1 left-1/2 h-[100px] w-[200px] [transform:translateX(-50%)] max-[750px]:left-[43%] max-[750px]:h-16 max-[750px]:w-28 max-[701px]:top-1.5 ${textLink}`}
            aria-label="Maple Furnishers home"
          >
            <Image
              src={shopFile("Cover_Image_Maple_1.png?v=1752647999")}
              width={200}
              height={100}
              alt="Maple Furnishers"
              className="size-full object-contain"
              preload
            />
          </Link>
          <div
            data-header-actions
            className="ml-auto flex items-center gap-2.5 max-[1001px]:gap-1 max-[750px]:gap-0"
          >
            <button
              className={headerIcon}
              aria-label="Search furniture"
              onClick={() => setSearch(true)}
            >
              <Search />
            </button>
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
              <ShoppingBag />
              {cart.itemCount > 0 && (
                <span
                  data-cart-count
                  className="absolute top-0 -right-[3px] h-4 min-w-4 rounded-[50%] bg-brand text-center text-[10px] leading-4 text-white"
                >
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
        <DesktopNavigation siteChrome={siteChrome} />
      </header>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      <WishlistDrawer
        open={wishlist}
        onClose={() => setWishlist(false)}
        returnFocus={heart}
      />
      <MobileNavigation
        siteChrome={siteChrome}
        open={mobile}
        onClose={() => setMobile(false)}
      />
    </>
  );
}
