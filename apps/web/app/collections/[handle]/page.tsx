import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/catalog";
import { categoryNames } from "@/lib/format";
export const dynamic = "force-dynamic";
type Query = Record<string, string | string[] | undefined>;
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Query>;
}) {
  const { handle } = await params;
  if (!Object.hasOwn(categoryNames, handle)) notFound();
  const query = await searchParams;
  const term = typeof query.q === "string" ? query.q.slice(0, 80) : "";
  const sort =
    typeof query.sort === "string" &&
    ["price-asc", "price-desc", "title"].includes(query.sort)
      ? query.sort
      : "featured";
  const page =
    typeof query.page === "string" && /^[1-9]\d{0,2}$/.test(query.page)
      ? query.page
      : "1";
  const data = await getProducts({
    ...(handle !== "all" ? { category: handle } : {}),
    ...(term ? { q: term } : {}),
    sort,
    page,
    limit: "20",
  });
  return (
    <section className="page-section collection-page">
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        {categoryNames[handle]}
      </div>
      <h1>{term ? "Results for “" + term + "”" : categoryNames[handle]}</h1>
      <form className="collection-toolbar" method="get">
        <div className="collection-search">
          <label htmlFor="collection-query" className="sr-only">
            Search this collection
          </label>
          <input
            id="collection-query"
            name="q"
            type="search"
            maxLength={80}
            placeholder="Search furniture"
            defaultValue={term}
          />
        </div>
        <span>{data.total} pieces</span>
        <label className="sort-label">
          Sort by
          <select name="sort" defaultValue={sort}>
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="title">Name: A–Z</option>
          </select>
        </label>
        <button className="button compact" type="submit">
          Apply
        </button>
      </form>
      <nav className="category-tabs" aria-label="Filter by category">
        {Object.entries(categoryNames).map(([key, name]) => (
          <Link
            href={"/collections/" + key}
            key={key}
            aria-current={key === handle ? "page" : undefined}
          >
            {name}
          </Link>
        ))}
      </nav>
      {data.products.length ? (
        <div className="product-grid">
          {data.products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>
            {term ? "No matching pieces" : "This collection is being prepared"}
          </h2>
          <p>
            {term
              ? "Try a different name or browse all furniture."
              : "More pieces will appear here as the catalogue is connected."}
          </p>
          <Link href="/collections/all" className="button">
            Browse all furniture
          </Link>
        </div>
      )}
      <div className="pagination">
        {data.page > 1 && (
          <Link
            href={
              "?" +
              new URLSearchParams({
                q: term,
                sort,
                page: String(data.page - 1),
              })
            }
          >
            Previous
          </Link>
        )}
        {data.total > data.page * data.limit && (
          <Link
            href={
              "?" +
              new URLSearchParams({
                q: term,
                sort,
                page: String(data.page + 1),
              })
            }
          >
            Next
          </Link>
        )}
      </div>
    </section>
  );
}
