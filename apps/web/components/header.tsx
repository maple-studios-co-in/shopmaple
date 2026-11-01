"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Search, UserRound, Heart, ShoppingBag, Menu } from "lucide-react";
import { useShop } from "./shop-provider";
import { Modal } from "./modal";
import { SearchDialog } from "./search-dialog";
import dynamic from "next/dynamic";
import { shopFile } from "@/lib/format";
import { DesktopNavigation, MobileNavigation } from "./navigation";
import type { SiteChrome } from "@shopmaple/contracts";

// The wishlist list (with its product cards) loads on demand, keeping cards out of every page's first-load JavaScript.
const Favourites = dynamic(() => import("./favourites").then((module) => module.Favourites));
import { defaultSiteChrome, chromeHref } from "@/lib/site-chrome-defaults";
export function Header({
  siteChrome = defaultSiteChrome,
}: { siteChrome?: SiteChrome } = {}) {
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
      <header className="site-header">
        <div className="header-main">
          {siteChrome.utilityLinks.some((link) => link.enabled) && (
            <div className="utility-links">
              {siteChrome.utilityLinks
                .filter((link) => link.enabled)
                .map((link) => (
                  <Link key={link.id} href={chromeHref(link)}>
                    {link.label}
                  </Link>
                ))}
            </div>
          )}
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
            <Image
              src={shopFile("Cover_Image_Maple_1.png?v=1752647999")}
              width={200}
              height={100}
              alt="Maple Furnishers"
              preload
            />
          </Link>
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
        <DesktopNavigation siteChrome={siteChrome} />
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
