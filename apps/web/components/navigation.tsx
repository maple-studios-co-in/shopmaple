"use client";
import Link from "next/link";
import { ContentImage as Image } from "@/components/content-image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, X } from "lucide-react";
import type { ChromeNavigationLink, SiteChrome } from "@shopmaple/contracts";
import { defaultSiteChrome, chromeHref } from "../lib/site-chrome-defaults";
import products from "../data/navigation-products.json";
import { shopMoney } from "../lib/format";
import { recentProduct } from "../lib/search-products";
import type { ProductCardModel } from "../lib/product-card-model";

/** The room's card at the start of its mega menu (Figma 256:3836). */
const megaFeatures = {
  living: {
    heading: "Designed for every moment.",
    body: "Timeless silhouettes, premium materials and comfort that feels like home.",
    // A furnished room, as in the design, rather than a piece on its own.
    image: "/media/home/category-sofas.webp",
    alt: "A living room with a cream sofa, a wooden coffee table and plants",
  },
  bedroom: {
    heading: "Rest, beautifully made.",
    body: "Beds and bedside pieces made for calm, unhurried rooms.",
    image: "/media/home/category-beds.webp",
    alt: "A bedroom with an upholstered green bed and wooden bedside tables",
  },
} as const;
/** The photo beside each discovery link, by the link's id; a link the admin adds without one is shown as words alone. */
const discoveryImages: Record<string, string> = {
  new: "/media/home/hero-sofas.webp",
  bestsellers: "/media/home/editorial-flip-runo.webp",
  look: "/media/home/strip-always-together.webp",
};
const iconPaths = {
  sofa: "M4 11V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V11M3 11.5A1.5 1.5 0 0 1 4.5 10h0A1.5 1.5 0 0 1 6 11.5V13h12v-1.5a1.5 1.5 0 0 1 3 0V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM5 17v2M19 17v2",
  chair: "M7 10V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V10M5 12.5A1.5 1.5 0 0 1 6.5 11h11a1.5 1.5 0 0 1 1.5 1.5V15H5zM6.5 15l-.5 5M17.5 15l.5 5",
  table: "M3 7h18M5 7l-1 13M19 7l1 13M7 7v4h10V7",
  tv: "M3 6h18v11H3zM8 20h8M12 17v3M9.5 9.5l2 2 3-3",
  bed: "M3 18V8M3 14h18v4M21 18v-3a3 3 0 0 0-3-3h-7v2M6.5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
  measure: "M4 9.5C4 7 7.6 5 12 5s8 2 8 4.5v5C20 17 16.4 19 12 19s-8-2-8-4.5zM4 9.5C4 12 7.6 14 12 14s8-2 8-4.5M12 14v-2.5M8.5 13.5v-2M15.5 13.5v-2",
} as const;
/** A thin line icon in the brand's colour, as the frame draws beside each column's name. */
function MenuIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" data-menu-icon={name}>
      <path d={iconPaths[name]} />
    </svg>
  );
}
const columnIcon = (label: string): keyof typeof iconPaths | null =>
  /sofa/i.test(label) ? "sofa" : /chair/i.test(label) ? "chair" : /table/i.test(label) ? "table" : /tv|media/i.test(label) ? "tv" : /bed|size/i.test(label) ? "bed" : null;
