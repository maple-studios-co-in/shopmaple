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
import { textLink } from "./current-look";
import { focusInk, drawerEntry } from "./site-navigation";

/** The mobile navigation drawer, in its own module so it loads only when the header asks for it. */
type FeaturedProduct =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; product: ProductCardModel | null };

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
      data-menu-link={item.parent ? "parent" : "link"}
      className={
        "block font-redhat font-bold text-[#555] hover:underline hover:underline-offset-3 " +
        (item.parent ? "pt-1 pb-2.5 text-[16px] leading-[23.4px]" : "py-[5px] text-[14px] leading-[23.4px]")
      }
    >
      {item.label}
    </Link>
  );
}

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
      data-menu-products
      className="mt-[50px] flex shrink-0 gap-4 overflow-x-auto overscroll-x-contain px-5 pb-2.5 [scrollbar-color:#b8b1a5_#f4f2ec] [scrollbar-width:thin] [[data-drawer-main]+&]:mt-auto [[data-drawer-main]+&]:pt-[50px] [[data-drawer-main]+&]:pb-[30px] [[data-drawer-quick-links]+&]:mt-6"
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
            data-menu-product
            className={`flex-[0_0_130px] font-redhat text-[16px] leading-[1.25] font-normal ${textLink}`}
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
              className="mb-2 block size-[130px] object-cover"
            />
            <span className="mb-1 block">{product.title}</span>
            {model.compareAtPaise !== null && (
              <del className="block text-[#666]">{shopMoney(model.compareAtPaise)}</del>
            )}
            <span className="block">
              {model.priceFrom ? "From " : ""}
              {shopMoney(model.pricePaise)}
            </span>
            {model.otherOptionsOnRequest && (
              <span className="block">Other options on request</span>
            )}
          </Link>
        );
      })}
      {loading && <p role="status" className="my-2.5">Loading featured furniture…</p>}
      {failures.length > 0 && (
        <div>
          <p role="alert" className="my-2.5">
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
          ?.querySelector<HTMLButtonElement>("[data-drawer-close]")
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
      data-store
      data-mobile-drawer
      className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-dvh w-[calc(100%-20px)] max-w-none overflow-hidden border-none border-current bg-paper p-0 font-redhat text-ink open:flex open:flex-col backdrop:bg-[rgb(0_0_0/35%)] [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-3 [&_:focus-visible]:outline-ink"
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
      <div data-drawer-toolbar className="flex min-h-[50px] shrink-0 items-center px-1">
        {group && (
          <button
            ref={back}
            data-drawer-back
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2.5 border-none border-current bg-transparent px-[14px] py-0 font-redhat text-[14px] leading-[1.4] font-normal"
            onClick={goBack}
            aria-label={`Back from ${group?.label ?? "navigation"}`}
          >
            <ArrowLeft size={18} />
            <span>{group?.label}</span>
          </button>
        )}
        <button
          data-drawer-close
          className={
            "flex min-h-11 min-w-11 cursor-pointer items-center justify-center border-none border-current bg-transparent" +
            (group ? " mr-4 ml-auto" : "")
          }
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>
      <div
        ref={scroller}
        data-drawer-scroll
        className="flex flex-1 flex-col overflow-y-auto overscroll-contain pb-0 [scrollbar-color:#b8b1a5_#f4f2ec] [scrollbar-width:thin]"
      >
        {group ? (
          <>
            <nav data-drawer-submenu className="px-[18px] pt-1 pb-0" aria-label={group.label}>
              {group.columns
                .filter((column) => column.links.some((link) => link.enabled))
                .map((column) => (
                  <div data-drawer-group className="[[data-drawer-group]+&]:mt-2.5" key={column.id}>
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
                data-drawer-main
                className="flex flex-col px-[18px] pt-1 pb-0"
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
                      className={drawerEntry}
                      onClick={() => enter(item.id)}
                    >
                      {item.label}
                      <ChevronRight size={18} />
                    </button>
                  ) : (
                    <Link key={item.id} href={item.href} onClick={onClose} className={`${drawerEntry} ${textLink}`}>
                      {item.label}
                    </Link>
                  ),
                )}
              </nav>
            )}
            {siteChrome.mobileQuickLinks.some((link) => link.enabled) && (
              <nav
                data-drawer-quick-links
                className="mx-[18px] mt-6 mb-0 flex flex-col border-t border-t-rule px-0 pt-4 pb-0"
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
                      className={`flex min-h-11 items-center justify-between gap-3 text-[14px] text-brand ${textLink}`}
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
