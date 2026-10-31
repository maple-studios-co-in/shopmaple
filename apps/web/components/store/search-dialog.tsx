"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import { shopMoney } from "@/lib/format";
import type { ProductCardModel } from "@/lib/product-card-model";
import { recentProducts, clearRecentProducts } from "@/lib/recent-products";
import { searchProducts, recentProduct } from "@/lib/search-products";

// Shared by the dialog's headings and messages (the original .search-discovery h2 and p).
const heading = "mb-4 font-[Newsreader,Georgia,serif] text-[18px] leading-[1.4] font-medium";
const paragraph = "mb-4";

type Results = { state: "loading" | "ready" | "error"; products: ProductCardModel[]; total: number };
const loading: Results = { state: "loading", products: [], total: 0 };
function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(element => {
    if (element.tabIndex < 0 || element.matches(":disabled, input[type=hidden]")) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hidden || ancestor.hasAttribute("inert")) return false;
      const style = window.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (ancestor === dialog) break;
    }
    return true;
  });
  const first = controls[0], last = controls.at(-1);
  const destination = event.shiftKey && document.activeElement === first ? last
    : !event.shiftKey && document.activeElement === last ? first : undefined;
  if (destination) { event.preventDefault(); destination.focus(); }
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [query, setQuery] = useState("");
  const normalized = query.trim().slice(0, 80);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<Results>(loading);
  const [handles, setHandles] = useState<string[]>([]);
  const [recent, setRecent] = useState<ProductCardModel[]>([]);
  const [recentState, setRecentState] = useState<"loading" | "ready" | "error">("ready");
  const [recentAttempt, setRecentAttempt] = useState(0);
  const [clearFailed, setClearFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element.showModal(); input.current?.focus(); document.body.style.overflow = "hidden";
    setHandles(recentProducts());
    return () => { element.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setResults(loading);
    const run = () => searchProducts(normalized, controller).then(
      data => { if (active) setResults({ state: "ready", ...data }); },
      () => { if (active) setResults({ state: "error", products: [], total: 0 }); },
    );
    const timer = normalized ? setTimeout(() => void run(), 250) : undefined;
    if (!normalized) void run();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [normalized, attempt]);
  useEffect(() => {
    if (normalized || !handles.length) { setRecent([]); setRecentState("ready"); return; }
    let active = true;
    const controllers = handles.map(() => new AbortController());
    setRecentState("loading"); setRecent([]);
    void Promise.allSettled(handles.map((handle, index) => recentProduct(handle, controllers[index]!))).then(values => {
      if (!active) return;
      setRecent(values.flatMap(value => value.status === "fulfilled" && value.value ? [value.value] : []));
      setRecentState(values.some(value => value.status === "rejected") ? "error" : "ready");
    });
    return () => { active = false; controllers.forEach(controller => controller.abort()); };
  }, [handles, normalized, recentAttempt]);
  const cardList = (products: ProductCardModel[], label: string) => (
    <ul data-search-products className="m-0 grid list-none grid-cols-4 gap-[14px] p-0 max-[749px]:grid-cols-2 max-[749px]:gap-x-4 max-[749px]:gap-y-5" aria-label={label}>
      {products.map(product => <li key={product.handle} className="min-w-0">
        <Link data-search-product className="block text-inherit no-underline hover:underline hover:underline-offset-[5px]" href={"/products/" + product.handle} aria-label={product.title}>
          <span className="relative block aspect-[4/5] overflow-hidden bg-[#eeede9]"><ProductImage src={product.image ?? undefined} alt="" fill sizes="(max-width: 749px) calc((100vw - 64px) / 2), 147px" /></span>
          <span data-card-name className="mt-[13px] block text-[14px] leading-[1.5] font-medium [overflow-wrap:anywhere]">{product.title}</span>
          <span data-card-price className="my-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-brand">
            {product.compareAtPaise !== null && <del className="text-[0.85em] text-ink-soft"><span className="sr-only">Regular price </span>{shopMoney(product.compareAtPaise)}</del>}
            <span><span className="sr-only">{product.compareAtPaise !== null ? "Sale price " : "Price "}</span>{product.priceFrom ? "From " : ""}{shopMoney(product.pricePaise)}</span>
          </span>
          {product.otherOptionsOnRequest && <span data-card-options className="inline-flex min-h-8 items-center gap-[6px] text-[12px] text-ink-soft">Other options on request</span>}
        </Link>
      </li>)}
    </ul>
  );
  return (
    <dialog ref={dialog} data-store data-search-dialog className="mx-auto mt-[94px] mb-[18px] max-h-[calc(100dvh_-_112px)] w-[min(672px,calc(100vw_-_32px))] max-w-none overflow-auto overscroll-contain border border-rule bg-paper p-0 text-ink backdrop:bg-[#17171175] max-[749px]:mt-3 max-[749px]:max-h-[calc(100dvh_-_24px)] max-[749px]:w-[calc(100vw_-_24px)]" aria-label="Search" onKeyDown={keepFocusInside} onCancel={event => { event.preventDefault(); close.current(); }}
      onClick={event => { if (event.target !== event.currentTarget) return; const r=event.currentTarget.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close.current(); }}>
      <form action="/collections/all" method="get" className="sticky top-0 z-[2] flex items-center gap-3 border-b border-b-rule bg-paper px-5 py-3 max-[749px]:gap-2 max-[749px]:px-3 max-[749px]:py-2" role="search" aria-label="Search">
        <label htmlFor="site-search" className="sr-only">Search</label>
        <Search size={20} aria-hidden="true" className="flex-none" />
        <input ref={input} id="site-search" type="search" name="q" placeholder="Search" maxLength={80} value={query}
          autoComplete="off" className="min-h-11 min-w-0 flex-1 [border:0] bg-transparent px-0 py-[10px] text-ink placeholder:text-ink-soft" onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="min-h-11 flex-none" aria-label="Reset search" onClick={() => { setQuery(""); input.current?.focus(); }}>Clear</button>}
        <button type="button" className="relative inline-flex h-10 min-h-11 w-8 flex-none items-center justify-center [border:0] bg-transparent p-[5px] no-underline hover:text-brand" aria-label="Close Search" onClick={() => close.current()}><X size={20} className="h-5 w-5 [stroke-width:1.6]" /></button>
      </form>
      <div data-search-discovery className="p-5 max-[749px]:px-3 max-[749px]:py-4" onClick={event => { if ((event.target as Element).closest("a")) close.current(); }}>
        {!normalized && handles.length > 0 && <section className="mb-7">
          <div className="flex items-baseline justify-between gap-4"><h2 className={heading}>Recently viewed</h2><button className="min-h-11" aria-label="Clear recently viewed" onClick={() => {
            if (clearRecentProducts()) { setHandles([]); setClearFailed(false); input.current?.focus(); } else setClearFailed(true);
          }}>Clear</button></div>
          {recentState === "loading" && <p className={paragraph} role="status">Loading recently viewed…</p>}
          {recent.length > 0 && cardList(recent, "Recently viewed")}
          {recentState === "error" && <div data-search-recent-error><p className={paragraph} role="alert">Recently viewed couldn’t be loaded.</p><button onClick={() => { input.current?.focus(); setRecentAttempt(value => value + 1); }}>Retry recently viewed</button></div>}
          {clearFailed && <p className={paragraph} role="alert">Recently viewed couldn’t be cleared. Please try again.</p>}
        </section>}
        {results.state === "loading" && <p className={paragraph} role="status">Searching…</p>}
        {results.state === "error" && <div><p className={paragraph} role="alert">Search is temporarily unavailable. Please try again.</p><button onClick={() => { input.current?.focus(); setAttempt(value => value + 1); }}>Retry search</button></div>}
        {results.state === "ready" && <>
          {normalized && <p className="sr-only [margin:0_0_16px]" role="status">{results.total ? `${results.total} search results found for "${normalized}"` : `No results found for "${normalized}"`}</p>}
          {results.products.length > 0 ? <section><h2 className={heading}>Products</h2>{cardList(results.products, "Products")}</section> : normalized ? <p className={paragraph}>No results found for "{normalized}". Try another search.</p> : <p className={paragraph}>No products are available right now.</p>}
        </>}
        {normalized && <Link data-search-view-all className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 border border-brand bg-brand px-6 py-[13px] font-medium text-white no-underline transition-[background,color] duration-150 hover:bg-[#571710]" href={"/collections/all?" + new URLSearchParams({q:normalized})}>View all</Link>}
      </div>
    </dialog>
  );
}
