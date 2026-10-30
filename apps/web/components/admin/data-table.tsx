"use client";
import { useState, type ReactNode } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type Row, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

/**
 * The admin's data table (shadcn data-table pattern on TanStack Table): sortable headers, an
 * empty row, and a row click/keyboard handler. Filtering happens on the server, above the table.
 */
export function DataTable<T>({ columns, data, label, empty, onRowOpen, rowLabel, getRowId, rowProps }: {
  columns: ColumnDef<T, any>[];
  data: T[];
  /** The table's accessible name. */
  label: string;
  /** Shown in the body when there are no rows. */
  empty: ReactNode;
  /** Opens a row (detail sheet); rows become focusable and open on Enter. */
  onRowOpen?: (row: T) => void;
  rowLabel?: (row: T) => string;
  getRowId?: (row: T, index: number) => string;
  rowProps?: (row: Row<T>) => Record<string, string | undefined>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({ data, columns, getRowId, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const rows = table.getRowModel().rows;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <Table aria-label={label}>
        <TableHeader className="bg-surface">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const sortable = header.column.getCanSort() && header.column.columnDef.enableSorting !== false;
                return (
                  <TableHead key={header.id} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined} className={cn("h-10 text-2xs font-semibold tracking-[0.02em] text-muted-foreground", header.column.columnDef.meta?.className)}>
                    {header.isPlaceholder ? null : sortable ? (
                      <button type="button" className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 focus-visible:outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60" onClick={header.column.getToggleSortingHandler()}>
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
            <TableRow className="hover:bg-transparent"><TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">{empty}</TableCell></TableRow>
          ) : rows.map((row) => (
            <TableRow key={row.id} data-row-id={row.id} {...rowProps?.(row)} tabIndex={onRowOpen ? 0 : undefined} aria-label={onRowOpen && rowLabel ? rowLabel(row.original) : undefined}
              className={cn("text-sm", onRowOpen && "cursor-pointer focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-inset")}
              onClick={onRowOpen ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea, label")) onRowOpen(row.original); } : undefined}
              onKeyDown={onRowOpen ? (event) => { if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); onRowOpen(row.original); } } : undefined}>
              {row.getVisibleCells().map((cell) => <TableCell key={cell.id} className={cn("py-3", cell.column.columnDef.meta?.className)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
