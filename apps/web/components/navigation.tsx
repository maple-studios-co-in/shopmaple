"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react";
import {
  navigation,
  navigationHref,
  type NavigationLink,
} from "../lib/navigation";
import products from "../data/navigation-products.json";
import { shopFile, shopMoney } from "../lib/format";
function CategoryLink({
  item,
  onNavigate,
}: {
  item: NavigationLink;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={navigationHref(item.href, item.title)}
      onClick={onNavigate}
      className={item.parent ? "maple-menu-parent" : "maple-menu-link"}
    >
      {item.title}
    </Link>
  );
}
export function DesktopNavigation() {
  const [active, setActive] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const group = navigation.find((item) => item.title === active);
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [active]);
  return (
    <nav
      ref={nav}
      className="desktop-nav maple-desktop-nav"
      aria-label="Main navigation"
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setActive(null);
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
      {navigation.map((item, index) =>
        item.columns.length ? (
          <div key={item.title} className="maple-menu-trigger-wrap">
            <button
              ref={(element) => {
                if (element) triggers.current.set(item.title, element);
              }}
              id={`maple-trigger-${index}`}
              className="maple-menu-trigger"
              aria-expanded={active === item.title}
              aria-controls={`maple-panel-${index}`}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setActive(item.title);
              }}
              onClick={(event) =>
                setActive(
                  event.detail === 0 && active === item.title
                    ? null
                    : item.title,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive(item.title);
                  requestAnimationFrame(() =>
                    nav.current
                      ?.querySelector<HTMLAnchorElement>(".maple-mega a")
                      ?.focus(),
                  );
                }
              }}
            >
              {item.title}
            </button>
            {active === item.title && (
              <div
                id={`maple-panel-${index}`}
                className="maple-mega"
                aria-labelledby={`maple-trigger-${index}`}
              >
                <div className="maple-mega-feature">
                  <Image
                    src={shopFile(
                      item.title === "Bedroom"
                        ? "engaged_9_1.jpg?v=1767448207"
                        : "engaged_5.jpg?v=1767435623",
                    )}
                    alt={
                      item.title === "Bedroom"
                        ? "Upholstered bed"
                        : "A thoughtfully furnished living room"
                    }
                    width={320}
                    height={260}
                    sizes="220px"
                  />
                  <span>{item.title}</span>
                  <h2>{item.title}</h2>
                  <Link
                    href={
                      item.title === "Bedroom"
                        ? "/collections/beds"
                        : "/collections/sofas"
                    }
                    onClick={() => setActive(null)}
                  >
                    View all <ArrowUpRight size={15} />
                  </Link>
                </div>
                <div className="maple-mega-grid">
                  {group?.columns.map((column, columnIndex) => (
                    <div className="maple-mega-column" key={columnIndex}>
                      {column.links.map((link) => (
                        <CategoryLink
                          key={link.title}
                          item={link}
                          onNavigate={() => setActive(null)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="maple-mega-discovery">
                  <Link href="/collections/all" onClick={() => setActive(null)}>
                    <strong>All furniture</strong>
                    <span>
                      View all <ArrowUpRight size={15} />
                    </span>
                  </Link>
                  <Link href="/pages/our-story" onClick={() => setActive(null)}>
                    <strong>Our Story</strong>
                    <span>
                      Read More <ArrowUpRight size={15} />
                    </span>
                  </Link>
                  <Link
                    href="/pages/contact?product=Custom%20furniture"
                    aria-label="Enquire about custom furniture"
                    onClick={() => setActive(null)}
                  >
                    <strong>Fully Customizable</strong>
                    <span>
                      Contact <ArrowUpRight size={15} />
                    </span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            key={item.title}
            href={navigationHref(item.href, item.title)}
            onPointerEnter={() => setActive(null)}
            onFocus={() => setActive(null)}
          >
            {item.title}
          </Link>
        ),
      )}
    </nav>
  );
}
function ProductRail({ living = false }: { living?: boolean }) {
  return (
    <div className="maple-menu-products" aria-label="Featured furniture">
      {products.slice(living ? 4 : 0, living ? 6 : 4).map((product) => (
        <Link
          key={product.handle}
          href={`/products/${product.handle}`}
          className="maple-menu-product"
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
          {product.compareAtPaise > product.pricePaise && (
            <del>{shopMoney(product.compareAtPaise)}</del>
          )}
          <span>{shopMoney(product.pricePaise)}</span>
        </Link>
      ))}
    </div>
  );
}
export function MobileNavigation({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const groupButtons = useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = useState<string | null>(null);
  const group = navigation.find((item) => item.title === active);
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
        {active && (
          <button
            ref={back}
            className="maple-drawer-back"
            onClick={goBack}
            aria-label={`Back from ${active}`}
          >
            <ArrowLeft size={18} />
            <span>{active}</span>
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
            <nav className="maple-drawer-submenu" aria-label={group.title}>
              {group.columns.map((column, index) => (
                <div className="maple-drawer-group" key={index}>
                  {column.links.map((link) => (
                    <CategoryLink
                      key={link.title}
                      item={link}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              ))}
            </nav>
            {active === "Living Room" && <ProductRail living />}
          </>
        ) : (
          <>
            <nav
              className="maple-drawer-main"
              aria-label="Furniture categories"
            >
              {navigation.map((item) =>
                item.columns.length ? (
                  <button
                    key={item.title}
                    ref={(element) => {
                      if (element)
                        groupButtons.current.set(item.title, element);
                    }}
                    onClick={() => enter(item.title)}
                  >
                    {item.title}
                    <ChevronRight size={18} />
                  </button>
                ) : (
                  <Link
                    key={item.title}
                    href={navigationHref(item.href, item.title)}
                    onClick={onClose}
                  >
                    {item.title}
                  </Link>
                ),
              )}
            </nav>
            <nav
              className="maple-drawer-quick-links"
              aria-label="More from Maple"
            >
              <Link href="/collections/all" onClick={onClose}>
                All furniture <ArrowUpRight size={16} />
              </Link>
              <Link href="/favourites" onClick={onClose}>
                Saved furniture <ArrowUpRight size={16} />
              </Link>
              <Link
                href="/pages/contact?product=Custom%20furniture"
                aria-label="Enquire about custom furniture"
                onClick={onClose}
              >
                Custom furniture <ArrowUpRight size={16} />
              </Link>
              <a href="/account" onClick={onClose}>
                Account <ArrowUpRight size={16} />
              </a>
            </nav>
            <ProductRail />
          </>
        )}
      </div>
    </dialog>
  );
}
