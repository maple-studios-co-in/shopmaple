"use client";
import { useId, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { toProductCard, type ProductHighlights, type ProductList } from "@shopmaple/contracts";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Palette, Plus, Search, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EmptyState } from "./crm-primitives";
import { DataTable } from "./data-table";
import { ActionButton, Hint, PanelHeader, RemoveButton, SectionHeading, rowCard, usePendingFocus } from "./kit";
import { ProductName, ProductSearch } from "./product-search";

type Swatch = ProductHighlights["swatches"][number];
type Highlight = ProductHighlights["products"][number];
type Rating = NonNullable<Highlight["rating"]>;
/** What staff typed into a product's two rating fields, kept as text so "4." can become "4.6". */
type RatingText = { value: string; count: string };

const swatchLimit = 200, productLimit = 300, suggestionLimit = 24;
const empty: ProductHighlights = { swatches: [], products: [] };
const hexPattern = /^#[0-9a-fA-F]{6}$/;
const nameKey = (name: string) => name.trim().toLowerCase();

/** The message the editor shows when a save is blocked by this screen's fields. */
export const highlightsSaveMessage = "Check product highlights: fix the colours or ratings marked on the Product highlights screen, then save again.";

/*
 * A rating is optional, but an average needs a count and a count needs an average. A half-entered
 * or malformed rating is kept in the draft as NaN, which the content schema rejects, so the editor
 * cannot save it; the fields say what is missing.
 */
function averageFrom(text: string) {
  const value = text.trim();
  return /^\d(\.\d)?$/.test(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : NaN;
}
function countFrom(text: string) {
  const value = text.trim();
  return /^\d{1,6}$/.test(value) && Number(value) >= 1 && Number(value) <= 100_000 ? Number(value) : NaN;
}
function ratingFrom(text: RatingText): Rating | null {
  if (!text.value.trim() && !text.count.trim()) return null;
  return { value: averageFrom(text.value), count: countFrom(text.count) };
}
function textFrom(rating: Rating | null): RatingText {
  if (!rating) return { value: "", count: "" };
  return { value: Number.isFinite(rating.value) ? rating.value.toFixed(1) : "", count: Number.isFinite(rating.count) ? String(rating.count) : "" };
}
const sameRating = (a: Rating | null, b: Rating | null) => a === b || (a !== null && b !== null && Object.is(a.value, b.value) && Object.is(a.count, b.count));
function averageError({ value, count }: RatingText) {
  const text = value.trim();
  if (!text) return count.trim() ? "Enter the average rating too." : "";
  if (!/^\d+(\.\d+)?$/.test(text)) return "Use an average from 1.0 to 5.0 with one decimal, such as 4.6.";
  if (/\.\d{2,}$/.test(text)) return "Use one decimal, such as 4.6.";
  return Number.isNaN(averageFrom(text)) ? "Use an average from 1.0 to 5.0." : "";
}
function countError({ value, count }: RatingText) {
  if (!count.trim()) return value.trim() ? "Enter the review count too." : "";
  return Number.isNaN(countFrom(count)) ? "Use a whole number of reviews from 1 to 100,000." : "";
}
function nameError(swatches: Swatch[], index: number) {
  const key = nameKey(swatches[index]!.name);
  if (!key) return "Enter the option name as the product shows it, such as Deep Atlantic.";
  const first = swatches.findIndex((swatch) => nameKey(swatch.name) === key);
  return first < index ? `${swatches[index]!.name.trim()} already has a colour in row ${first + 1}.` : "";
}
const hexError = (hex: string) => hexPattern.test(hex) ? "" : "Use a hex colour such as #1f4e5f.";

function Count({ value, limit }: { value: number; limit: number }) {
  return <Badge variant="secondary" className="ml-2 rounded-md border-0 bg-neutral-bg align-middle font-semibold text-neutral tabular-nums">{value}/{limit}</Badge>;
}
function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return children ? <p id={id} data-field-error className="text-xs font-medium text-danger">{children}</p> : null;
}
/** A small labelled control inside a row; the input's own aria-label names it fully for assistive technology. */
function RowField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={cn("grid min-w-0 gap-1.5", className)}>
    <span className="text-2xs font-medium text-muted-foreground">{label}</span>
    {children}
  </label>;
}
function invalidProps(id: string, error: string, extra?: string): Pick<ComponentProps<"input">, "aria-invalid" | "aria-describedby"> {
  const ids = [extra, error ? id : ""].filter(Boolean).join(" ");
  return { "aria-invalid": error ? true : undefined, "aria-describedby": ids || undefined };
}

