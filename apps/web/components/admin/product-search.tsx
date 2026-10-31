"use client";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { productListSchema, type Product, type ProductList } from "@shopmaple/contracts";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Notice, Skeleton } from "./crm-primitives";
import { ActionButton, SectionHeading, rowCard, useLatest } from "./kit";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const pageSize = 20;

/** A product's title over its handle, as product rows in the admin show it. */
export function ProductName({ title, handle }: { title: string; handle: string }) {
  return <div className="min-w-0 flex-1">
    <strong className="block truncate text-sm font-medium text-foreground">{title}</strong>
    <p className="truncate text-xs text-muted-foreground tabular-nums">{handle}</p>
  </div>;
}

/**
 * The catalogue search the merchandising screens pick products from: a bounded query, twenty
 * products a page, retry on failure, and a newer search always wins over an older response.
 * `actions` renders each result's buttons; `onResults` hears every page that loads.
 */
export function ProductSearch({ actions, onResults, onExpired, inputRef, className }: {
  actions: (product: Product) => ReactNode; onResults?: (results: ProductList | null) => void; onExpired: () => void;
  inputRef?: Ref<HTMLInputElement>; className?: string;
}) {
  const send = useAdminRequest();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ query: "", page: 1 });
  const [results, setResults] = useState<ProductList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0), expired = useLatest(onExpired), heard = useLatest(onResults);
  useEffect(() => { heard.current?.(results); }, [results, heard]);
  async function load(term: string, page: number) {
    const request = ++generation.current;
    setSearch({ query: term, page });
    setBusy(true); setError(""); setResults(null);
    try {
      const response = await send(`/api/products?q=${encodeURIComponent(term)}&page=${page}&limit=${pageSize}`, { cache: "no-store", credentials: "same-origin" });
      if (request !== generation.current) return;
      if (response.status === 401) { expired.current(); return; }
      if (!response.ok) throw new Error("Catalog unavailable");
      const parsed = productListSchema.parse(await response.json());
      if (request !== generation.current) return;
      if (parsed.page !== page || parsed.limit !== pageSize || parsed.total < 0 || parsed.products.length > pageSize) throw new Error("Invalid catalog page");
      setResults(parsed);
    } catch (cause) {
      if (request === generation.current) {
        setError(cause instanceof AdminRequestTimeout ? "Loading products timed out. Please try again." : "We couldn't load products. Please try again.");
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  useEffect(() => { void load("", 1); return () => { generation.current++; }; }, [send]);

  return <section aria-label="Product catalog" aria-busy={busy} className={cn("grid gap-3 rounded-xl border border-line-soft bg-surface p-4 sm:p-5", className)}>
    <SectionHeading className="mt-0 mb-0">Find products</SectionHeading>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void load(query.trim().slice(0, 80), 1); }}>
      <label className="grid min-w-0 flex-1 basis-60 gap-2">
        <span className="text-xs font-medium text-foreground">Search catalog</span>
        <Input aria-label="Search catalog" ref={inputRef} value={query} maxLength={80} className="h-10 bg-card text-sm"
          onChange={event => setQuery(event.currentTarget.value)} />
      </label>
      <Button type="submit" variant="outline" className="h-10"><Search aria-hidden="true" strokeWidth={1.5} />Search products</Button>
    </form>
    {busy && <div><Skeleton rows={3} /><p role="status" className="sr-only">Loading products…</p></div>}
    {error && <Notice tone="error" className="items-center justify-between">
      {error} <Button type="button" variant="outline" size="xs" onClick={() => void load(search.query, search.page)}>Retry products</Button>
    </Notice>}
    {results && <>
      <p role="status" className="text-xs text-muted-foreground tabular-nums">
        {results.products.length === 0 ? "No products found. Try another search." : `${results.total} products · Page ${results.page}`}
      </p>
      {results.products.length > 0 && <ul className="grid gap-2">{results.products.map(product => <li key={product.handle} className={cn(rowCard, "flex-wrap")}>
        <ProductName title={product.title} handle={product.handle} />
        <div className="flex flex-wrap items-center gap-1.5">{actions(product)}</div>
      </li>)}</ul>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ActionButton icon={ChevronLeft} disabled={search.page <= 1} onClick={() => void load(search.query, search.page - 1)}>Previous products</ActionButton>
        <Button type="button" variant="outline" size="sm" disabled={search.page * results.limit >= results.total}
          onClick={() => void load(search.query, search.page + 1)}>Next products<ChevronRight aria-hidden="true" strokeWidth={1.5} />
        </Button>
      </div>
    </>}
  </section>;
}
