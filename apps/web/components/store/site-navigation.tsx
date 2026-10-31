"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react";
import type { ChromeNavigationLink, SiteChrome } from "@shopmaple/contracts";
import { defaultSiteChrome, chromeHref } from "@/lib/site-chrome-defaults";
import products from "@/data/navigation-products.json";
import { shopMoney } from "@/lib/format";
import { recentProduct } from "@/lib/search-products";
import type { ProductCardModel } from "@/lib/product-card-model";
import dynamic from "next/dynamic";

// The dropdown panel loads the first time a menu opens.
const MegaPanel = dynamic(() => import("./mega-panel").then((module) => module.MegaPanel));
import { textLink } from "./current-look";

/*
 * The desktop navigation bar and the mobile navigation drawer in the storefront's current look,
 * re-skinned onto utilities without visual change (the desktop panel is MegaPanel). Tailwind's
 * max-[N] means `width < N`: max-[750px] is the legacy `max-width: 749px`.
 */
/** The ink focus ring the navigation uses instead of the global burgundy one. */
export const focusInk = "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink";
/** The drawer's main entries: a category button or a plain link. */
export const drawerEntry =
  "flex min-h-[50px] cursor-pointer items-center justify-between border-none border-current bg-transparent px-0 py-[7px] text-left font-redhat text-[28px] leading-[1.2] font-bold text-[#555]";
export function DesktopNavigation({
  siteChrome = defaultSiteChrome,
}: { siteChrome?: SiteChrome } = {}) {
  const navigation = siteChrome.navigation.filter((item) => item.enabled);
  const [active, setActive] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const group = navigation.find(
    (item) =>
      item.id === active &&
      item.columns.some((column) => column.links.some((link) => link.enabled)),
  );
  useEffect(() => {
    if (active && !group) {
      setActive(null);
      requestAnimationFrame(() => {
        const target =
          nav.current?.querySelector<HTMLElement>("button, a") ??
          document.querySelector<HTMLElement>("[data-header-main] a");
        target?.focus();
      });
    }
  }, [active, group]);
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [active]);
  if (navigation.length === 0) return null;
  return (
    <nav
      ref={nav}
      data-desktop-nav
      className="relative z-[35] flex h-[50px] items-center justify-center gap-8 border-b border-b-rule font-redhat text-[16px] leading-[1.5] font-bold max-[750px]:hidden"
      aria-label="Main navigation"
      onPointerLeave={(event) => {
        if (
          event.pointerType === "mouse" &&
          !event.currentTarget
            .querySelector("[data-mega]")
            ?.contains(document.activeElement)
        ) {
          setActive(null);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && active) {
          event.preventDefault();
          triggers.current.get(active)?.focus();
          setActive(null);
        }
      }}
    >
      {navigation.map((item) =>
        item.columns.some((column) =>
          column.links.some((link) => link.enabled),
        ) ? (
          <div key={item.id} className="flex h-full items-stretch">
            <button
              ref={(element) => {
                if (element) triggers.current.set(item.id, element);
              }}
              id={`maple-trigger-${item.id}`}
              data-menu-trigger
              className={`relative cursor-pointer border-none border-current bg-transparent p-0 wrap-anywhere hover:text-[#555] aria-expanded:text-brand aria-expanded:after:absolute aria-expanded:after:inset-x-0 aria-expanded:after:bottom-1.5 aria-expanded:after:h-0.5 aria-expanded:after:bg-brand aria-expanded:after:content-[''] ${focusInk}`}
              aria-expanded={active === item.id}
              aria-controls={`maple-panel-${item.id}`}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setActive(item.id);
              }}
              onClick={(event) =>
                setActive(
                  event.detail === 0 && active === item.id ? null : item.id,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive(item.id);
                  requestAnimationFrame(() =>
                    nav.current
                      ?.querySelector<HTMLAnchorElement>("[data-mega] a")
                      ?.focus(),
                  );
                }
              }}
            >
              {item.label}
            </button>
            {active === item.id && group && (
              <MegaPanel item={group} siteChrome={siteChrome} onNavigate={() => setActive(null)} />
            )}
          </div>
        ) : (
          <Link
            key={item.id}
            href={item.href}
            className={`flex h-full items-center hover:text-[#555] ${textLink} ${focusInk}`}
            onPointerEnter={() => setActive(null)}
            onFocus={() => setActive(null)}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
