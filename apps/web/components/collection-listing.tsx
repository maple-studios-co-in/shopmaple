"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Grid2X2,
  Grid3X3,
  SlidersHorizontal,
  X,
  Search,
} from "lucide-react";
import type { ProductCardModel } from "@/lib/product-card-model";
import { ProductCard } from "./product-card";
import {
  collectionHref,
  sortOptions,
  type CollectionQuery,
} from "@shopmaple/contracts";
import { categoryNames, money } from "@/lib/format";
const resetHref = (handle: string) =>
  `/collections/${handle}${handle === "chairs" ? "?page=1" : ""}`;

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
function FilterFields({
  handle,
  query,
  inStock,
  outOfStock,
  highestPrice,
  id,
}: Props & {
  id: string;
}) {
  return (
    <form
      action={`/collections/${handle}`}
      method="get"
      className="collection-filter-form"
    >
      <input type="hidden" name="sort" value={query.sort} />
      <details open={Boolean(query.q)} className="collection-facet">
        <summary>
          Search <Search size={15} />
        </summary>
        <label className="sr-only" htmlFor={`${id}-q`}>
          Search this collection
        </label>
        <input
          id={`${id}-q`}
          name="q"
          type="search"
          maxLength={80}
          placeholder="Search furniture"
          defaultValue={query.q}
        />
      </details>
      <details open className="collection-facet">
        <summary>
          Availability <ChevronDown size={15} />
        </summary>
        <label className="collection-check">
          <input
            type="radio"
            name="availability"
            value=""
            defaultChecked={!query.availability}
          />{" "}
          All items
        </label>
        <label className="collection-check">
          <input
            type="radio"
            name="availability"
            value="in"
            defaultChecked={query.availability === "in"}
          />{" "}
          Available to order <span>{inStock}</span>
        </label>
        <label className="collection-check">
          <input
            type="radio"
            name="availability"
            value="out"
            defaultChecked={query.availability === "out"}
          />{" "}
          Enquiry only <span>{outOfStock}</span>
        </label>
      </details>
      <details open className="collection-facet">
        <summary>
          Price <ChevronDown size={15} />
        </summary>
        <div className="collection-price-fields">
          <label>
            <span className="sr-only">Minimum price in rupees</span>
            <span aria-hidden="true">₹</span>
            <input
              aria-label="Minimum price in rupees"
              name="min"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              defaultValue={query.min}
            />
          </label>
          <span>to</span>
          <label>
            <span className="sr-only">Maximum price in rupees</span>
            <span aria-hidden="true">₹</span>
            <input
              aria-label="Maximum price in rupees"
              name="max"
              type="number"
              min="0"
              step="0.01"
              placeholder={
                highestPrice === null ? "Any price" : String(highestPrice / 100)
              }
              defaultValue={query.max}
            />
          </label>
        </div>
        <p className="collection-price-caption">
          {highestPrice === null
            ? "Prices available on request"
            : `The highest listed price is ${money(highestPrice)}`}
        </p>
      </details>
      {handle === "all" && (
        <details className="collection-facet" open={Boolean(query.category)}>
          <summary>
            Category <ChevronDown size={15} />
          </summary>
          <label className="sr-only" htmlFor={`${id}-category`}>
            Furniture category
          </label>
          <select
            id={`${id}-category`}
            name="category"
            defaultValue={query.category}
          >
            <option value="">All furniture</option>
            {Object.entries(categoryNames)
              .filter(([key]) => key !== "all")
              .map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
          </select>
        </details>
      )}
      <button className="button collection-apply" type="submit">
        Apply filters
      </button>
      <Link href={resetHref(handle)} className="collection-clear">
        Clear all
      </Link>
    </form>
  );
}
export function CollectionListing(props: Props) {
  const { handle, title, query, products, total, collectionTotal, limit } =
    props;
  const Heading = props.headingLevel ?? "h1";
  const dialog = useRef<HTMLDialogElement>(null);
  const [dense, setDense] = useState(false);
  const filtered = Boolean(
    query.q || query.min || query.max || query.category || query.availability,
  );
  return (
    <section id="collection-products" className="collection-parity" aria-label={title}>
      <header className="collection-heading">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>
        <Heading>{title}</Heading>
      </header>
      <div className="collection-parity-toolbar">
        <h2>Filters</h2>
        <button
          className="collection-mobile-filter"
          onClick={() => dialog.current?.showModal()}
        >
          <SlidersHorizontal size={18} /> Filter
        </button>
        <p className="collection-item-count" aria-live="polite">
          {total} items <span>in preview</span>
        </p>
        <form
          action={`/collections/${handle}`}
          method="get"
          className="collection-sort"
        >
          {Object.entries(query)
            .filter(([key, value]) => !["page", "sort"].includes(key) && value)
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <label htmlFor="collection-sort">Sort</label>
          <select
            id="collection-sort"
            name="sort"
            defaultValue={query.sort}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {sortOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <noscript>
            <button type="submit">Apply sort</button>
          </noscript>
        </form>
        <div
          className="collection-density"
          role="group"
          aria-label="Product grid size"
        >
          <button
            aria-label="Standard grid"
            aria-pressed={!dense}
            onClick={() => setDense(false)}
          >
            <Grid2X2 size={19} />
          </button>
          <button
            aria-label="Compact grid"
            aria-pressed={dense}
            onClick={() => setDense(true)}
          >
            <Grid3X3 size={19} />
          </button>
        </div>
      </div>
      <div className="collection-parity-layout">
        <aside
          className="collection-desktop-filters"
          aria-label="Collection filters"
        >
          <FilterFields {...props} id="desktop" />
        </aside>
        <div className="collection-results" id="collection-results">
          {filtered && (
            <div className="collection-applied" aria-label="Applied filters">
              <p className="collection-filter-summary">
                {total} of {collectionTotal} pieces
              </p>
              <div>
                {(
                  [
                    ["q", query.q ? `Search: ${query.q}` : "", "search"],
                    [
                      "availability",
                      query.availability
                        ? query.availability === "in"
                          ? "Available to order"
                          : "Enquiry only"
                        : "",
                      "availability",
                    ],
                    [
                      "min",
                      query.min ? `From ${money(Number(query.min) * 100)}` : "",
                      "minimum price",
                    ],
                    [
                      "max",
                      query.max
                        ? `Up to ${money(Number(query.max) * 100)}`
                        : "",
                      "maximum price",
                    ],
                    [
                      "category",
                      query.category ? categoryNames[query.category] : "",
                      "category",
                    ],
                  ] as const
                )
                  .filter(([, label]) => label)
                  .map(([key, label, name]) => (
                    <Link
                      className="collection-filter-chip"
                      key={key}
                      href={collectionHref(handle, { ...query, [key]: "" })}
                      aria-label={`Remove ${name} filter`}
                    >
                      {label}
                      <X size={13} aria-hidden="true" />
                    </Link>
                  ))}
                <Link className="collection-reset" href={resetHref(handle)}>
                  Clear all
                </Link>
              </div>
            </div>
          )}
          {products.length ? (
            <div
              className={`product-grid collection-products${dense ? " is-compact" : ""}`}
            >
              {products.map((product) => (
                <ProductCard key={product.id} product={product} imageSizes={dense
                  ? "(max-width:749px) calc((100vw - 40px) / 2), (max-width:1100px) calc((100vw - 306px) / 5), (min-width:1920px) 309.6px, calc((100vw - 372px) / 5)"
                  : "(max-width:749px) calc((100vw - 44px) / 2), (max-width:1100px) calc((100vw - 274px) / 2), (max-width:1599px) calc((100vw - 356px) / 3), (min-width:1920px) 387px, calc((100vw - 372px) / 4)"} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>
                {filtered
                  ? "No matching pieces"
                  : "More pieces are on their way"}
              </h2>
              <p>
                {filtered
                  ? "Try a different search or clear your filters."
                  : "This collection has no products in the current preview."}
              </p>
              <Link
                className="button"
                href={filtered ? resetHref(handle) : "/collections/all"}
              >
                {filtered ? "Clear filters" : "Browse all furniture"}
              </Link>
            </div>
          )}
          {total > limit && (
            <nav
              className="pagination collection-pagination"
              aria-label="Collection pages"
            >
              {query.page > 1 && (
                <Link href={collectionHref(handle, query, query.page - 1)}>
                  Previous
                </Link>
              )}
              <span>
                Page {query.page} of {Math.ceil(total / limit)}
              </span>
              {total > query.page * limit && (
                <Link href={collectionHref(handle, query, query.page + 1)}>
                  Next
                </Link>
              )}
            </nav>
          )}
          <p className="collection-preview-note">
            A selection from our catalogue. Prices and availability are from the
            preview snapshot.
          </p>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="collection-filter-dialog"
        aria-labelledby="collection-filter-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="collection-filter-dialog-content">
          <div className="collection-filter-dialog-heading">
            <h2 id="collection-filter-title">Filter</h2>
            <button
              aria-label="Close filters"
              onClick={() => dialog.current?.close()}
            >
              <X size={22} />
            </button>
          </div>
          <FilterFields {...props} id="mobile" />
        </div>
      </dialog>
    </section>
  );
}
