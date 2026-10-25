"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Search, UserRound, Heart, ShoppingBag, Menu } from "lucide-react";
import { useShop } from "./shop-provider";
import { Modal } from "./modal";
import { shopFile } from "@/lib/format";
import { DesktopNavigation, MobileNavigation } from "./navigation";
export function Header() {
  const { cart, setCartOpen, favourites } = useShop();
  const [search, setSearch] = useState(false),
    [account, setAccount] = useState(false),
    [mobile, setMobile] = useState(false);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="announcement">
        <Link href="/collections/all">LUXURY FURNITURE. FACTORY PRICES.</Link>
      </div>
      <header className="site-header">
        <div className="header-main">
          <div className="utility-links">
            <a href="/pages/our-story">Our Story</a>
            <Link href="/pages/bulk-enquiry">Bulk Enquiry</Link>
            <Link href="/pages/contact">Help Center</Link>
          </div>
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
            <Link
              className="icon-button favourite-link"
              href="/favourites"
              aria-label={"Saved furniture (" + favourites.length + ")"}
            >
              <Heart />
              {favourites.length > 0 && (
                <span className="count">{favourites.length}</span>
              )}
            </Link>
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
        <DesktopNavigation />
      </header>
      <Modal
        open={search}
        onClose={() => setSearch(false)}
        title="Find your next piece"
      >
        <form action="/collections/all" className="search-form">
          <label className="sr-only" htmlFor="site-search">
            Search furniture
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder="Search sofas, chairs, beds…"
            maxLength={80}
            autoFocus
            required
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>
      </Modal>
      <Modal
        open={account}
        onClose={() => setAccount(false)}
        title="Your Maple account"
      >
        <p>
          Existing orders and account details are still available in our current
          shop while we prepare the new experience.
        </p>
        <a className="button" href="https://shop.maplefurnishers.com/account">
          Open existing account
        </a>
      </Modal>
      <MobileNavigation open={mobile} onClose={() => setMobile(false)} />
    </>
  );
}
