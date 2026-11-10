"use client";
import { useId, useRef, type FormEvent } from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import {
  collectionHref,
  colourFacets,
  materialFacets,
  sortOptions,
  type CollectionFacets,
  type CollectionQuery,
} from "@shopmaple/contracts";
import type { ProductCardModel } from "@/lib/product-card-model";
import { categoryNames } from "@/lib/format";
import { cx } from "@/lib/cx";
import { ProductCard } from "../product-card";

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
  /** The collection's materials, colours and categories to filter by; without them those sections are left out. */
  facets?: CollectionFacets;
};

const resetHref = (handle: string) => `/collections/${handle}${handle === "chairs" ? "?page=1" : ""}`;
const rupees = (paise: number) => (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const keys = (value: string) => (value ? value.split(",") : []);
const without = (value: string, key: string) => keys(value).filter((item) => item !== key).join(",");
const label = (facets: typeof materialFacets | typeof colourFacets, key: string) => facets.find(([facet]) => facet === key)?.[1] ?? key;
const sizeText = (low: string, high: string) => (low && high ? `${low}–${high} cm` : low ? `from ${low} cm` : `up to ${high} cm`);

const heading = "m-0 text-price font-bold text-espresso";
const option = "flex cursor-pointer items-center gap-2 text-ui text-taupe hover:text-espresso";
const check = "m-0 size-[13px] shrink-0 cursor-pointer accent-brand";
const field = "h-8 w-[64px] rounded-[4px] border border-solid border-sand bg-white px-2 text-ui text-espresso [appearance:textfield] focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-inner-spin-button]:appearance-none";

/** Frame 1:1139 ("Filters"): one form, submitted by Apply filters, so the address always says what is shown. */
function FilterFields({ handle, query, highestPrice, facets, id }: Props & { id: string }) {
  const categories = facets?.categories ?? [];
  const materials = facets?.materials ?? [];
  const colours = facets?.colours ?? [];
  // Empty boxes are left out of the address, so it names only the filters in use.
  function submit(event: FormEvent<HTMLFormElement>) {
    const empty = [...event.currentTarget.elements].filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && element.name !== "" && element.value === "" && !element.disabled);
    empty.forEach((element) => { element.disabled = true; });
    window.setTimeout(() => empty.forEach((element) => { element.disabled = false; }));
  }
  return (
    <form action={`/collections/${handle}`} method="get" onSubmit={submit} className="collection-filter-form flex flex-col gap-[22px]">
      <input type="hidden" name="sort" value={query.sort} />
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.category && <input type="hidden" name="category" value={query.category} />}
      <div role="group" aria-labelledby={`${id}-availability`} className="flex flex-col gap-3">
        <h3 id={`${id}-availability`} className={heading}>Availability</h3>
        <div className="flex flex-col gap-1">
          {([["in", "In stock"], ["out", "Made to order"]] as const).map(([value, text]) => (
            <label key={value} className={option}>
              <input type="checkbox" name="availability" value={value} defaultChecked={query.availability === value} className={check} />
              {text}
            </label>
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby={`${id}-price`} className="flex flex-col gap-3">
        <h3 id={`${id}-price`} className={heading}>Price range</h3>
        <div className="flex flex-wrap items-center gap-1.5 text-ui text-taupe">
          <label className="flex items-center gap-1">
            Rs.
            <input aria-label="Minimum price in rupees" name="min" type="number" min="0" step="1" placeholder="0" defaultValue={query.min} className={field} />
          </label>
          <span aria-hidden="true">—</span>
          <label className="flex items-center gap-1">
            Rs.
            <input aria-label="Maximum price in rupees" name="max" type="number" min="0" step="1" placeholder={highestPrice === null ? "Any price" : rupees(highestPrice)} defaultValue={query.max} className={field} />
          </label>
        </div>
        <p className="collection-price-caption m-0 text-label text-taupe">
          {highestPrice === null ? "Prices available on request" : `Up to Rs. ${rupees(highestPrice)} in this collection`}
        </p>
      </div>
      {categories.length > 0 && (
        <div role="group" aria-labelledby={`${id}-category`} className="flex flex-col gap-3">
          <h3 id={`${id}-category`} className={heading}>Category</h3>
          <ul data-filter-categories className="m-0 flex list-none flex-col gap-1 p-0">
            {categories.map((category) => {
              const current = category.kind === "collection" ? category.current : query.category === category.handle;
              const href = category.kind === "collection" ? `/collections/${category.handle}` : collectionHref(handle, { ...query, category: current ? "" : category.handle });
              return (
                <li key={category.handle}>
                  <Link href={href} aria-current={current ? (category.kind === "collection" ? "page" : "true") : undefined}
                    className={cx("text-ui no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", current ? "font-bold text-espresso" : "text-taupe hover:text-brand")}>
                    {category.title} <span aria-hidden="true">{current && category.kind === "filter" ? "×" : "+"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {([["material", "Material", materials], ["colour", "Colour", colours]] as const).map(([name, title, values]) => values.length > 0 && (
        <div key={name} role="group" aria-labelledby={`${id}-${name}`} className="flex flex-col gap-3">
          <h3 id={`${id}-${name}`} className={heading}>{title}</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {values.map((facet) => (
              <label key={facet.key} className={option}>
                {facet.label}
                <input type="checkbox" name={name} value={facet.key} defaultChecked={keys(query[name]).includes(facet.key)} className={check} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div role="group" aria-labelledby={`${id}-size`} data-filter-size className="flex flex-col gap-3">
        <h3 id={`${id}-size`} className={heading}>Size</h3>
        {/* Frame 1:1152 sets "Width +   Depth +" on one line; an opened one takes the line for its fields. */}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {([["w", "Width"], ["d", "Depth"]] as const).map(([side, text]) => (
            <details key={side} open={Boolean(query[`${side}min`] || query[`${side}max`])} className="group/size open:basis-full">
              <summary className="w-fit cursor-pointer list-none text-ui text-taupe hover:text-espresso [&::-webkit-details-marker]:hidden">
                {text} <span aria-hidden="true" className="inline-block transition-transform group-open/size:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-label text-taupe">
                <input aria-label={`Minimum ${text.toLowerCase()} in centimetres`} name={`${side}min`} type="number" min="1" max="999" step="1" placeholder="Min" defaultValue={query[`${side}min`]} className={cx(field, "w-[64px]")} />
                <span aria-hidden="true">—</span>
                <input aria-label={`Maximum ${text.toLowerCase()} in centimetres`} name={`${side}max`} type="number" min="1" max="999" step="1" placeholder="Max" defaultValue={query[`${side}max`]} className={cx(field, "w-[64px]")} />
                cm
              </div>
            </details>
          ))}
        </div>
      </div>
      <button type="submit" data-fill-button="" className="w-full cursor-pointer rounded-[6px] border-0 bg-brand p-[14px] text-ui font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        Apply filters →
      </button>
    </form>
  );
}

/** The ticked filters, each removable on its own: "Made to order", "Wood", "Width up to 80 cm". */
function appliedFilters(handle: string, query: CollectionQuery) {
  const href = (patch: Partial<CollectionQuery>) => collectionHref(handle, { ...query, ...patch });
  return [
    query.q && { key: "q", text: `Search: ${query.q}`, name: "search", href: href({ q: "" }) },
    query.availability && { key: "availability", text: query.availability === "in" ? "In stock" : "Made to order", name: "availability", href: href({ availability: "" }) },
    query.min && { key: "min", text: `From Rs. ${rupees(Number(query.min) * 100)}`, name: "minimum price", href: href({ min: "" }) },
    query.max && { key: "max", text: `Up to Rs. ${rupees(Number(query.max) * 100)}`, name: "maximum price", href: href({ max: "" }) },
    query.category && { key: "category", text: categoryNames[query.category] ?? query.category, name: "category", href: href({ category: "" }) },
    ...keys(query.material).map((key) => ({ key: `material-${key}`, text: label(materialFacets, key), name: `${label(materialFacets, key)} material`, href: href({ material: without(query.material, key) }) })),
    ...keys(query.colour).map((key) => ({ key: `colour-${key}`, text: label(colourFacets, key), name: `${label(colourFacets, key)} colour`, href: href({ colour: without(query.colour, key) }) })),
    (query.wmin || query.wmax) && { key: "width", text: `Width ${sizeText(query.wmin, query.wmax)}`, name: "width", href: href({ wmin: "", wmax: "" }) },
    (query.dmin || query.dmax) && { key: "depth", text: `Depth ${sizeText(query.dmin, query.dmax)}`, name: "depth", href: href({ dmin: "", dmax: "" }) },
  ].filter((chip): chip is { key: string; text: string; name: string; href: string } => Boolean(chip));
}

/**
 * Frame 1:1137 ("Filters and product grid"): the filters card beside the results (their name, how many, and the sort),
 * four cards across, and an invitation to ask for a custom piece. Phones open the same filters in a dialog.
 */
export function CollectionListing(props: Props) {
  const { handle, title, query, products, total, collectionTotal, limit } = props;
  const Heading = props.headingLevel ?? "h1";
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const chips = appliedFilters(handle, query);
  const filtered = chips.length > 0;
  const name = /^all\b/i.test(title) ? title : `All ${title.toLowerCase()}`;
  return (
    <section id="collection-products" data-store aria-label={title} className="bg-linen px-4 py-10 font-text text-espresso md:px-8 lg:px-16 lg:py-16">
      <div className="mx-auto grid max-w-[1312px] gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start wide:max-w-none">
        <aside data-filters aria-label="Collection filters" className="hidden rounded-[12px] bg-white p-[22px] lg:block">
          <div className="mb-[22px] flex items-baseline gap-5">
            <h2 className="m-0 text-subhead font-medium text-espresso">Filters</h2>
            <Link data-clear-filters href={resetHref(handle)} className="text-subhead font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">Clear all</Link>
          </div>
          <FilterFields {...props} id="desktop" />
        </aside>
        <div data-results className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3 xl:gap-x-20">
            <Heading className="m-0 text-price font-bold text-espresso">{name}</Heading>
            <p data-results-count className="collection-item-count m-0 text-price font-bold text-espresso" aria-live="polite">
              {total} {total === 1 ? "product" : "products"}
            </p>
            <form action={`/collections/${handle}`} method="get" className="collection-sort flex items-center gap-1 text-price font-bold text-espresso">
              {Object.entries(query)
                .filter(([key, value]) => !["page", "sort"].includes(key) && value)
                .map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
              <label htmlFor="collection-sort">Sort:</label>
              <span className="relative inline-flex items-center">
                <select id="collection-sort" name="sort" defaultValue={query.sort} onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  className="cursor-pointer appearance-none border-0 bg-transparent py-1 pr-5 pl-1 text-price font-bold text-espresso focus-visible:outline-2 focus-visible:outline-brand">
                  {sortOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute right-0">↓</span>
              </span>
              <noscript><button type="submit">Apply sort</button></noscript>
            </form>
            <button type="button" className="collection-mobile-filter ml-auto inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-solid border-sand bg-white px-3 py-2 text-ui font-bold text-espresso lg:hidden"
              onClick={() => dialog.current?.showModal()}>
              <SlidersHorizontal size={16} aria-hidden="true" /> Filters
            </button>
          </div>
          {filtered && (
            <div className="collection-applied flex flex-wrap items-center gap-2" aria-label="Applied filters">
              <p className="collection-filter-summary m-0 mr-2 text-meta text-taupe">{total} of {collectionTotal} pieces</p>
              {chips.map((chip) => (
                <Link key={chip.key} className="collection-filter-chip inline-flex items-center gap-1.5 rounded-full border border-solid border-sand bg-white px-3 py-1 text-meta text-espresso no-underline hover:border-brand"
                  href={chip.href} aria-label={`Remove ${chip.name} filter`}>
                  {chip.text}
                  <X size={13} aria-hidden="true" />
                </Link>
              ))}
              <Link className="collection-reset text-meta font-bold text-brand" href={resetHref(handle)}>Clear all</Link>
            </div>
          )}
          {products.length ? (
            <div className="collection-products grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 wider:grid-cols-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product}
                  imageSizes="(max-width:767px) calc((100vw - 44px) / 2), (max-width:1023px) calc((100vw - 96px) / 3), (max-width:1279px) calc((100vw - 452px) / 3), (min-width:1900px) calc((100vw - 468px) / 6), (min-width:1600px) calc((100vw - 436px) / 4), (min-width:1440px) 243px, calc((100vw - 468px) / 4)" />
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] bg-white p-8 text-center">
              <h2 className="m-0 font-heading text-h3 font-medium text-espresso">{filtered ? "No matching pieces" : "More pieces are on their way"}</h2>
              <p className="m-0 mt-2 text-ui text-taupe">{filtered ? "Try different filters, or clear them." : "This collection has no products in the current preview."}</p>
              <Link className="mt-4 inline-flex rounded-[6px] bg-brand px-5 py-3 text-ui font-bold text-white no-underline" href={filtered ? resetHref(handle) : "/collections/all"}>
                {filtered ? "Clear filters" : "Browse all furniture"}
              </Link>
            </div>
          )}
          {total > limit && (
            <nav className="collection-pagination flex items-center justify-center gap-6 text-ui text-espresso" aria-label="Collection pages">
              {query.page > 1 && <Link className="font-bold text-brand" href={collectionHref(handle, query, query.page - 1)}>Previous</Link>}
              <span>Page {query.page} of {Math.ceil(total / limit)}</span>
              {total > query.page * limit && <Link className="font-bold text-brand" href={collectionHref(handle, query, query.page + 1)}>Next</Link>}
            </nav>
          )}
          <div data-custom-order className="flex flex-col items-start gap-5 bg-cream p-6 md:flex-row md:items-center md:justify-between md:gap-8">
            <h2 className="m-0 font-heading text-h3 font-medium text-espresso">Can’t find what you’re looking for?</h2>
            <Link href="/contact" className="inline-flex min-w-[260px] shrink-0 items-center justify-center rounded-[6px] border border-solid border-sand bg-white p-[14px] text-ui font-bold text-brand no-underline hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Request custom order →
            </Link>
          </div>
          <p className="collection-preview-note m-0 text-label text-taupe">A selection from our catalogue. Prices and availability are from the preview snapshot.</p>
        </div>
      </div>
      <dialog ref={dialog} aria-labelledby={dialogTitle} className="m-0 ml-auto h-dvh max-h-none w-[min(360px,100vw)] max-w-none overflow-y-auto border-0 bg-white p-[22px] font-text text-espresso backdrop:bg-espresso/40"
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="mb-[22px] flex items-center justify-between gap-4">
          <h2 id={dialogTitle} className="m-0 text-subhead font-medium">Filters</h2>
          <div className="flex items-center gap-4">
            <Link href={resetHref(handle)} className="text-ui font-bold text-espresso">Clear all</Link>
            <button type="button" aria-label="Close filters" onClick={() => dialog.current?.close()} className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-cream p-0">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <FilterFields {...props} id="mobile" />
      </dialog>
    </section>
  );
}