export function ProductHighlightsFields({ value, onChange, onExpired }: {
  value?: ProductHighlights; onChange: (value: ProductHighlights) => void; onExpired: () => void;
}) {
  const current = value ?? empty;
  const id = useId();
  const helpId = `${id}-rating-help`;
  const [results, setResults] = useState<ProductList | null>(null);
  /** Titles of products seen in catalogue results, so table rows can show more than a handle. */
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [ratingText, setRatingText] = useState<Record<string, RatingText>>({});
  const focus = usePendingFocus<string>(current);
  function update(next: Partial<ProductHighlights>, target?: string) {
    focus.focusAfter(target ?? null);
    onChange({ ...current, ...next });
  }
  function heard(list: ProductList | null) {
    setResults(list);
    if (list?.products.length) setTitles((known) => ({ ...known, ...Object.fromEntries(list.products.map((product) => [product.handle, product.title])) }));
  }

  // Colours
  const swatches = current.swatches;
  const patchSwatch = (index: number, patch: Partial<Swatch>) => update({ swatches: swatches.map((swatch, i) => (i === index ? { ...swatch, ...patch } : swatch)) });
  const addSwatch = (name = "", target = "name") => update({ swatches: [...swatches, { name, hex: "#808080" }] }, `swatch:${swatches.length}:${target}`);
  const suggestions = useMemo(() => {
    const taken = new Set(swatches.map((swatch) => nameKey(swatch.name)));
    const names: string[] = [];
    for (const product of results?.products ?? []) {
      for (const name of toProductCard(product).optionNames) {
        if (!taken.has(nameKey(name))) { taken.add(nameKey(name)); names.push(name); }
      }
    }
    return names.slice(0, suggestionLimit);
  }, [results, swatches]);

  // Products
  const products = current.products;
  const textFor = (product: Highlight) => {
    const typed = ratingText[product.handle];
    return typed && sameRating(ratingFrom(typed), product.rating) ? typed : textFrom(product.rating);
  };
  function setRating(product: Highlight, patch: Partial<RatingText>) {
    const typed = { ...textFor(product), ...patch };
    setRatingText((all) => ({ ...all, [product.handle]: typed }));
    update({ products: products.map((item) => (item.handle === product.handle ? { ...item, rating: ratingFrom(typed) } : item)) });
  }
  function removeProduct(index: number) {
    const next = products.filter((_, i) => i !== index), neighbour = next[index];
    update({ products: next }, neighbour ? `product:${neighbour.handle}` : "search");
  }
  const columns: ColumnDef<Highlight>[] = [
    { id: "product", header: "Product", enableSorting: false, meta: { className: "min-w-40" },
      cell: ({ row }) => <ProductName title={titles[row.original.handle] ?? row.original.handle} handle={row.original.handle} /> },
    { id: "new", header: "New badge", enableSorting: false, meta: { className: "w-20" },
      cell: ({ row }) => <Switch aria-label={`New badge for ${row.original.handle}`} ref={focus.track(`product:${row.original.handle}`)} checked={row.original.isNew}
        onCheckedChange={(isNew) => update({ products: products.map((item) => (item.handle === row.original.handle ? { ...item, isNew } : item)) })} /> },
    { id: "average", header: "Average rating", enableSorting: false, meta: { className: "w-28" },
      cell: ({ row }) => {
        const typed = textFor(row.original), error = averageError(typed), errorId = `${id}-${row.original.handle}-average`;
        return <div className="grid gap-1.5">
          <Input aria-label={`Average rating for ${row.original.handle}`} inputMode="decimal" placeholder="4.6" maxLength={4} value={typed.value}
            {...invalidProps(errorId, error, helpId)} className="h-9 w-20 bg-card text-sm tabular-nums"
            onChange={(event) => setRating(row.original, { value: event.currentTarget.value })} />
          <FieldError id={errorId}>{error}</FieldError>
        </div>;
      } },
    { id: "count", header: "Review count", enableSorting: false, meta: { className: "w-28" },
      cell: ({ row }) => {
        const typed = textFor(row.original), error = countError(typed), errorId = `${id}-${row.original.handle}-count`;
        return <div className="grid gap-1.5">
          <Input aria-label={`Review count for ${row.original.handle}`} inputMode="numeric" placeholder="12" maxLength={6} value={typed.count}
            {...invalidProps(errorId, error, helpId)} className="h-9 w-20 bg-card text-sm tabular-nums"
            onChange={(event) => setRating(row.original, { count: event.currentTarget.value })} />
          <FieldError id={errorId}>{error}</FieldError>
        </div>;
      } },
    { id: "remove", header: () => <span className="sr-only">Remove</span>, enableSorting: false, meta: { className: "w-12 text-right" },
      cell: ({ row }) => <RemoveButton label={`Remove ${row.original.handle} from product highlights`} onClick={() => removeProduct(row.index)} /> },
  ];

  return <section aria-label="Product highlights" className="grid gap-10">
    <PanelHeader className="mb-0" title="Product highlights" description="Colours and New badges for the product page and its &quot;More …&quot; row, and the rating on product cards. The product page itself rates a product only from approved buyer reviews (Reviews screen). Only what you set here is shown." />

    <section aria-label="Colours" className="grid min-w-0 content-start gap-3">
      <SectionHeading className="mt-0 mb-0" description="Give an option name a colour, exactly as the product's option is called, such as Deep Atlantic. A card shows a dot for each of its options that has a colour.">
        Colours<Count value={swatches.length} limit={swatchLimit} />
      </SectionHeading>
      {swatches.length === 0 && <EmptyState title="No colours yet" icon={<Palette strokeWidth={1.5} />}>
        Cards show no colour dots until you add a colour for an option name.
      </EmptyState>}
      {swatches.length > 0 && <ol className="grid gap-2">{swatches.map((swatch, index) => {
        const n = index + 1, nameProblem = nameError(swatches, index), hexProblem = hexError(swatch.hex);
        const nameId = `${id}-swatch-${index}-name`, hexId = `${id}-swatch-${index}-hex`, valid = hexPattern.test(swatch.hex);
        return <li key={index} aria-label={`Colour ${n}`} className={cn(rowCard, "grid gap-2 px-3 py-2.5")}>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <span aria-hidden="true" data-swatch-preview style={valid ? { backgroundColor: swatch.hex } : undefined}
              className={cn("mb-0.5 size-8 shrink-0 rounded-full border border-line-strong shadow-xs", !valid && "border-dashed bg-surface")} />
            <RowField label="Option name" className="flex-1 basis-44">
              <Input aria-label={`Colour ${n} option name`} ref={focus.track(`swatch:${index}:name`)} value={swatch.name} maxLength={80}
                {...invalidProps(nameId, nameProblem)} className="h-9 bg-card text-sm"
                onChange={(event) => patchSwatch(index, { name: event.currentTarget.value })}
                onBlur={() => { if (swatch.name !== swatch.name.trim()) patchSwatch(index, { name: swatch.name.trim() }); }} />
            </RowField>
            <RowField label="Colour">
              <input type="color" aria-label={`Colour ${n} colour`} value={valid ? swatch.hex.toLowerCase() : "#000000"}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1 shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => patchSwatch(index, { hex: event.currentTarget.value })} />
            </RowField>
            <RowField label="Hex code">
              <Input aria-label={`Colour ${n} hex code`} ref={focus.track(`swatch:${index}:hex`)} value={swatch.hex} maxLength={7} spellCheck={false}
                {...invalidProps(hexId, hexProblem)} className="h-9 w-28 bg-card font-mono text-sm"
                onChange={(event) => patchSwatch(index, { hex: event.currentTarget.value.trim() })}
                onBlur={() => { if (/^[0-9a-fA-F]{6}$/.test(swatch.hex)) patchSwatch(index, { hex: `#${swatch.hex}` }); }} />
            </RowField>
            <RemoveButton label={`Remove colour ${n}`} className="mb-0.5" onClick={() => {
              const next = swatches.filter((_, i) => i !== index);
              update({ swatches: next }, index < next.length ? `swatch:${index}:name` : "add-swatch");
            }} />
          </div>
          {(nameProblem || hexProblem) && <div className="grid gap-1 pl-11">
            <FieldError id={nameId}>{nameProblem}</FieldError>
            <FieldError id={hexId}>{hexProblem}</FieldError>
          </div>}
        </li>;
      })}</ol>}
      <div>
        <ActionButton icon={Plus} ref={focus.track("add-swatch")} disabled={swatches.length >= swatchLimit} onClick={() => addSwatch()}>Add colour</ActionButton>
      </div>
      {suggestions.length > 0 && <div role="group" aria-label="Option names without a colour" className="grid gap-2 rounded-lg border border-line-soft bg-surface p-3">
        <p className="text-xs text-muted-foreground">Option names in the catalogue results below that have no colour yet:</p>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((name) => <ActionButton key={name} icon={Plus} size="xs" aria-label={`Add a colour for ${name}`}
            disabled={swatches.length >= swatchLimit} onClick={() => addSwatch(name, "hex")}>{name}</ActionButton>)}
        </div>
      </div>}
    </section>

    <section aria-label="Products" className="grid min-w-0 content-start gap-3">
      <SectionHeading className="mt-0 mb-0" description="Mark a product as New or add its review rating. Find products in the catalogue below.">
        Products<Count value={products.length} limit={productLimit} />
      </SectionHeading>
      {products.length === 0 ? <EmptyState title="No products yet" icon={<Star strokeWidth={1.5} />} action={
        <ActionButton icon={Search} aria-label="Find products for product highlights" onClick={() => focus.focus("search")}>Find products</ActionButton>
      }>Cards show no New badge or rating until you add the product here.</EmptyState>
        : <>
          <DataTable label="Product highlights" columns={columns} data={products} getRowId={(product) => product.handle} empty="No products yet." />
          <Hint id={helpId}>Only enter the average and count of real customer reviews.</Hint>
        </>}
      <ProductSearch onResults={heard} onExpired={onExpired} inputRef={focus.track("search")} actions={(product) => {
        const listed = products.some((item) => item.handle === product.handle);
        return <ActionButton icon={listed ? Check : Plus} variant={listed ? "ghost" : "outline"} size="xs" aria-label={`Add ${product.handle} to product highlights`}
          disabled={listed || !product.published || products.length >= productLimit}
          onClick={() => update({ products: [...products, { handle: product.handle, isNew: false, rating: null }] }, `product:${product.handle}`)}>
          {listed ? "Added" : "Add"}
        </ActionButton>;
      }} />
    </section>
  </section>;
}
