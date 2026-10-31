"use client";
import { useMemo, useRef, useState } from "react";
import type { HomeCollectionTile, HomeMerchandising, ProductList } from "@shopmaple/contracts";
import { resolveHomeMerchandising } from "../../lib/home-merchandising-defaults";
import { Check, ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState, Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import {
  ActionButton, CheckField, EditableList, FieldGrid, PanelHeader, Prose, RemoveButton, SectionHeading, focusRing, rowCard, swap, textFields, usePendingFocus,
} from "./kit";
import { MediaPicker } from "./media-picker";
import { ProductName, ProductSearch } from "./product-search";
import { SortableList } from "./sortable-list";

const rails = [{ key: "bestsellers", label: "Bestsellers" }, { key: "chairs", label: "Chairs" }] as const;
const tileGroups = [{ key: "categories", label: "Category", singular: "category" }, { key: "offers", label: "Offer", singular: "offer" }] as const;
const limit = 12;
function Count({ value }: { value: number }) {
  return <Badge variant="secondary" className="ml-2 rounded-md border-0 bg-neutral-bg align-middle font-semibold text-neutral tabular-nums">{value}/{limit}</Badge>;
}

export function HomeMerchandisingFields({ value, onChange, session, onExpired }: {
  value?: HomeMerchandising; onChange: (value: HomeMerchandising) => void; session: StaffSession; onExpired: () => void;
}) {
  const current = useMemo(() => resolveHomeMerchandising(value), [value]);
  const [results, setResults] = useState<ProductList | null>(null);
  const keyCounter = useRef(0);
  const focus = usePendingFocus(current), remember = focus.track;
  function update(next: HomeMerchandising, target?: string) { focus.focusAfter(target ?? null); onChange(next); }
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
    <ProductSearch className="mt-8" onResults={setResults} onExpired={onExpired} inputRef={remember("search")} actions={product => rails.map(rail => {
      const selected = current[rail.key].includes(product.handle);
      const blocked = !product.published || selected || current[rail.key].length >= limit;
      const add = () => update({ ...current, [rail.key]: [...current[rail.key], product.handle] }, `${rail.key}:${product.handle}`);
      return <ActionButton key={rail.key} icon={selected ? Check : Plus} variant={selected ? "ghost" : "outline"} size="xs"
        aria-label={`Add ${product.handle} to ${rail.label}`} disabled={blocked} onClick={add}>{rail.label}</ActionButton>;
    })} />
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
