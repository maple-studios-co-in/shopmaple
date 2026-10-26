"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react";
import type { ChromeNavigationLink, SiteChrome } from "@shopmaple/contracts";
import { defaultSiteChrome, chromeHref } from "../lib/site-chrome-defaults";
import products from "../data/navigation-products.json";
import { shopFile, shopMoney } from "../lib/format";
import { recentProduct } from "../lib/search-products";
import type { ProductCardModel } from "../lib/product-card-model";
function CategoryLink({
  item,
  onNavigate,
}: {
  item: ChromeNavigationLink;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={chromeHref(item)}
      onClick={onNavigate}
      className={item.parent ? "maple-menu-parent" : "maple-menu-link"}
    >
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
                      src={shopFile(
                        item.feature === "bedroom"
                          ? "engaged_9_1.jpg?v=1767448207"
                          : "engaged_5.jpg?v=1767435623",
                      )}
                      alt={
                        item.feature === "bedroom"
                          ? "Upholstered bed"
                          : "A thoughtfully furnished living room"
                      }
                      width={320}
                      height={260}
                      sizes="220px"
                    />
                    <span>{item.label}</span>
                    <h2>{item.label}</h2>
                    <Link href={item.href} onClick={() => setActive(null)}>
                      View all <ArrowUpRight size={15} />
                    </Link>
                  </div>
                )}
                <div className="maple-mega-grid">
                  {group?.columns
                    .filter((column) =>
                      column.links.some((link) => link.enabled),
                    )
                    .map((column) => (
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
                          <strong>{link.label}</strong>
                          <span>
                            {link.cta} <ArrowUpRight size={15} />
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
            href={item.href}
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
    const wide = window.matchMedia("(min-width: 750px)");
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
                    <Link key={item.id} href={item.href} onClick={onClose}>
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
