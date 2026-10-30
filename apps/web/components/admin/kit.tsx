"use client";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef, type ReactElement, type Ref } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Field } from "./field";
import { SortableList, type SortableRowProps } from "./sortable-list";
import { useCallback, useEffect, useState } from "react";
import { AdminRequestTimeout } from "./use-admin-request";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The admin's layout vocabulary on top of components/ui: screen headers, section headings,
 * field grids, labelled checkboxes and selects, row actions. Every admin screen composes
 * these instead of writing its own CSS.
 */

/** A screen's title (TAN Pearl), its one-line purpose and optional actions on the right. */
export function PanelHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="grid max-w-[68ch] gap-1.5">
        <h2 className="font-display text-2xl leading-tight font-normal text-balance text-foreground">{title}</h2>
        {description && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A group heading inside a screen. */
export function SectionHeading({ children, description, className, as: Tag = "h3" }: { children: ReactNode; description?: ReactNode; className?: string; as?: "h3" | "h4" }) {
  return (
    <div className={cn("mt-8 mb-3 grid gap-1 first:mt-0", className)}>
      <Tag className={cn("font-semibold tracking-[-0.01em] text-foreground", Tag === "h3" ? "text-base" : "text-sm")}>{children}</Tag>
      {description && <p className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Body copy inside a screen: muted, measured. */
export function Prose({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("max-w-[68ch] text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

/** Fields in a responsive grid; a field with `data-span="full"` (multiline) takes the whole row. */
export function FieldGrid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-x-5 gap-y-4 sm:grid-cols-2 [&>[data-span=full]]:sm:col-span-2", className)} {...props} />;
}

/** A grouped block of fields (a fieldset with its legend as a small heading). */
export function FieldGroup({ legend, description, children, className, ...props }: Omit<ComponentProps<"fieldset">, "children"> & { legend: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className={cn("grid min-w-0 gap-4 rounded-lg border border-line-soft bg-surface p-4 sm:p-5", className)} {...props}>
      <legend className="float-left mb-1 w-full text-sm font-semibold text-foreground">{legend}</legend>
      {description && <p className="clear-both -mt-2 max-w-[68ch] text-xs text-muted-foreground">{description}</p>}
      <div className="clear-both grid gap-4">{children}</div>
    </fieldset>
  );
}

/** A native checkbox inside its label (label text to the right) with an optional hint below. */
export function CheckField({ label, description, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <div className={cn("grid gap-1", className)} data-span="full">
      <label className="flex w-fit cursor-pointer items-start gap-3 text-sm leading-snug font-medium text-foreground has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60">
        <NativeCheckbox className="mt-0.5" {...props} />
        <span>{label}</span>
      </label>
      {description && <p className="pl-7 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

/** A labelled native select spanning its grid cell. */
export function SelectField({ label, children, className, hideLabel = false, ...props }: Omit<ComponentProps<"select">, "size"> & { label: string; hideLabel?: boolean }) {
  return (
    <label className={cn("grid min-w-0 gap-2", className)}>
      <span className={cn("text-xs font-medium text-foreground", hideLabel && "sr-only")}>{label}</span>
      <NativeSelect aria-label={label} containerClassName="w-full" className="h-10 bg-card" {...props}>{children}</NativeSelect>
    </label>
  );
}

/** Move up / Move down buttons for a list row; labels match the drag handle's spoken name. */
export function MoveButtons({ name, index, length, onMove, className }: { name: string; index: number; length: number; onMove: (direction: -1 | 1) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {([-1, 1] as const).map((direction) => (
        <Button
          key={direction}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${name} ${direction === -1 ? "up" : "down"}`}
          title={direction === -1 ? "Move up" : "Move down"}
          disabled={index + direction < 0 || index + direction >= length}
          onClick={() => onMove(direction)}
        >
          {direction === -1 ? <ChevronUp aria-hidden="true" strokeWidth={1.5} /> : <ChevronDown aria-hidden="true" strokeWidth={1.5} />}
        </Button>
      ))}
    </div>
  );
}

/** A quiet icon button that removes a row; the accessible name says what it removes. */
export function RemoveButton({ label, className, ...props }: Omit<ComponentProps<typeof Button>, "children"> & { label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className={cn("text-muted-foreground hover:bg-danger-bg hover:text-danger", className)} {...props}>
      <X aria-hidden="true" strokeWidth={1.5} />
    </Button>
  );
}

/** A row card for editable lists (sortable or not): handle, content, actions. */
export const rowCard = "flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-xs transition-[box-shadow,border-color] duration-200 ease-admin data-[dragging=true]:z-20 data-[dragging=true]:shadow-lg data-[drop-target=after]:shadow-[0_2px_0_0_var(--primary)] data-[drop-target=before]:shadow-[0_-2px_0_0_var(--primary)] data-[preview-focused=true]:border-primary data-[preview-focused=true]:shadow-[0_0_0_1px_var(--primary)]";

/** Fields on the left, a sticky local preview on the right; stacks when the panel is narrow. */
export function EditorWithPreview({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className="@container">
      <div className={cn("grid items-start gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.62fr)] @3xl:gap-8 [&>*]:min-w-0", className)} {...props} />
    </div>
  );
}

/** The local preview beside an editor: a raised card that follows the fields as they scroll. */
export function PreviewPanel({ eyebrow, footnote, tone = "card", className, children, ...props }: Omit<ComponentProps<"aside">, "children"> & {
  eyebrow: ReactNode;
  footnote: ReactNode;
  tone?: "card" | "accent";
  children: ReactNode;
}) {
  const accent = tone === "accent";
  return (
    <aside
      className={cn(
        "grid gap-3 rounded-xl border p-5 text-sm leading-relaxed shadow-md [overflow-wrap:anywhere] @3xl:sticky @3xl:top-20",
        accent ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
        className,
      )}
      {...props}
    >
      <h3 className={cn("text-2xs font-semibold tracking-[0.06em] uppercase", accent ? "text-primary-foreground/80" : "text-faint")}>{eyebrow}</h3>
      {children}
      <small className={cn("mt-2 block border-t pt-3 text-2xs", accent ? "border-primary-foreground/20 text-primary-foreground/80" : "border-line-soft text-muted-foreground")}>{footnote}</small>
    </aside>
  );
}

/** The storefront-style title inside a preview card. */
export function PreviewTitle({ className, ...props }: ComponentProps<"h4">) {
  return <h4 className={cn("font-display text-xl leading-tight font-normal text-balance", className)} {...props} />;
}

/** A short hint under a group of fields; takes the full row of a FieldGrid. */
export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p data-span="full" className={cn("max-w-[68ch] text-xs leading-relaxed text-muted-foreground", className)} {...props} />;
}

/** An inline confirmation for a destructive step: what will happen, then confirm or keep. */
export function ConfirmPanel({ children, confirm, cancel, onConfirm, onCancel }: { children: ReactNode; confirm: string; cancel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alert" className="grid gap-3 rounded-lg border border-danger/25 bg-danger-bg px-4 py-3.5 text-sm leading-relaxed text-foreground">
      <p className="max-w-[68ch]">{children}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" size="sm" onClick={onConfirm}>{confirm}</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>{cancel}</Button>
      </div>
    </div>
  );
}

/** The bottom-of-form removal area, set apart from the fields by a soft divider. */
export function DangerZone({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mt-8 grid justify-items-start gap-3 border-t border-line-soft pt-5">
      {children}
      {note && <p className="max-w-[68ch] text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Classes for a quiet ghost button that removes something. */
export const dangerButton = "text-danger hover:bg-danger-bg hover:text-danger";

/** A button with a leading Lucide icon (any icon has the same type as X); small outline by default. */
export function ActionButton({ icon: Icon, children, ...props }: ComponentProps<typeof Button> & { icon: typeof X }) {
  return (
    <Button type="button" variant="outline" size="sm" {...props}>
      <Icon aria-hidden="true" strokeWidth={1.5} />
      {children}
    </Button>
  );
}

/** The focus ring for an element that draws its own (rows that take focus, disclosure summaries). */
export const focusRing = "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60";

/** A list row holding a block of fields: the row card stacked vertically. */
export const stackCard = cn(rowCard, "grid items-stretch gap-4 p-4", focusRing);

/** The list after swapping an entry with the one `offset` places away (what Move up/down produce). */
export function swap<T>(items: readonly T[], index: number, offset: number): T[] {
  const next = [...items];
  [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
  return next;
}

/** The list with the entry whose key matches patched. */
export function patchKey<T extends { key: string }>(items: readonly T[], key: string, patch: Partial<T>): T[] {
  return items.map((item) => (item.key === key ? { ...item, ...patch } : item));
}

/**
 * Moves focus to a tracked element after `changed` changes (for example after a row moves or is removed).
 * Pass `track(key)` as the element's ref and call `focusAfter(key)` just before onChange.
 */
export function usePendingFocus<K = string>(changed: unknown) {
  const nodes = useRef(new Map<K, HTMLElement>());
  const pending = useRef<K | null>(null);
  useLayoutEffect(() => {
    if (pending.current !== null) nodes.current.get(pending.current)?.focus();
    pending.current = null;
  }, [changed]);
  return {
    track: (key: K) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    focusAfter: (key: K | null) => { pending.current = key; },
    focus: (key: K) => nodes.current.get(key)?.focus(),
  };
}

/** A keyed text Field, for lists of fields. */
export function textField(label: string, value: string, maxLength: number, onChange: (value: string) => void, multiline = false) {
  return <Field key={label} label={label} value={value} maxLength={maxLength} onChange={onChange} multiline={multiline} />;
}

/** One text field per entry of a list of strings; `label(index)` names each. */
export function listFields(values: readonly string[], label: (index: number) => string, maxLength: number, onChange: (values: string[]) => void) {
  return values.map((value, index) => textField(label(index), value, maxLength, (next) => onChange(values.map((item, i) => (i === index ? next : item)))));
}

type TextKey<T> = { [K in keyof T]-?: T[K] extends string ? K : never }[keyof T];
/** A text field row: [property, label, maxLength, multiline]. */
export type TextRow<T> = readonly [TextKey<T>, string, number, boolean?];
function textRow<T>(value: T, [key, label, maxLength, multiline]: TextRow<T>, onChange: (value: T) => void) {
  return textField(label, String(value[key]), maxLength, (text) => onChange({ ...value, [key]: text }), multiline);
}
/** Text fields (no grid) for one object's string properties; element entries render as given, in order. */
export function textFields<T>(value: T, fields: readonly (TextRow<T> | ReactElement)[], onChange: (value: T) => void) {
  return fields.map((entry) => (Array.isArray(entry) ? textRow(value, entry as TextRow<T>, onChange) : (entry as ReactElement)));
}

/** textFields in a FieldGrid. */
export function TextFields<T>({ value, fields, onChange, className, ref }: {
  value: T;
  fields: readonly (TextRow<T> | ReactElement)[];
  onChange: (value: T) => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <FieldGrid ref={ref} className={className}>
      {textFields(value, fields, onChange)}
    </FieldGrid>
  );
}

/** One FieldGroup per keyed entry holding its text fields; `grid` lays them out in a FieldGrid. */
export function GroupedFields<T extends { key: string }>({ items, legend, fields, onChange, grid = false }: {
  items: readonly T[];
  legend: (item: T, index: number) => ReactNode;
  fields: (item: T, index: number) => readonly TextRow<T>[];
  onChange: (items: T[]) => void;
  grid?: boolean;
}) {
  return (
    <>
      {items.map((item, index) => {
        const rows = fields(item, index).map((row) => textRow(item, row, (next) => onChange(patchKey(items, item.key, next))));
        return <FieldGroup key={item.key} legend={legend(item, index)}>{grid ? <FieldGrid>{rows}</FieldGrid> : rows}</FieldGroup>;
      })}
    </>
  );
}

/** The summary of a native details disclosure: a chevron that turns when open, then the title. */
export function DisclosureSummary({ className, children, ...props }: ComponentProps<"summary">) {
  return (
    <summary
      className={cn("flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-foreground select-none transition-colors duration-150 ease-admin hover:bg-accent [&::-webkit-details-marker]:hidden", focusRing, className)}
      {...props}
    >
      <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-admin motion-reduce:transition-none [details[open]>summary>&]:rotate-90" />
      {children}
    </summary>
  );
}

/** A collapsible card of fields (a native details, closed until opened). */
export function ContentPanel({ title, children, className, ...props }: Omit<ComponentProps<"details">, "title"> & { title: ReactNode }) {
  return (
    <details className={cn("min-w-0 rounded-lg border border-border bg-card shadow-xs", className)} {...props}>
      <DisclosureSummary>{title}</DisclosureSummary>
      <div className="grid gap-4 border-t border-line-soft px-4 pt-4 pb-5">{children}</div>
    </details>
  );
}

/** The "Section content" block of a page editor: a heading over a stack of ContentPanels. */
export function ContentPanels({ description = "Open a section to edit its text.", children }: { description?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <SectionHeading description={description}>Section content</SectionHeading>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

/** A storefront page editor: the page's name and purpose over its own fields, then its other blocks. */
export function PageEditor({ label, title, description, intro, children }: { label: string; title: ReactNode; description: ReactNode; intro: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid gap-6">
      <div>
        <SectionHeading className="mt-2" description={description}>{title}</SectionHeading>
        {intro}
      </div>
      {children}
    </section>
  );
}

/**
 * Sortable rows of named sections, each with a visibility checkbox and Move up/down buttons.
 * `name` is the spoken name (drag handle, Move buttons, "Show ..." checkbox); `label` is the visible text.
 */
export function ToggleRows<T extends { key: string; enabled: boolean }>({ items, name, label, onChange, onReorder, onMove, rowProps, className }: {
  items: readonly T[];
  name: (item: T) => string;
  label: (item: T) => ReactNode;
  onChange: (items: T[]) => void;
  /** Receives drags (and Move button presses unless onMove is given); defaults to onChange. */
  onReorder?: (items: T[], moved: T) => void;
  /** Receives Move button presses; defaults to onReorder. */
  onMove?: (items: T[], moved: T) => void;
  rowProps?: (item: T, index: number) => SortableRowProps;
  className?: string;
}) {
  const reorder = onReorder ?? ((next: T[]) => onChange(next));
  const move = onMove ?? reorder;
  return (
    <SortableList items={items} getId={(item) => item.key} getLabel={(item) => name(item)} className={className}
      rowClassName={cn(rowCard, focusRing)} onReorder={(next, moved) => reorder(next, moved)} rowProps={rowProps}
      renderItem={(item, index, handle) => (
        <>
          {handle}
          <CheckField className="min-w-0 flex-1" label={label(item)} aria-label={`Show ${name(item)}`} checked={item.enabled}
            onChange={(event) => onChange(patchKey(items, item.key, { enabled: event.currentTarget.checked } as Partial<T>))} />
          <MoveButtons name={name(item)} index={index} length={items.length} onMove={(direction) => move(swap(items, index, direction), item)} />
        </>
      )}
    />
  );
}

/** A page editor's "Sections" block: its sections in order, each shown or hidden. */
export function SectionToggles<K extends string>({ prefix, labels, items, onChange, description }: {
  prefix: string;
  labels: Record<K, string>;
  items: readonly { key: K; enabled: boolean }[];
  onChange: (items: { key: K; enabled: boolean }[]) => void;
  description: ReactNode;
}) {
  return (
    <div>
      <SectionHeading description={description}>Sections</SectionHeading>
      <ToggleRows items={items} name={(item) => `${prefix} ${labels[item.key]}`} label={(item) => labels[item.key]} onChange={onChange} />
    </div>
  );
}

/** A titled block inside a screen or sheet: an h4 with an optional line of help and actions, then its content. */
export function Subsection({ title, description, actions, children, className, ...props }: Omit<ComponentProps<"section">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("grid min-w-0 content-start gap-3", className)} {...props}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid max-w-[68ch] gap-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {description && <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export type EditableListProps<T> = {
  /** Rows are named `${name} ${n}`; buttons and the drag handle speak it with a lower-case first letter. */
  name: string;
  items: T[];
  identity: (item: T) => string;
  onChange: (items: T[]) => void;
  render: (item: T, index: number, update: (item: T) => void) => ReactNode;
  create?: () => T;
  min?: number;
  max?: number;
  rowClassName?: string;
  /** Rows are fieldsets named by a hidden legend instead of list items. */
  fieldset?: boolean;
  /** Focus lands on a row's first input instead of the row. */
  focusInput?: boolean;
  /** After a removal focus goes to the next surviving row ("neighbour") or to the Add button. */
  removeFocus?: "neighbour" | "add";
  badge?: (item: T) => ReactNode;
  rowProps?: (item: T, index: number) => SortableRowProps;
};
const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
/**
 * A sortable list of stacked row cards, each headed by its name with Move and Remove buttons, then an Add button.
 * Focus follows the moved or added row, so keyboard users stay on a meaningful control.
 */
export function EditableList<T>({
  name, items, identity, onChange, render, create, min = 0, max = 99, rowClassName = stackCard,
  fieldset = false, focusInput = false, removeFocus = "neighbour", badge, rowProps,
}: EditableListProps<T>) {
  const rows = usePendingFocus(items);
  function update(next: T[], id: string) { rows.focusAfter(id); onChange(next); }
  return (
    <>
      <SortableList items={items} getId={identity} getLabel={(_, index) => lowerFirst(`${name} ${index + 1}`)} onReorder={(next) => onChange(next)}
        tag={fieldset ? "div" : "ol"} rowTag={fieldset ? "fieldset" : "li"} rowClassName={rowClassName}
        rowProps={(item, index) => ({
          "aria-label": `${name} ${index + 1}`,
          ...rowProps?.(item, index),
          ref: (node: HTMLElement | null) => rows.track(identity(item))(focusInput ? (node?.querySelector("input") ?? null) : node),
        })}
        renderItem={(item, index, handle) => {
          const label = `${name} ${index + 1}`, id = identity(item), neighbour = items[index + 1] ?? items[index - 1];
          return <>
            {fieldset && <legend className="sr-only">{label}</legend>}
            <div className="-my-1 -ml-1 flex min-w-0 items-center gap-2">
              {handle}
              <span aria-hidden="true" className="min-w-0 truncate text-sm font-semibold text-foreground">{label}</span>
              {badge?.(item)}
              <div className="ml-auto flex items-center gap-0.5">
                <MoveButtons name={lowerFirst(label)} index={index} length={items.length} onMove={(direction) => update(swap(items, index, direction), id)} />
                {create && <RemoveButton label={`Remove ${lowerFirst(label)}`} disabled={items.length <= min}
                  onClick={() => update(items.filter((_, i) => i !== index), removeFocus === "neighbour" && neighbour ? identity(neighbour) : "add")} />}
              </div>
            </div>
            {render(item, index, (next) => onChange(items.map((old, i) => (i === index ? next : old))))}
          </>;
        }} />
      {create && <div>
        <ActionButton icon={Plus} ref={rows.track("add")} disabled={items.length >= max}
          onClick={() => { const item = create(); update([...items, item], identity(item)); }}>Add {lowerFirst(name)}</ActionButton>
      </div>}
    </>
  );
}

/** Keeps the latest value (usually callbacks from props) in a ref, so async work calls the current one. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** Adds an opaque paging cursor to an admin API path. */
export const withCursor = (path: string, cursor: string | null) => cursor ? `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : path;

type PageResult<T> = { ok: true; value: { items: T[]; nextCursor: string | null } } | { ok: false; denied: 401 | 403 } | { ok: false; denied?: undefined; message: string };
/** A cursor-paged admin list: a later page appends without repeats, a denial empties it, a superseded response is dropped. */
export function usePaged<T extends { id: string }>(read: (cursor: string | null) => Promise<PageResult<T>>, onDenied: (status: number) => void) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const latest = useLatest({ read, onDenied });
  useEffect(() => () => { sequence.current++; }, []);
  const load = useCallback(async (next: string | null = null) => {
    const current = ++sequence.current;
    setLoading(true); setError("");
    const result = await latest.current.read(next);
    if (current !== sequence.current) return;
    setLoading(false);
    if (!result.ok) { if (result.denied) { setItems([]); latest.current.onDenied(result.denied); } else setError(result.message); return; }
    setItems(rows => next ? [...rows, ...result.value.items.filter(item => !rows.some(row => row.id === item.id))] : result.value.items);
    setCursor(result.value.nextCursor);
  }, [latest]);
  return { items, setItems, cursor, loading, error, load };
}

/** One write at a time: busy, error and notice state, with a timed-out or failed request turned into a message. */
export function useWrite(onBusy?: (busy: boolean) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const latest = useLatest(onBusy);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function run(work: () => Promise<void>, failed: (timedOut: boolean) => string) {
    setBusy(true); latest.current?.(true); setError(""); setNotice("");
    try { await work(); }
    catch (failure) { if (active.current) setError(failed(failure instanceof AdminRequestTimeout)); }
    finally { if (active.current) { setBusy(false); latest.current?.(false); } }
  }
  return { busy, error, setError, notice, setNotice, active, run };
}

/** Tabs that switch a view, with the panels as children. Triggers also select on click (Radix activates on mousedown and focus). */
export function TabBar<T extends string>({ label, tabs, value, onSelect, disabled, className, children }: {
  label: string; tabs: readonly (readonly [T, string, ...string[]])[]; value: T | ""; onSelect: (value: T) => void; disabled?: boolean; className?: string; children?: ReactNode;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onSelect(next as T)} className={className}>
      <TabsList aria-label={label}>
        {tabs.map(([key, text]) => <TabsTrigger key={key} value={key} className="px-3 text-sm" disabled={disabled} onClick={() => onSelect(key)}>{text}</TabsTrigger>)}
      </TabsList>
      {children}
    </Tabs>
  );
}
