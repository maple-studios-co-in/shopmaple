"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { ProductImage } from "./product-image";
import { shopMoney } from "@/lib/format";
import type { ProductCardModel } from "@/lib/product-card-model";
import { recentProducts, clearRecentProducts } from "@/lib/recent-products";
import { searchProducts, recentProduct } from "@/lib/search-products";

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
    <ul className="search-product-list" aria-label={label}>
      {products.map(product => <li key={product.handle}>
        <Link className="search-product-card" href={"/products/" + product.handle} aria-label={product.title}>
          <span className="search-product-image"><ProductImage src={product.image ?? undefined} alt="" fill sizes="(max-width: 749px) calc((100vw - 64px) / 2), 147px" /></span>
          <span className="product-card-name">{product.title}</span>
          <span className="product-card-price">
            {product.compareAtPaise !== null && <del><span className="sr-only">Regular price </span>{shopMoney(product.compareAtPaise)}</del>}
            <span><span className="sr-only">{product.compareAtPaise !== null ? "Sale price " : "Price "}</span>{product.priceFrom ? "From " : ""}{shopMoney(product.pricePaise)}</span>
          </span>
          {product.otherOptionsOnRequest && <span className="product-card-options">Other options on request</span>}
        </Link>
      </li>)}
    </ul>
  );
  return (
    <dialog ref={dialog} className="search-dialog" aria-label="Search" onKeyDown={keepFocusInside} onCancel={event => { event.preventDefault(); close.current(); }}
      onClick={event => { if (event.target !== event.currentTarget) return; const r=event.currentTarget.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close.current(); }}>
      <form action="/collections/all" method="get" className="search-discovery-form" role="search" aria-label="Search">
        <label htmlFor="site-search" className="sr-only">Search</label>
        <Search size={20} aria-hidden="true" />
        <input ref={input} id="site-search" type="search" name="q" placeholder="Search" maxLength={80} value={query}
          autoComplete="off" onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="text-button" aria-label="Reset search" onClick={() => { setQuery(""); input.current?.focus(); }}>Clear</button>}
        <button type="button" className="icon-button" aria-label="Close Search" onClick={() => close.current()}><X size={20} /></button>
      </form>
      <div className="search-discovery" onClick={event => { if ((event.target as Element).closest("a")) close.current(); }}>
        {!normalized && handles.length > 0 && <section className="search-recent-section">
          <div className="search-section-heading"><h2>Recently viewed</h2><button className="text-button" aria-label="Clear recently viewed" onClick={() => {
            if (clearRecentProducts()) { setHandles([]); setClearFailed(false); input.current?.focus(); } else setClearFailed(true);
          }}>Clear</button></div>
          {recentState === "loading" && <p role="status">Loading recently viewed…</p>}
          {recent.length > 0 && cardList(recent, "Recently viewed")}
          {recentState === "error" && <div className="search-recent-error"><p role="alert">Recently viewed couldn’t be loaded.</p><button className="text-button" onClick={() => { input.current?.focus(); setRecentAttempt(value => value + 1); }}>Retry recently viewed</button></div>}
          {clearFailed && <p role="alert">Recently viewed couldn’t be cleared. Please try again.</p>}
        </section>}
        {results.state === "loading" && <p role="status">Searching…</p>}
        {results.state === "error" && <div><p role="alert">Search is temporarily unavailable. Please try again.</p><button className="text-button" onClick={() => { input.current?.focus(); setAttempt(value => value + 1); }}>Retry search</button></div>}
        {results.state === "ready" && <>
          {normalized && <p className="sr-only" role="status">{results.total ? `${results.total} search results found for "${normalized}"` : `No results found for "${normalized}"`}</p>}
          {results.products.length > 0 ? <section><h2>Products</h2>{cardList(results.products, "Products")}</section> : normalized ? <p>No results found for "{normalized}". Try another search.</p> : <p>No products are available right now.</p>}
        </>}
        {normalized && <Link className="search-view-all button button-outline" href={"/collections/all?" + new URLSearchParams({q:normalized})}>View all</Link>}
      </div>
    </dialog>
  );
}
