"use client";
import { useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type Row, type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** How a column is filtered from the toolbar: free text, or one of a fixed set of values. */
export type ColumnFilterMeta =
  | { filter?: undefined; label?: string; className?: string }
  | { filter: "text"; label: string; className?: string }
  | { filter: "select"; label: string; options: readonly (readonly [value: string, label: string])[]; className?: string };

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    filter?: "text" | "select";
    label?: string;
    options?: readonly (readonly [string, string])[];
    className?: string;
  }
}

/**
 * The admin's data table (shadcn data-table pattern on TanStack Table): sortable headers,
 * per-column filters in a toolbar, an empty row, and a row click/keyboard handler.
 */
export function DataTable<T>({ columns, data, label, empty, toolbar, onRowOpen, rowLabel, getRowId, rowProps }: {
  columns: ColumnDef<T, any>[];
  data: T[];
  /** The table's accessible name. */
  label: string;
  /** Shown in the body when no row matches. */
  empty: ReactNode;
  /** Extra controls after the column filters (saved views, actions). */
  toolbar?: ReactNode;
  /** Opens a row (detail sheet); rows become focusable and open on Enter. */
  onRowOpen?: (row: T) => void;
  rowLabel?: (row: T) => string;
  getRowId?: (row: T, index: number) => string;
  rowProps?: (row: Row<T>) => Record<string, string | undefined>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const table = useReactTable({
    data, columns, getRowId,
    state: { sorting, columnFilters: filters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const filterable = table.getAllLeafColumns().filter((column) => column.columnDef.meta?.filter);
  const rows = table.getRowModel().rows;
  return (
    <div className="grid gap-3">
      {(filterable.length > 0 || toolbar) && (
        <div className="flex flex-wrap items-end gap-3" role="group" aria-label={`Filter ${label.toLowerCase()}`}>
          {filterable.map((column) => {
            const meta = column.columnDef.meta!;
            const value = (column.getFilterValue() as string | undefined) ?? "";
            return (
              <label key={column.id} className="grid gap-1.5 text-[12px] font-medium text-muted-foreground">
                {meta.label}
                {meta.filter === "select" ? (
                  <NativeSelect size="sm" aria-label={`Filter by ${meta.label?.toLowerCase()}`} className="min-w-36 bg-card" value={value} onChange={(event) => column.setFilterValue(event.target.value || undefined)}>
                    <NativeSelectOption value="">All</NativeSelectOption>
                    {meta.options?.map(([option, text]) => <NativeSelectOption key={option} value={option}>{text}</NativeSelectOption>)}
                  </NativeSelect>
                ) : (
                  <Input aria-label={`Filter by ${meta.label?.toLowerCase()}`} className="h-8 w-48 bg-card text-[13px]" value={value} onChange={(event) => column.setFilterValue(event.target.value || undefined)} />
                )}
              </label>
            );
          })}
          {toolbar && <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Table aria-label={label}>
          <TableHeader className="bg-surface">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortable = header.column.getCanSort() && header.column.columnDef.enableSorting !== false;
                  return (
                    <TableHead key={header.id} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined} className={cn("h-10 text-[11.5px] font-semibold tracking-[0.02em] text-muted-foreground", header.column.columnDef.meta?.className)}>
                      {header.isPlaceholder ? null : sortable ? (
                        <button type="button" className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : sorted === "desc" ? <ArrowDown aria-hidden="true" className="size-3.5" /> : <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-50" />}
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={columns.length} className="h-24 text-center text-[13px] text-muted-foreground">{empty}</TableCell></TableRow>
            ) : rows.map((row) => (
              <TableRow
                key={row.id}
                data-row-id={row.id}
                {...rowProps?.(row)}
                tabIndex={onRowOpen ? 0 : undefined}
                aria-label={onRowOpen && rowLabel ? rowLabel(row.original) : undefined}
                className={cn("text-[13px]", onRowOpen && "cursor-pointer outline-none focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-inset")}
                onClick={onRowOpen ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea, label")) onRowOpen(row.original); } : undefined}
                onKeyDown={onRowOpen ? (event) => { if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); onRowOpen(row.original); } } : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn("py-3", cell.column.columnDef.meta?.className)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
