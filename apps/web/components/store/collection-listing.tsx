"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { collectionHref, sortOptions, type CollectionQuery } from "@shopmaple/contracts";
import { categoryNames, money } from "@/lib/format";
import { collectionIntro } from "@/lib/collection-intros";
import { cn } from "@/lib/utils";
import { ProductImage } from "../product-image";
import { ProductCard } from "./product-card";
import { PromiseStrip } from "./promise-strip";

const resetHref = (handle: string) => `/collections/${handle}${handle === "chairs" ? "?page=1" : ""}`;
// Two columns on phones; three beside the filter card on tablets and small laptops; four from
// 1280 px; a fixed 243 px card once the 1312 px content width is reached.
const imageSizes = "(max-width:767px) calc((100vw - 44px) / 2), (max-width:1023px) calc((100vw - 96px) / 3), (max-width:1279px) calc((100vw - 420px) / 3), (min-width:1440px) 243px, calc((100vw - 468px) / 4)";
const page = "mx-auto w-full max-w-[1440px] px-4 md:px-8 xl:px-16";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-sm bg-brand px-5 py-3.5 text-ui font-bold text-white no-underline transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const field = "m-0 h-10 w-full rounded-sm border border-sand bg-white px-3 py-0 font-body text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";
const facet = "grid gap-2";
const facetTitle = "m-0 p-0 text-price font-bold text-espresso";
const choice = "flex cursor-pointer items-center gap-2 text-ui text-taupe [&>span]:ml-auto [&>span]:text-label";
const radio = "m-0 size-4 shrink-0 cursor-pointer appearance-auto border-0 p-0 accent-brand";

type Props = {
  handle: string;
  title: string;
  headingLevel?: "h1" | "h2";
  query: CollectionQuery;
  products: ProductCardModel[];
  total: number;
  collectionTotal: number;
  limit: number;
  inStock: number;
  outOfStock: number;
  highestPrice: number | null;
};

