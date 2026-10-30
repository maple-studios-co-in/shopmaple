"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { productListSchema, type HomeCollectionTile, type HomeMerchandising, type ProductList } from "@shopmaple/contracts";
import { resolveHomeMerchandising } from "../../lib/home-merchandising-defaults";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmptyState, Notice, Skeleton } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import {
  ActionButton, CheckField, EditableList, FieldGrid, PanelHeader, Prose, RemoveButton, SectionHeading, focusRing, rowCard, swap, textFields, useLatest, usePendingFocus,
} from "./kit";
import { MediaPicker } from "./media-picker";
import { SortableList } from "./sortable-list";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const rails = [{ key: "bestsellers", label: "Bestsellers" }, { key: "chairs", label: "Chairs" }] as const;
const tileGroups = [{ key: "categories", label: "Category", singular: "category" }, { key: "offers", label: "Offer", singular: "offer" }] as const;
const limit = 12;
function Count({ value }: { value: number }) {
  return <Badge variant="secondary" className="ml-2 rounded-md border-0 bg-neutral-bg align-middle font-semibold text-neutral tabular-nums">{value}/{limit}</Badge>;
}
function ProductName({ title, handle }: { title: string; handle: string }) {
  return <div className="min-w-0 flex-1">
    <strong className="block truncate text-sm font-medium text-foreground">{title}</strong>
    <p className="truncate text-xs text-muted-foreground tabular-nums">{handle}</p>
  </div>;
}

