"use client";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

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
        <h2 className="font-display text-[28px] leading-tight font-normal text-balance text-foreground">{title}</h2>
        {description && <p className="text-[13.5px] leading-relaxed text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A group heading inside a screen. */
export function SectionHeading({ children, description, className, as: Tag = "h3" }: { children: ReactNode; description?: ReactNode; className?: string; as?: "h3" | "h4" }) {
  return (
    <div className={cn("mt-8 mb-3 grid gap-1 first:mt-0", className)}>
      <Tag className={cn("font-semibold tracking-[-0.01em] text-foreground", Tag === "h3" ? "text-[15px]" : "text-[13.5px]")}>{children}</Tag>
      {description && <p className="max-w-[68ch] text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Body copy inside a screen: muted, measured. */
export function Prose({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("max-w-[68ch] text-[13.5px] leading-relaxed text-muted-foreground", className)} {...props} />;
}

/** Fields in a responsive grid; a field with `data-span="full"` (multiline) takes the whole row. */
export function FieldGrid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-x-5 gap-y-4 sm:grid-cols-2 [&>[data-span=full]]:sm:col-span-2", className)} {...props} />;
}

/** A grouped block of fields (a fieldset with its legend as a small heading). */
export function FieldGroup({ legend, description, children, className, ...props }: Omit<ComponentProps<"fieldset">, "children"> & { legend: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className={cn("grid min-w-0 gap-4 rounded-lg border border-line-soft bg-surface p-4 sm:p-5", className)} {...props}>
      <legend className="float-left mb-1 w-full text-[13.5px] font-semibold text-foreground">{legend}</legend>
      {description && <p className="clear-both -mt-2 max-w-[68ch] text-[12.5px] text-muted-foreground">{description}</p>}
      <div className="clear-both grid gap-4">{children}</div>
    </fieldset>
  );
}

/** A native checkbox inside its label (label text to the right) with an optional hint below. */
export function CheckField({ label, description, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <div className={cn("grid gap-1", className)} data-span="full">
      <label className="flex w-fit cursor-pointer items-start gap-3 text-[13.5px] leading-snug font-medium text-foreground has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60">
        <NativeCheckbox className="mt-0.5" {...props} />
        <span>{label}</span>
      </label>
      {description && <p className="pl-7 text-[12.5px] text-muted-foreground">{description}</p>}
    </div>
  );
}

/** A labelled native select spanning its grid cell. */
export function SelectField({ label, children, className, hideLabel = false, ...props }: Omit<ComponentProps<"select">, "size"> & { label: string; hideLabel?: boolean }) {
  return (
    <label className={cn("grid min-w-0 gap-2", className)}>
      <span className={cn("text-[12.5px] font-medium text-foreground", hideLabel && "sr-only")}>{label}</span>
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
export const rowCard = "flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs transition-[box-shadow,border-color] duration-200 ease-admin data-[dragging=true]:z-20 data-[dragging=true]:shadow-lg data-[drop-target=after]:shadow-[0_2px_0_0_var(--primary)] data-[drop-target=before]:shadow-[0_-2px_0_0_var(--primary)] data-[preview-focused=true]:border-primary data-[preview-focused=true]:shadow-[0_0_0_1px_var(--primary)]";