function FilterFields({ handle, query, inStock, outOfStock, highestPrice, id }: Props & { id: string }) {
  return (
    <form data-filter-form action={`/collections/${handle}`} method="get" className="grid gap-[22px]">
      <input type="hidden" name="sort" value={query.sort} />
      <fieldset className={facet}>
        <legend className={cn(facetTitle, "mb-2")}>Search</legend>
        <label className="sr-only" htmlFor={`${id}-q`}>Search this collection</label>
        <span className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" />
          <input id={`${id}-q`} name="q" type="search" maxLength={80} placeholder="Search furniture" defaultValue={query.q} className={cn(field, "pl-9")} />
        </span>
      </fieldset>
      <fieldset className={facet}>
        <legend className={cn(facetTitle, "mb-2")}>Availability</legend>
        <label className={choice}>
          <input className={radio} type="radio" name="availability" value="" defaultChecked={!query.availability} /> All items
        </label>
        <label className={choice}>
          <input className={radio} type="radio" name="availability" value="in" defaultChecked={query.availability === "in"} /> Available to order <span>{inStock}</span>
        </label>
        <label className={choice}>
          <input className={radio} type="radio" name="availability" value="out" defaultChecked={query.availability === "out"} /> Enquiry only <span>{outOfStock}</span>
        </label>
      </fieldset>
      <fieldset className={facet}>
        <legend className={cn(facetTitle, "mb-2")}>Price range</legend>
        <div className="flex items-center gap-2 text-ui text-taupe">
          <label className="relative flex-1">
            <span className="sr-only">Minimum price in rupees</span>
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">₹</span>
            <input aria-label="Minimum price in rupees" name="min" type="number" min="0" step="0.01" placeholder="0" defaultValue={query.min} className={cn(field, "pl-7")} />
          </label>
          <span>to</span>
          <label className="relative flex-1">
            <span className="sr-only">Maximum price in rupees</span>
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">₹</span>
            <input aria-label="Maximum price in rupees" name="max" type="number" min="0" step="0.01" placeholder={highestPrice === null ? "Any price" : String(highestPrice / 100)} defaultValue={query.max} className={cn(field, "pl-7")} />
          </label>
        </div>
        <p data-price-caption className="m-0 text-label text-taupe">
          {highestPrice === null ? "Prices available on request" : `Rs. 0 — ${money(highestPrice)}`}
        </p>
      </fieldset>
      {handle === "all" && (
        <fieldset className={facet}>
          <legend className={cn(facetTitle, "mb-2")}>Category</legend>
          <label className="sr-only" htmlFor={`${id}-category`}>Furniture category</label>
          <select id={`${id}-category`} name="category" defaultValue={query.category} className={field}>
            <option value="">All furniture</option>
            {Object.entries(categoryNames).filter(([key]) => key !== "all").map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </fieldset>
      )}
      <button className={cn(primaryButton, "mt-1 w-full cursor-pointer border-0")} type="submit">
        Apply filters <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

function Introduction({ handle, title, image }: { handle: string; title: string; image: string | null }) {
  const intro = collectionIntro(handle, title);
  return (
    <div className={cn(page, "grid gap-6 py-8 md:py-12 lg:py-16")}>
      <div data-collection-intro className={cn("grid overflow-hidden rounded-2xl bg-cream", image && "md:grid-cols-[minmax(0,700fr)_minmax(0,612fr)]")}>
        {image && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl md:aspect-auto md:min-h-[380px]">
            <ProductImage src={image} alt="" fill priority sizes="(max-width:767px) 100vw, 700px" className="object-cover" />
          </div>
        )}
        <div className="flex flex-col items-start gap-4 p-6 md:gap-5 md:p-[42px]">
          <h1 className="m-0 font-body text-label font-bold tracking-[0.02em] text-brand uppercase">{title}</h1>
          <p className="m-0 max-w-[528px] font-serif text-[32px] leading-[1.1] font-bold text-espresso md:text-h1">{intro.headline}</p>
          <p className="m-0 max-w-[500px] font-body text-card text-taupe md:text-lead">{intro.copy}</p>
          <a data-intro-cta href="#collection-results" className={cn(primaryButton, "min-w-[210px]")}>
            {intro.cta} <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
      <PromiseStrip />
    </div>
  );
}

export function CollectionListing(props: Props) {
  const { handle, title, query, products, total, collectionTotal, limit } = props;
  const editorial = props.headingLevel === "h2";
  const dialog = useRef<HTMLDialogElement>(null);
  const filtered = Boolean(query.q || query.min || query.max || query.category || query.availability);
  const chips = ([
    ["q", query.q ? `Search: ${query.q}` : "", "search"],
    ["availability", query.availability ? (query.availability === "in" ? "Available to order" : "Enquiry only") : "", "availability"],
    ["min", query.min ? `From ${money(Number(query.min) * 100)}` : "", "minimum price"],
    ["max", query.max ? `Up to ${money(Number(query.max) * 100)}` : "", "maximum price"],
    ["category", query.category ? categoryNames[query.category] : "", "category"],
  ] as const).filter(([, label]) => label);
  return (
    <section data-store id="collection-products" aria-label={title} className="bg-white font-body text-espresso">
      {editorial ? (
        <div className={cn(page, "pt-10 pb-2")}>
          <h2 className="m-0 font-serif text-h2 font-bold">{title}</h2>
        </div>
      ) : (
        <Introduction handle={handle} title={title} image={products[0]?.image ?? null} />
      )}
      <div className="bg-linen py-8 md:py-12 lg:py-16">
        <div className={cn(page, "lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-8")}>
          <aside aria-label="Collection filters" className="hidden rounded-xl bg-white p-[22px] lg:grid lg:gap-5">
            <div className="flex items-baseline gap-4">
              <h2 className="m-0 text-subhead font-bold">Filters</h2>
              <Link href={resetHref(handle)} className="text-subhead font-bold text-espresso no-underline hover:text-brand">Clear all</Link>
            </div>
            <FilterFields {...props} id="desktop" />
          </aside>
          <div id="collection-results" className="grid scroll-mt-28 gap-6">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <h2 data-results-heading className="m-0 text-price font-bold">All {title.toLowerCase()}</h2>
              <p data-item-count className="m-0 text-price font-bold" aria-live="polite">{total} {total === 1 ? "product" : "products"}</p>
              <form action={`/collections/${handle}`} method="get" className="flex items-center gap-1.5 text-price font-bold">
                {Object.entries(query).filter(([key, value]) => !["page", "sort"].includes(key) && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
                <label htmlFor="collection-sort">Sort:</label>
                <select id="collection-sort" name="sort" defaultValue={query.sort} onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  className="m-0 h-auto cursor-pointer rounded-sm border-0 bg-transparent py-1 pr-1 pl-0 font-body text-price font-bold text-espresso focus-visible:outline-2 focus-visible:outline-brand">
                  {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <noscript><button type="submit">Apply sort</button></noscript>
              </form>
              <button type="button" onClick={() => dialog.current?.showModal()}
                className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-sm border border-sand bg-white px-4 py-2.5 font-body text-ui font-bold text-espresso lg:hidden">
                <SlidersHorizontal aria-hidden="true" className="size-4" /> Filters{filtered ? ` (${chips.length})` : ""}
              </button>
            </div>
            {filtered && (
              <div aria-label="Applied filters" className="flex flex-wrap items-center gap-2 text-ui">
                <p className="m-0 mr-2 text-taupe">{total} of {collectionTotal} pieces</p>
                {chips.map(([key, label, name]) => (
                  <Link key={key} href={collectionHref(handle, { ...query, [key]: "" })} aria-label={`Remove ${name} filter`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-white px-3 py-1.5 text-espresso no-underline hover:border-brand">
                    {label} <X aria-hidden="true" className="size-3.5" />
                  </Link>
                ))}
                <Link href={resetHref(handle)} className="font-bold text-brand">Clear all</Link>
              </div>
            )}
            {products.length ? (
              <div data-collection-products className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
                {products.map((product) => <ProductCard key={product.id} product={product} imageSizes={imageSizes} />)}
              </div>
            ) : (
              <div className="grid justify-items-start gap-3 rounded-xl bg-white p-8">
                <h2 className="m-0 font-serif text-h3 font-bold">{filtered ? "No matching pieces" : "More pieces are on their way"}</h2>
                <p className="m-0 text-card text-taupe">{filtered ? "Try a different search or clear your filters." : "This collection has no products in the current preview."}</p>
                <Link className={primaryButton} href={filtered ? resetHref(handle) : "/collections/all"}>{filtered ? "Clear filters" : "Browse all furniture"}</Link>
              </div>
            )}
            {total > limit && (
              <nav data-pagination aria-label="Collection pages" className="flex items-center justify-center gap-4 text-ui font-bold">
                {query.page > 1 && <Link href={collectionHref(handle, query, query.page - 1)} className="text-brand">Previous</Link>}
                <span className="text-taupe">Page {query.page} of {Math.ceil(total / limit)}</span>
                {total > query.page * limit && <Link href={collectionHref(handle, query, query.page + 1)} className="text-brand">Next</Link>}
              </nav>
            )}
            <div data-custom-order className="flex flex-col gap-4 bg-cream p-6 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="m-0 font-serif text-h3 font-bold">Can’t find what you’re looking for?</h2>
              <Link href="/pages/contact?product=Custom%20furniture"
                className="inline-flex min-w-[260px] items-center justify-center gap-2 rounded-sm border border-sand bg-white px-5 py-3.5 text-ui font-bold text-brand no-underline hover:border-brand">
                Request custom order <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <p data-preview-note className="m-0 text-label text-taupe">A selection from our catalogue. Prices and availability are from the preview snapshot.</p>
          </div>
        </div>
      </div>
      <dialog ref={dialog} aria-labelledby="collection-filter-title"
        className="m-0 mr-auto h-dvh max-h-none w-[min(360px,100vw-48px)] max-w-none border-0 bg-white p-0 font-body text-espresso backdrop:bg-espresso/40"
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="grid gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 id="collection-filter-title" className="m-0 text-subhead font-bold">Filters</h2>
            <button type="button" aria-label="Close filters" onClick={() => dialog.current?.close()} className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-cream p-0 text-espresso">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <FilterFields {...props} id="mobile" />
          <Link href={resetHref(handle)} className="text-center text-ui font-bold text-brand">Clear all</Link>
        </div>
      </dialog>
    </section>
  );
}
