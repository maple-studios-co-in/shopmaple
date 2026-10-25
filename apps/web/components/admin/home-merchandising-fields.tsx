"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { productListSchema, type HomeCollectionTile, type HomeMerchandising, type ProductList } from "@shopmaple/contracts";
import { resolveHomeMerchandising } from "../../lib/home-merchandising-defaults";
import type { StaffSession } from "./dashboard";
import { Field } from "./forms";
import { MediaPicker } from "./media-picker";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const rails = [{ key: "bestsellers", label: "Bestsellers" }, { key: "chairs", label: "Chairs" }] as const;
const tileGroups = [{ key: "categories", label: "Category", singular: "category" }, { key: "offers", label: "Offer", singular: "offer" }] as const;
const limit = 12;

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

  return <section className="admin-home-merchandising" aria-label="Homepage merchandising">
    <h2>Homepage merchandising</h2>
    <p>Choose and order products and collection tiles. Save a draft, then ask a publisher to publish it.</p>
    <p>Product availability is not verified here. Missing or unpublished products are omitted from the storefront; a product absent from search results may simply not match your search. Prices and stock remain managed by the catalog.</p>
    {rails.map(rail => <section key={rail.key} aria-label={`${rail.label} selection`}>
      <h3>{rail.label} · {current[rail.key].length}/{limit}</h3>
      {current[rail.key].length === 0 && <p>No products selected. Use Homepage section visibility to hide this section.</p>}
      <ol className="admin-section-list">
        {current[rail.key].map((handle, index) => <li key={handle} tabIndex={-1} aria-label={`Selected ${rail.label} ${handle}`} ref={remember(`${rail.key}:${handle}`)}>
          <div><strong>{results?.products.find(product => product.handle === handle)?.title ?? handle}</strong><p>{handle}</p></div>
          <div className="admin-actions">
            {([-1, 1] as const).map(direction => <button key={direction} type="button"
              aria-label={`Move ${handle} ${direction === -1 ? "up" : "down"} in ${rail.label}`}
              disabled={index + direction < 0 || index + direction >= current[rail.key].length}
              onClick={() => {
                const next = [...current[rail.key]];
                [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
                update({ ...current, [rail.key]: next }, `${rail.key}:${handle}`);
              }}>{direction === -1 ? "Move up" : "Move down"}</button>)}
            <button type="button" aria-label={`Remove ${handle} from ${rail.label}`} onClick={() => {
              const next = current[rail.key].filter(item => item !== handle);
              const neighbor = next[Math.min(index, next.length - 1)];
              update({ ...current, [rail.key]: next }, neighbor ? `${rail.key}:${neighbor}` : "search");
            }}>Remove</button>
          </div>
        </li>)}
      </ol>
    </section>)}
    <section aria-label="Product catalog" aria-busy={busy}>
      <h3>Find products</h3>
      <form onSubmit={event => { event.preventDefault(); void load(query.trim().slice(0, 80), 1); }}>
        <label className="admin-field"><span>Search catalog</span><input aria-label="Search catalog" ref={remember("search")} value={query} maxLength={80} onInput={event => setQuery(event.currentTarget.value)} /></label>
        <button type="submit">Search products</button>
      </form>
      {busy && <p role="status">Loading products…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void load(search.query, search.page)}>Retry products</button></p>}
      {results && <>
        <p role="status">{results.products.length === 0 ? "No products found. Try another search." : `${results.total} products · Page ${results.page}`}</p>
        <ul className="admin-section-list">{results.products.map(product => <li key={product.handle}>
          <div><strong>{product.title}</strong><p>{product.handle}</p></div>
          <div className="admin-actions">{rails.map(rail => <button key={rail.key} type="button" aria-label={`Add ${product.handle} to ${rail.label}`}
            disabled={!product.published || current[rail.key].includes(product.handle) || current[rail.key].length >= limit}
            onClick={() => {
              if (!product.published || current[rail.key].includes(product.handle) || current[rail.key].length >= limit) return;
              update({ ...current, [rail.key]: [...current[rail.key], product.handle] }, `${rail.key}:${product.handle}`);
            }}>{current[rail.key].includes(product.handle) ? `Selected in ${rail.label}` : `Add to ${rail.label}`}</button>)}</div>
        </li>)}</ul>
        <div className="admin-actions">
          <button type="button" disabled={search.page <= 1} onClick={() => void load(search.query, search.page - 1)}>Previous products</button>
          <button type="button" disabled={search.page * results.limit >= results.total} onClick={() => void load(search.query, search.page + 1)}>Next products</button>
        </div>
      </>}
    </section>
    {tileGroups.map(group => <section key={group.key} aria-label={`${group.label} tiles`}>
      <h3>{group.label} tiles · {current[group.key].length}/{limit}</h3>
      <p>Use the collection handle from its store URL, such as chairs. Add an image and review the description before enabling a new tile.</p>
      {group.key === "offers" && <p>Offer artwork contains its visible marketing copy. The title identifies the tile here; the image description provides accessible text.</p>}
      {current[group.key].length === 0 && <p>No tiles selected. Use Homepage section visibility to hide this section.</p>}
      {current[group.key].map((tile, index) => <fieldset key={tile.key} aria-label={`${group.label} tile ${index + 1}`}>
        <legend>{group.label} tile {index + 1}</legend>
        <div className="admin-fields" ref={node => {
          const input = node?.querySelector("input");
          remember(`${group.key}:${tile.key}`)(input ?? null);
        }}>
          <Field label={`${group.label} tile ${index + 1} title`} value={tile.title} maxLength={120} onChange={title => editTile(group.key, index, { title })} />
          <Field label={`${group.label} tile ${index + 1} collection handle`} value={tile.collectionHandle} maxLength={200} onChange={collectionHandle => editTile(group.key, index, { collectionHandle })} />
          <Field label={`${group.label} tile ${index + 1} image description`} value={tile.alt} maxLength={200} onChange={alt => editTile(group.key, index, { alt })} />
        </div>
        <MediaPicker label={`${group.label} tile ${index + 1} image`} value={tile.image} onChange={image => editTile(group.key, index, { image })} session={session} onExpired={onExpired} />
        <label className="admin-check"><input type="checkbox" aria-label={`Show ${group.singular} tile ${index + 1}`} checked={tile.enabled} onChange={event => editTile(group.key, index, { enabled: event.currentTarget.checked })} />Show this tile</label>
        <div className="admin-actions">
          {([-1, 1] as const).map(direction => <button key={direction} type="button" aria-label={`Move ${group.singular} tile ${index + 1} ${direction === -1 ? "up" : "down"}`} disabled={index + direction < 0 || index + direction >= current[group.key].length} onClick={() => {
            const next = [...current[group.key]];
            [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
            update({ ...current, [group.key]: next }, `${group.key}:${tile.key}`);
          }}>{direction === -1 ? "Move up" : "Move down"}</button>)}
          <button type="button" aria-label={`Remove ${group.singular} tile ${index + 1}`} onClick={() => update({ ...current, [group.key]: current[group.key].filter(item => item.key !== tile.key) }, `add:${group.key}`)}>Remove tile</button>
        </div>
      </fieldset>)}
      <button type="button" ref={remember(`add:${group.key}`)} disabled={current[group.key].length >= limit} onClick={() => addTile(group.key)}>Add {group.singular} tile</button>
    </section>)}
  </section>;
}