function CategoryLink({
  item,
  onNavigate,
}: {
  item: ChromeNavigationLink;
  onNavigate?: () => void;
}) {
  const href = chromeHref(item);
  // The page you are on stays marked in red in the menu.
  const current = usePathname() === href.split(/[?#]/)[0];
  const icon = item.parent ? columnIcon(item.label) : null;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={item.parent ? "maple-menu-parent" : "maple-menu-link"}
      aria-current={current ? "page" : undefined}
    >
      {icon && <MenuIcon name={icon} />}
      {item.label}
    </Link>
  );
}
export function DesktopNavigation({
  siteChrome = defaultSiteChrome,
}: { siteChrome?: SiteChrome } = {}) {
  const navigation = siteChrome.navigation.filter((item) => item.enabled);
  const [active, setActive] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const pathname = usePathname();
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
          document.querySelector<HTMLElement>(".header-main a");
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
      className="desktop-nav maple-desktop-nav"
      aria-label="Main navigation"
      onPointerLeave={(event) => {
        if (
          event.pointerType === "mouse" &&
          !event.currentTarget
            .querySelector(".maple-mega")
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
          <div key={item.id} className="maple-menu-trigger-wrap">
            <button
              ref={(element) => {
                if (element) triggers.current.set(item.id, element);
              }}
              id={`maple-trigger-${item.id}`}
              className="maple-menu-trigger"
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
                      ?.querySelector<HTMLAnchorElement>(".maple-mega a")
                      ?.focus(),
                  );
                }
              }}
            >
              {item.label}
              <ChevronDown aria-hidden="true" size={14} strokeWidth={2} data-menu-chevron />
            </button>
            {active === item.id && (
              <div
                id={`maple-panel-${item.id}`}
                className="maple-mega"
                aria-labelledby={`maple-trigger-${item.id}`}
              >
                {item.feature !== "none" && (
                  <div className="maple-mega-feature">
                    <Image
                      src={megaFeatures[item.feature].image}
                      alt={megaFeatures[item.feature].alt}
                      width={320}
                      height={330}
                      sizes="240px"
                    />
                    <span data-mega-room>{item.label}</span>
                    <h2>{megaFeatures[item.feature].heading}</h2>
                    <p>{megaFeatures[item.feature].body}</p>
                    <Link href={item.href} onClick={() => setActive(null)}>
                      Explore {item.label} <ArrowRight aria-hidden="true" size={14} />
                    </Link>
                  </div>
                )}
                <div className="maple-mega-grid">
                  {group?.columns
                    .filter((column) =>
                      column.links.some((link) => link.enabled),
                    )
                    .map((column, columnIndex) => (
                      <div className="maple-mega-column" key={column.id}>
                        {column.links
                          .filter((link) => link.enabled)
                          .map((link) => (
                            <CategoryLink
                              key={link.id}
                              item={link}
                              onNavigate={() => setActive(null)}
                            />
                          ))}
                        {columnIndex === 0 && (
                          <Link
                            className="maple-mega-custom"
                            data-mega-custom
                            href={`/contact?${new URLSearchParams({ product: "Custom size" })}`}
                            onClick={() => setActive(null)}
                          >
                            <MenuIcon name="measure" />
                            <strong>Need a custom size?</strong>
                            <span>We’ll build it around your space.</span>
                            <em>
                              Start Customizing <ArrowRight aria-hidden="true" size={13} />
                            </em>
                          </Link>
                        )}
                      </div>
                    ))}
                </div>
                {siteChrome.desktopDiscovery.some((link) => link.enabled) && (
                  <div className="maple-mega-discovery">
                    {siteChrome.desktopDiscovery
                      .filter((link) => link.enabled)
                      .map((link) => (
                        <Link
                          key={link.id}
                          href={chromeHref(link)}
                          aria-label={
                            link.enquirySubject === "Custom furniture" &&
                            (link.label === "Fully Customizable" ||
                              link.label === "Custom furniture")
                              ? "Enquire about custom furniture"
                              : undefined
                          }
                          onClick={() => setActive(null)}
                        >
                          {discoveryImages[link.id] && (
                            <Image src={discoveryImages[link.id]!} alt="" width={160} height={160} sizes="80px" />
                          )}
                          <span>
                            <strong>{link.label}</strong>
                            <span>{link.cta}</span>
                            <ArrowRight aria-hidden="true" size={15} />
                          </span>
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <Link
            key={item.id}
            href={chromeHref(item)}
            data-nav-sale={item.id === "nav-sale" ? "" : undefined}
            aria-current={pathname === item.href ? "page" : undefined}
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
type FeaturedProduct =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; product: ProductCardModel | null };
function ProductRail({
  living = false,
  visible,
  onNavigate,
}: {
  living?: boolean;
  visible: boolean;
  onNavigate: () => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<Record<string, FeaturedProduct>>({});
  const retry = useRef<((handles: string[]) => void) | null>(null);
  useEffect(() => {
    let disposed = false;
    const pending = new Map<string, AbortController>();
    const load = (handles: string[]) => {
      setCurrent((previous) => ({
        ...previous,
        ...Object.fromEntries(
          handles.map((handle) => [handle, { state: "loading" }]),
        ),
      }));
      for (const handle of handles) {
        const controller = new AbortController();
        pending.set(handle, controller);
        void recentProduct(handle, controller)
          .then(
            (product) => {
              if (!disposed)
                setCurrent((previous) => ({
                  ...previous,
                  [handle]: { state: "ready", product },
                }));
            },
            () => {
              if (!disposed)
                setCurrent((previous) => ({
                  ...previous,
                  [handle]: { state: "error" },
                }));
            },
          )
          .finally(() => {
            pending.delete(handle);
          });
      }
    };
    retry.current = load;
    load(products.map((product) => product.handle));
    return () => {
      disposed = true;
      retry.current = null;
      pending.forEach((controller) => controller.abort());
    };
  }, []);
  if (!visible) return null;
  const selection = products.slice(living ? 4 : 0, living ? 6 : 4);
  const failures = selection.filter(
    (product) => current[product.handle]?.state === "error",
  );
  const loading = selection.some(
    (product) =>
      !current[product.handle] || current[product.handle]?.state === "loading",
  );
  return (
    <div
      ref={rail}
      className="maple-menu-products"
      role="region"
      aria-label="Featured furniture"
      tabIndex={-1}
    >
      {selection.map((product) => {
        const result = current[product.handle];
        if (result?.state !== "ready" || !result.product) return null;
        const model = result.product;
        return (
          <Link
            key={product.handle}
            href={`/products/${model.handle}`}
            className="maple-menu-product"
            onClick={onNavigate}
          >
            <Image
              src={
                product.image.startsWith("//")
                  ? `https:${product.image}`
                  : product.image
              }
              width={260}
              height={260}
              sizes="130px"
              alt={product.title}
            />
            <span>{product.title}</span>
            {model.compareAtPaise !== null && (
              <del>{shopMoney(model.compareAtPaise)}</del>
            )}
            <span>
              {model.priceFrom ? "From " : ""}
              {shopMoney(model.pricePaise)}
            </span>
            {model.otherOptionsOnRequest && (
              <span>Other options on request</span>
            )}
          </Link>
        );
      })}
      {loading && <p role="status">Loading featured furniture…</p>}
      {failures.length > 0 && (
        <div>
          <p role="alert">
            Some featured furniture is temporarily unavailable.
          </p>
          <button
            type="button"
            onClick={() => {
              // The retry button can disappear as results settle; keep focus in the rail.
              rail.current?.focus();
              retry.current?.(failures.map((product) => product.handle));
            }}
          >
            Retry featured furniture
          </button>
        </div>
      )}
    </div>
  );
}
export function MobileNavigation({
  open,
  onClose,
  siteChrome = defaultSiteChrome,
}: {
  siteChrome?: SiteChrome;
  open: boolean;
  onClose: () => void;
}) {
  const navigation = siteChrome.navigation.filter((item) => item.enabled);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const groupButtons = useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = useState<string | null>(null);
  const group = navigation.find(
    (item) =>
      item.id === active &&
      item.columns.some((column) => column.links.some((link) => link.enabled)),
  );
  useEffect(() => {
    if (active && !group) {
      setActive(null);
      requestAnimationFrame(() => {
        dialog.current
          ?.querySelector<HTMLButtonElement>(".maple-drawer-close")
          ?.focus();
      });
    }
  }, [active, group]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    setActive(null);
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Closes once the header has room for the full menu (1100px, styles/header-menu.css), not before: a tablet or a
    // phone turned sideways still has only the menu button (owner, 10 Nov 2026).
    const wide = window.matchMedia("(min-width: 1100px)");
    const resize = () => {
      if (wide.matches) closeRef.current();
    };
    wide.addEventListener("change", resize);
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      wide.removeEventListener("change", resize);
    };
  }, [open]);
  function enter(title: string) {
    setActive(title);
    requestAnimationFrame(() => {
      scroller.current?.scrollTo(0, 0);
      back.current?.focus();
    });
  }
  function goBack() {
    const previous = active;
    setActive(null);
    requestAnimationFrame(() => {
      scroller.current?.scrollTo(0, 0);
      if (previous) groupButtons.current.get(previous)?.focus();
    });
  }
  return (
    <dialog
      id="maple-mobile-navigation"
      ref={dialog}
      className="maple-mobile-drawer"
      aria-label="Main navigation"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          event.clientX >= event.currentTarget.getBoundingClientRect().right
        )
          onClose();
      }}
    >
      <div className="maple-drawer-toolbar">
        {group && (
          <button
            ref={back}
            className="maple-drawer-back"
            onClick={goBack}
            aria-label={`Back from ${group?.label ?? "navigation"}`}
          >
            <ArrowLeft size={18} />
            <span>{group?.label}</span>
          </button>
        )}
        <button
          className="maple-drawer-close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>
      <div ref={scroller} className="maple-drawer-scroll">
        {group ? (
          <>
            <nav className="maple-drawer-submenu" aria-label={group.label}>
              {group.columns
                .filter((column) => column.links.some((link) => link.enabled))
                .map((column) => (
                  <div className="maple-drawer-group" key={column.id}>
                    {column.links
                      .filter((link) => link.enabled)
                      .map((link) => (
                        <CategoryLink
                          key={link.id}
                          item={link}
                          onNavigate={onClose}
                        />
                      ))}
                  </div>
                ))}
            </nav>
          </>
        ) : (
          <>
            {navigation.length > 0 && (
              <nav
                className="maple-drawer-main"
                aria-label="Furniture categories"
              >
                {navigation.map((item) =>
                  item.columns.some((column) =>
                    column.links.some((link) => link.enabled),
                  ) ? (
                    <button
                      key={item.id}
                      ref={(element) => {
                        if (element) groupButtons.current.set(item.id, element);
                      }}
                      onClick={() => enter(item.id)}
                    >
                      {item.label}
                      <ChevronRight size={18} />
                    </button>
                  ) : (
                    <Link key={item.id} href={chromeHref(item)} onClick={onClose}>
                      {item.label}
                    </Link>
                  ),
                )}
              </nav>
            )}
            {siteChrome.mobileQuickLinks.some((link) => link.enabled) && (
              <nav
                className="maple-drawer-quick-links"
                aria-label="More from Maple"
              >
                {siteChrome.mobileQuickLinks
                  .filter((link) => link.enabled)
                  .map((link) => (
                    <Link
                      key={link.id}
                      href={chromeHref(link)}
                      aria-label={
                        link.enquirySubject === "Custom furniture" &&
                        (link.label === "Fully Customizable" ||
                          link.label === "Custom furniture")
                          ? "Enquire about custom furniture"
                          : undefined
                      }
                      onClick={onClose}
                    >
                      {link.label} <ArrowUpRight size={16} />
                    </Link>
                  ))}
              </nav>
            )}
            {/* The one-row header has no room for these (Figma 256:3836); on a phone they sit with the quick links. */}
            {siteChrome.utilityLinks.some((link) => link.enabled) && (
              <nav className="maple-drawer-utility-links utility-links" aria-label="About Maple">
                {siteChrome.utilityLinks
                  .filter((link) => link.enabled)
                  .map((link) => (
                    <Link key={link.id} href={chromeHref(link)} onClick={onClose}>
                      {link.label}<ArrowUpRight aria-hidden size={16} />
                    </Link>
                  ))}
              </nav>
            )}
          </>
        )}
        {open && (
          <ProductRail
            living={group?.feature === "living"}
            visible={!group || group.feature === "living"}
            onNavigate={onClose}
          />
        )}
      </div>
    </dialog>
  );
}
