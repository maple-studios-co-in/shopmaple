"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Search, UserRound, Heart, ShoppingBag, Menu } from "lucide-react";
import { useShop } from "./shop-provider";
import { Modal } from "./modal";
import { SearchDialog } from "./search-dialog";
import dynamic from "next/dynamic";
import { DesktopNavigation, MobileNavigation } from "./navigation";
import type { SiteChrome } from "@shopmaple/contracts";

// The wishlist list (with its product cards) loads on demand, keeping cards out of every page's first-load JavaScript.
const Favourites = dynamic(() => import("./favourites").then((module) => module.Favourites));
import { defaultSiteChrome } from "@/lib/site-chrome-defaults";
export function Header({
  siteChrome = defaultSiteChrome,
  sticky = false,
}: { siteChrome?: SiteChrome; /** Pinned to the top while the page scrolls (product pages; owner, 10 Nov 2026). */ sticky?: boolean } = {}) {
  const { cart, setCartOpen, favourites } = useShop();
  const [search, setSearch] = useState(false),
    [account, setAccount] = useState(false),
    [wishlist, setWishlist] = useState(false),
    [mobile, setMobile] = useState(false);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {siteChrome.announcement.enabled && (
        <div className="announcement">
          <Link href={siteChrome.announcement.href}>
            {siteChrome.announcement.text}
          </Link>
        </div>
      )}
      {/* One row (Figma 256:3836): the logo, the menu and the shopping actions; Our Story, Bulk Enquiry and Help Center
          are in the footer and, on a phone, in the menu. */}
      <header className="site-header" data-sticky={sticky ? "" : undefined}>
        <div className="header-main">
          <button
            className="icon-button mobile-menu-button"
            aria-label="Open navigation"
            aria-expanded={mobile}
            aria-controls="maple-mobile-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <Link href="/" className="brand" aria-label="Maple Furnishers home">
            {/* The logo artwork as a ready-made file: it skips the image resizer, so it paints with the page. */}
            <Image
              src="/media/footer/maple-logo.webp"
              width={1080}
              height={500}
              alt="Maple Furnishers"
              unoptimized
              preload
            />
          </Link>
          <DesktopNavigation siteChrome={siteChrome} />
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search furniture"
              onClick={() => setSearch(true)}
            >
              <Search />
            </button>
            <button
              className="icon-button account-button"
              aria-label="Your account"
              onClick={() => setAccount(true)}
            >
              <UserRound />
            </button>
            <button
              className="icon-button favourite-link"
              onClick={() => setWishlist(true)}
              aria-label={"Saved furniture (" + favourites.length + ")"}
            >
              <Heart />
              {favourites.length > 0 && (
                <span className="count">{favourites.length}</span>
              )}
            </button>
            <button
              className="icon-button"
              aria-label={"Open cart (" + cart.itemCount + " items)"}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag />
              {cart.itemCount > 0 && (
                <span className="count">{cart.itemCount}</span>
              )}
            </button>
          </div>
        </div>
      </header>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      <Modal
        open={account}
        onClose={() => setAccount(false)}
        title="Your Maple account"
      >
        <p>Online sign-in and order history are not available here yet.</p>
        <nav className="account-actions" aria-label="Account support">
          <Link href="/account" onClick={() => setAccount(false)}>
            Account <span>Orders, profile and addresses →</span>
          </Link>
          <Link href="/favourites" onClick={() => setAccount(false)}>
            Wishlist <span>View your saved items →</span>
          </Link>
          <Link
            href="/pages/contact?product=Order%20support"
            onClick={() => setAccount(false)}
          >
            Help Center <span>Contact support →</span>
          </Link>
        </nav>
      </Modal>
      <Modal
        open={wishlist}
        onClose={() => setWishlist(false)}
        title="My Wishlist"
        drawer
        side="left"
      >
        <Favourites onNavigate={() => setWishlist(false)} compact />
      </Modal>
      <MobileNavigation
        siteChrome={siteChrome}
        open={mobile}
        onClose={() => setMobile(false)}
      />
    </>
  );
}
