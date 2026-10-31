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

// The dropdown panel loads the first time a menu opens (or a trigger gets focus).
const loadPanel = () => import("./mega-panel");
const MegaPanel = dynamic(() => loadPanel().then((module) => module.MegaPanel));
const preloadPanel = () => { void loadPanel(); };

/*
 * The desktop menu ("Shop navigation" in "MF / Main navigation"): 14 px bold Barlow entries in the
 * header row, wrapping onto their own row from 750 to 1023 px. It stretches to the row's edges so
 * the pointer can travel from a trigger straight into its panel (MegaPanel), which spans the header
 * row below it. The mobile drawer keeps the storefront's current look. Tailwind's max-[N] means
 * `width < N`: max-[750px] is the legacy `max-width: 749px`.
 */
/** A desktop menu entry's focus ring. */
const focusBrand = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";
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
      className="flex min-w-0 flex-wrap items-stretch gap-x-[25px] self-stretch text-ui font-bold text-espresso lg:-my-8 lg:flex-[0_1_650px] max-[1140px]:gap-x-5 max-[1024px]:order-last max-[1024px]:-mb-5 max-[1024px]:h-12 max-[1024px]:basis-full max-[1024px]:justify-center max-[1024px]:border-t max-[1024px]:border-sand max-[750px]:hidden"
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
              className={`relative cursor-pointer border-none border-current bg-transparent p-0 wrap-anywhere hover:text-brand aria-expanded:text-brand aria-expanded:after:absolute aria-expanded:after:inset-x-0 aria-expanded:after:bottom-[calc(50%-16px)] aria-expanded:after:h-0.5 aria-expanded:after:bg-brand aria-expanded:after:content-[''] ${focusBrand}`}
              aria-expanded={active === item.id}
              aria-controls={`maple-panel-${item.id}`}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setActive(item.id);
              }}
              onFocus={preloadPanel}
              onClick={(event) =>
                setActive(
                  event.detail === 0 && active === item.id ? null : item.id,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive(item.id);
                  // The panel's code may still be loading on first use: keep looking for its first link for a moment.
                  let frames = 0;
                  const focusFirst = () => {
                    const link = nav.current?.querySelector<HTMLAnchorElement>("[data-mega] a");
                    if (link) link.focus();
                    else if (++frames < 120) requestAnimationFrame(focusFirst);
                  };
                  requestAnimationFrame(focusFirst);
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
            className={`flex items-center text-espresso no-underline hover:text-brand ${focusBrand}`}
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
