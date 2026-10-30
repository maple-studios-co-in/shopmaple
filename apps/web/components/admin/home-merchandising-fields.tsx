"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { productListSchema, type HomeCollectionTile, type HomeMerchandising, type ProductList } from "@shopmaple/contracts";
import { resolveHomeMerchandising } from "../../lib/home-merchandising-defaults";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmptyState, Notice, Skeleton } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { CheckField, FieldGrid, MoveButtons, PanelHeader, Prose, RemoveButton, SectionHeading, rowCard } from "./kit";
import { MediaPicker } from "./media-picker";
import { SortableList } from "./sortable-list";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const rails = [{ key: "bestsellers", label: "Bestsellers" }, { key: "chairs", label: "Chairs" }] as const;
const tileGroups = [{ key: "categories", label: "Category", singular: "category" }, { key: "offers", label: "Offer", singular: "offer" }] as const;
const limit = 12;
const focusRing = "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60";
/** A tile row holds a block of fields: the row card stacked vertically. */
const tileCard = cn(rowCard, "grid items-stretch gap-4 p-4", focusRing);
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
  value?: HomeMerchandising;
  onChange: (value: HomeMerchandising) => void;
  session: StaffSession;
  onExpired: () => void;
}) {
  const current = useMemo(() => resolveHomeMerchandising(value), [value]);
  const send = useAdminRequest();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ query: "", page: 1 });
  const [results, setResults] = useState<ProductList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const expired = useRef(onExpired); expired.current = onExpired;
  const focusTargets = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  const keyCounter = useRef(0);

  useLayoutEffect(() => {
    if (pendingFocus.current) {
      focusTargets.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  }, [current]);
  const remember = (key: string) => (node: HTMLElement | null) => {
    if (node) focusTargets.current.set(key, node);
    else focusTargets.current.delete(key);
  };
  function update(next: HomeMerchandising, focus?: string) {
    pendingFocus.current = focus ?? null;
    onChange(next);
  }
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
      if (request === generation.current) setError(cause instanceof AdminRequestTimeout
        ? "Loading products timed out. Please try again."
        : "We couldn't load products. Please try again.");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load("", 1);
    return () => { generation.current++; };
  }, [send]);

  function editTile(group: "categories" | "offers", index: number, patch: Partial<HomeCollectionTile>) {
    update({ ...current, [group]: current[group].map((tile, i) => i === index ? { ...tile, ...patch } : tile) });
  }
  function addTile(group: "categories" | "offers") {
    if (current[group].length >= limit) return;
    let key: string;
    do { key = `tile-${++keyCounter.current}`; } while (current[group].some(tile => tile.key === key));
    update({ ...current, [group]: [...current[group], { key, title: "New collection", collectionHandle: "chairs", image: "", alt: "Collection image", enabled: false }] }, `${group}:${key}`);
  }

  const focusSearch = () => focusTargets.current.get("search")?.focus();

  return <section aria-label="Homepage merchandising">
    <PanelHeader title="Homepage merchandising" description="Choose products and collection tiles, then drag them into order or use the Move buttons. Save a draft, then ask a publisher to publish it." />
    <Notice tone="info" className="mb-8">Product availability is not verified here. Missing or unpublished products are omitted from the storefront; a product absent from search results may simply not match your search. Prices and stock remain managed by the catalog.</Notice>
    <div className="grid gap-8 lg:grid-cols-2">
      {rails.map(rail => <section key={rail.key} aria-label={`${rail.label} selection`} className="grid min-w-0 content-start gap-3">
        <SectionHeading className="mt-0 mb-0">{rail.label}<Count value={current[rail.key].length} /></SectionHeading>
        {current[rail.key].length === 0 && <EmptyState title="No products selected" action={
          <Button type="button" variant="outline" size="sm" aria-label={`Find products for ${rail.label}`} onClick={focusSearch}><Search aria-hidden="true" strokeWidth={1.5} />Find products</Button>
        }>Add products from the catalog below, or use Homepage section visibility to hide this section.</EmptyState>}
        <SortableList items={current[rail.key]} getId={handle => handle} getLabel={handle => `${handle} in ${rail.label}`}
          rowClassName={cn(rowCard, focusRing)}
          onReorder={next => update({ ...current, [rail.key]: next })}
          rowProps={handle => ({ tabIndex: -1, "aria-label": `Selected ${rail.label} ${handle}`, ref: remember(`${rail.key}:${handle}`) })}
          renderItem={(handle, index, grip) => <>
            {grip}
            <ProductName title={results?.products.find(product => product.handle === handle)?.title ?? handle} handle={handle} />
            <div className="flex items-center gap-0.5">
              {([-1, 1] as const).map(direction => <Button key={direction} type="button" variant="ghost" size="icon-sm"
                aria-label={`Move ${handle} ${direction === -1 ? "up" : "down"} in ${rail.label}`} title={direction === -1 ? "Move up" : "Move down"}
                disabled={index + direction < 0 || index + direction >= current[rail.key].length}
                onClick={() => {
                  const next = [...current[rail.key]];
                  [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
                  update({ ...current, [rail.key]: next }, `${rail.key}:${handle}`);
                }}>{direction === -1 ? <ChevronUp aria-hidden="true" strokeWidth={1.5} /> : <ChevronDown aria-hidden="true" strokeWidth={1.5} />}</Button>)}
              <RemoveButton label={`Remove ${handle} from ${rail.label}`} onClick={() => {
                const next = current[rail.key].filter(item => item !== handle);
                const neighbor = next[Math.min(index, next.length - 1)];
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
          <Input aria-label="Search catalog" ref={remember("search")} value={query} maxLength={80} className="h-10 bg-card text-sm" onChange={event => setQuery(event.currentTarget.value)} />
        </label>
        <Button type="submit" variant="outline" className="h-10"><Search aria-hidden="true" strokeWidth={1.5} />Search products</Button>
      </form>
      {busy && <div><Skeleton rows={3} /><p role="status" className="sr-only">Loading products…</p></div>}
      {error && <Notice tone="error" className="items-center justify-between">{error} <Button type="button" variant="outline" size="xs" onClick={() => void load(search.query, search.page)}>Retry products</Button></Notice>}
      {results && <>
        <p role="status" className="text-xs text-muted-foreground tabular-nums">{results.products.length === 0 ? "No products found. Try another search." : `${results.total} products · Page ${results.page}`}</p>
        {results.products.length > 0 && <ul className="grid gap-2">{results.products.map(product => <li key={product.handle} className={cn(rowCard, "flex-wrap")}>
          <ProductName title={product.title} handle={product.handle} />
          <div className="flex flex-wrap items-center gap-1.5">{rails.map(rail => {
            const selected = current[rail.key].includes(product.handle);
            return <Button key={rail.key} type="button" variant={selected ? "ghost" : "outline"} size="xs" aria-label={`Add ${product.handle} to ${rail.label}`}
              disabled={!product.published || selected || current[rail.key].length >= limit}
              onClick={() => {
                if (!product.published || current[rail.key].includes(product.handle) || current[rail.key].length >= limit) return;
                update({ ...current, [rail.key]: [...current[rail.key], product.handle] }, `${rail.key}:${product.handle}`);
              }}>{selected ? <Check aria-hidden="true" strokeWidth={1.5} /> : <Plus aria-hidden="true" strokeWidth={1.5} />}{rail.label}</Button>;
          })}</div>
        </li>)}</ul>}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={search.page <= 1} onClick={() => void load(search.query, search.page - 1)}><ChevronLeft aria-hidden="true" strokeWidth={1.5} />Previous products</Button>
          <Button type="button" variant="outline" size="sm" disabled={search.page * results.limit >= results.total} onClick={() => void load(search.query, search.page + 1)}>Next products<ChevronRight aria-hidden="true" strokeWidth={1.5} /></Button>
        </div>
      </>}
    </section>
    {tileGroups.map(group => <section key={group.key} aria-label={`${group.label} tiles`} className="mt-10 grid gap-3">
      <SectionHeading className="mt-0 mb-0" description="Use the collection handle from its store URL, such as chairs. Add an image and review the description before enabling a new tile.">{group.label} tiles<Count value={current[group.key].length} /></SectionHeading>
      {group.key === "offers" && <Prose className="text-xs">Offer artwork contains its visible marketing copy. The title identifies the tile here; the image description provides accessible text.</Prose>}
      {current[group.key].length === 0 && <EmptyState title="No tiles yet">Add a tile below, or use Homepage section visibility to hide this section.</EmptyState>}
      <SortableList items={current[group.key]} getId={tile => tile.key} getLabel={(_, index) => `${group.singular} tile ${index + 1}`} tag="div" rowTag="fieldset"
        rowClassName={tileCard}
        onReorder={next => update({ ...current, [group.key]: next })}
        rowProps={(_, index) => ({ "aria-label": `${group.label} tile ${index + 1}` })}
        renderItem={(tile, index, grip) => <>
        <legend className="sr-only">{group.label} tile {index + 1}</legend>
        <div className="-my-1 -ml-1 flex min-w-0 items-center gap-2">
          {grip}
          <span aria-hidden="true" className="text-sm font-semibold text-foreground">{group.label} tile {index + 1}</span>
          {!tile.enabled && <Badge variant="secondary" className="rounded-md border-0 bg-neutral-bg font-semibold text-neutral">Hidden</Badge>}
          <div className="ml-auto flex items-center gap-0.5">
            <MoveButtons name={`${group.singular} tile ${index + 1}`} index={index} length={current[group.key].length} onMove={direction => {
              const next = [...current[group.key]];
              [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
              update({ ...current, [group.key]: next }, `${group.key}:${tile.key}`);
            }} />
            <RemoveButton label={`Remove ${group.singular} tile ${index + 1}`} onClick={() => update({ ...current, [group.key]: current[group.key].filter(item => item.key !== tile.key) }, `add:${group.key}`)} />
          </div>
        </div>
        <FieldGrid ref={node => {
          const input = node?.querySelector("input");
          remember(`${group.key}:${tile.key}`)(input ?? null);
        }}>
          <Field label={`${group.label} tile ${index + 1} title`} value={tile.title} maxLength={120} onChange={title => editTile(group.key, index, { title })} />
          <Field label={`${group.label} tile ${index + 1} collection handle`} value={tile.collectionHandle} maxLength={200} onChange={collectionHandle => editTile(group.key, index, { collectionHandle })} />
          <Field label={`${group.label} tile ${index + 1} image description`} value={tile.alt} maxLength={200} onChange={alt => editTile(group.key, index, { alt })} />
        </FieldGrid>
        <MediaPicker label={`${group.label} tile ${index + 1} image`} value={tile.image} onChange={image => editTile(group.key, index, { image })} session={session} onExpired={onExpired} />
        <CheckField label="Show this tile" aria-label={`Show ${group.singular} tile ${index + 1}`} checked={tile.enabled} onChange={event => editTile(group.key, index, { enabled: event.currentTarget.checked })} />
      </>} />
      <div>
        <Button type="button" variant="outline" size="sm" ref={remember(`add:${group.key}`)} disabled={current[group.key].length >= limit} onClick={() => addTile(group.key)}><Plus aria-hidden="true" strokeWidth={1.5} />Add {group.singular} tile</Button>
      </div>
    </section>)}
  </section>;
}