export function HomeMerchandisingFields({ value, onChange, session, onExpired }: {
  value?: HomeMerchandising; onChange: (value: HomeMerchandising) => void; session: StaffSession; onExpired: () => void;
}) {
  const current = useMemo(() => resolveHomeMerchandising(value), [value]);
  const send = useAdminRequest();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ query: "", page: 1 });
  const [results, setResults] = useState<ProductList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0), keyCounter = useRef(0), expired = useLatest(onExpired);
  const focus = usePendingFocus(current), remember = focus.track;
  function update(next: HomeMerchandising, target?: string) { focus.focusAfter(target ?? null); onChange(next); }
  async function load(term: string, page: number) {
    const request = ++generation.current;
    setSearch({ query: term, page });
    setBusy(true); setError(""); setResults(null);
    try {
      const response = await send(`/api/products?q=${encodeURIComponent(term)}&page=${page}&limit=20`, { cache: "no-store", credentials: "same-origin" });
      if (request !== generation.current) return;
      if (response.status === 401) { expired.current(); return; }
      if (!response.ok) throw new Error("Catalog unavailable");
      const parsed = productListSchema.parse(await response.json());
      if (request !== generation.current) return;
      if (parsed.page !== page || parsed.limit !== 20 || parsed.total < 0 || parsed.products.length > 20) throw new Error("Invalid catalog page");
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
  function newTile(group: "categories" | "offers"): HomeCollectionTile {
    let key: string;
    do { key = `tile-${++keyCounter.current}`; } while (current[group].some(tile => tile.key === key));
    return { key, title: "New collection", collectionHandle: "chairs", image: "", alt: "Collection image", enabled: false };
  }

  return <section aria-label="Homepage merchandising">
    <PanelHeader title="Homepage merchandising"
      description="Choose products and collection tiles, then drag them into order or use the Move buttons. Save a draft, then ask a publisher to publish it." />
    <Notice tone="info" className="mb-8">
      Product availability is not verified here. Missing or unpublished products are omitted from the storefront; a product absent from search results
      may simply not match your search. Prices and stock remain managed by the catalog.
    </Notice>
    <div className="grid gap-8 lg:grid-cols-2">
      {rails.map(rail => <section key={rail.key} aria-label={`${rail.label} selection`} className="grid min-w-0 content-start gap-3">
        <SectionHeading className="mt-0 mb-0">{rail.label}<Count value={current[rail.key].length} /></SectionHeading>
        {current[rail.key].length === 0 && <EmptyState title="No products selected" action={
          <ActionButton icon={Search} aria-label={`Find products for ${rail.label}`} onClick={() => focus.focus("search")}>Find products</ActionButton>
        }>Add products from the catalog below, or use Homepage section visibility to hide this section.</EmptyState>}
        <SortableList items={current[rail.key]} getId={handle => handle} getLabel={handle => `${handle} in ${rail.label}`}
          rowClassName={cn(rowCard, focusRing)} onReorder={next => update({ ...current, [rail.key]: next })}
          rowProps={handle => ({ tabIndex: -1, "aria-label": `Selected ${rail.label} ${handle}`, ref: remember(`${rail.key}:${handle}`) })}
          renderItem={(handle, index, grip) => <>
            {grip}
            <ProductName title={results?.products.find(product => product.handle === handle)?.title ?? handle} handle={handle} />
            <div className="flex items-center gap-0.5">
              {([-1, 1] as const).map(direction => <Button key={direction} type="button" variant="ghost" size="icon-sm"
                aria-label={`Move ${handle} ${direction === -1 ? "up" : "down"} in ${rail.label}`} title={direction === -1 ? "Move up" : "Move down"}
                disabled={index + direction < 0 || index + direction >= current[rail.key].length}
                onClick={() => update({ ...current, [rail.key]: swap(current[rail.key], index, direction) }, `${rail.key}:${handle}`)}>
                {direction === -1 ? <ChevronUp aria-hidden="true" strokeWidth={1.5} /> : <ChevronDown aria-hidden="true" strokeWidth={1.5} />}
              </Button>)}
              <RemoveButton label={`Remove ${handle} from ${rail.label}`} onClick={() => {
                const next = current[rail.key].filter(item => item !== handle), neighbor = next[Math.min(index, next.length - 1)];
                update({ ...current, [rail.key]: next }, neighbor ? `${rail.key}:${neighbor}` : "search");
              }} />
            </div>
          </>}
        />
      </section>)}
    </div>
    <section aria-label="Product catalog" aria-busy={busy} className="mt-8 grid gap-3 rounded-xl border border-line-soft bg-surface p-4 sm:p-5">
      <SectionHeading className="mt-0 mb-0">Find products</SectionHeading>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void load(query.trim().slice(0, 80), 1); }}>
        <label className="grid min-w-0 flex-1 basis-60 gap-2">
          <span className="text-xs font-medium text-foreground">Search catalog</span>
          <Input aria-label="Search catalog" ref={remember("search")} value={query} maxLength={80} className="h-10 bg-card text-sm"
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
          <div className="flex flex-wrap items-center gap-1.5">{rails.map(rail => {
            const selected = current[rail.key].includes(product.handle);
            const blocked = !product.published || selected || current[rail.key].length >= limit;
            const add = () => update({ ...current, [rail.key]: [...current[rail.key], product.handle] }, `${rail.key}:${product.handle}`);
            return <ActionButton key={rail.key} icon={selected ? Check : Plus} variant={selected ? "ghost" : "outline"} size="xs"
              aria-label={`Add ${product.handle} to ${rail.label}`} disabled={blocked} onClick={add}>{rail.label}</ActionButton>;
          })}</div>
        </li>)}</ul>}
        <div className="flex items-center justify-end gap-2">
          <ActionButton icon={ChevronLeft} disabled={search.page <= 1} onClick={() => void load(search.query, search.page - 1)}>Previous products</ActionButton>
          <Button type="button" variant="outline" size="sm" disabled={search.page * results.limit >= results.total}
            onClick={() => void load(search.query, search.page + 1)}>Next products<ChevronRight aria-hidden="true" strokeWidth={1.5} />
          </Button>
        </div>
      </>}
    </section>
    {tileGroups.map(group => <section key={group.key} aria-label={`${group.label} tiles`} className="mt-10 grid gap-3">
      <SectionHeading className="mt-0 mb-0"
        description="Use the collection handle from its store URL, such as chairs. Add an image and review the description before enabling a new tile.">
        {group.label} tiles<Count value={current[group.key].length} />
      </SectionHeading>
      {group.key === "offers" && <Prose className="text-xs">
        Offer artwork contains its visible marketing copy. The title identifies the tile here; the image description provides accessible text.
      </Prose>}
      {current[group.key].length === 0 && <EmptyState title="No tiles yet">Add a tile below, or use Homepage section visibility to hide this section.</EmptyState>}
      <EditableList name={`${group.label} tile`} items={current[group.key]} identity={tile => tile.key} create={() => newTile(group.key)} max={limit}
        fieldset focusInput removeFocus="add" onChange={next => update({ ...current, [group.key]: next })}
        badge={tile => !tile.enabled && <Badge variant="secondary" className="rounded-md border-0 bg-neutral-bg font-semibold text-neutral">Hidden</Badge>}
        render={(tile, index, edit) => {
          const name = `${group.label} tile ${index + 1}`, patch = (next: Partial<HomeCollectionTile>) => edit({ ...tile, ...next });
          return <>
            <FieldGrid>
              {textFields(tile, [
                ["title", `${name} title`, 120], ["collectionHandle", `${name} collection handle`, 200], ["alt", `${name} image description`, 200],
              ], edit)}
            </FieldGrid>
            <MediaPicker label={`${name} image`} value={tile.image} onChange={image => patch({ image })} session={session} onExpired={onExpired} />
            <CheckField label="Show this tile" aria-label={`Show ${group.singular} tile ${index + 1}`} checked={tile.enabled}
              onChange={event => patch({ enabled: event.currentTarget.checked })} />
          </>;
        }} />
    </section>)}
  </section>;
}
