"use client";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FileDiff, History } from "lucide-react";
import { storefrontContentSchema, type StorefrontContent } from "@shopmaple/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { diffContent, type ContentChange } from "@/lib/content-diff";
import { cn } from "@/lib/utils";
import { EmptyState, Notice, Skeleton } from "./crm-primitives";
import { DataTable } from "./data-table";
import { titleCase } from "./homepage-panel";
import { PanelHeader } from "./kit";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

export type Revision = { id: string; version: number; action: string; actorEmail: string; createdAt: string };
type Detail = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; changes: ContentChange[] };
const actionTone: Record<string, string> = { publish: "bg-success-bg text-success", rollback: "bg-warning-bg text-warning", save: "bg-neutral-bg text-neutral" };
const column = createColumnHelper<Revision>();

/** Revision history as a table; a revision's changes against the draft open in a sheet. */
export function HistoryPanel({ revisions, loading, canRestore, dirty, current, onRestore, onExpired }: {
  revisions: Revision[];
  loading: boolean;
  canRestore: boolean;
  dirty: boolean;
  /** The draft being edited, which the revision is compared with. */
  current: StorefrontContent;
  onRestore: (id: string) => void;
  onExpired: () => void;
}) {
  const request = useAdminRequest();
  const [open, setOpen] = useState<Revision | null>(null);
  const [detail, setDetail] = useState<Detail>({ status: "loading" });
  async function load(revision: Revision) {
    setOpen(revision);
    setDetail({ status: "loading" });
    try {
      const response = await request(`/api/admin/content/revisions/${encodeURIComponent(revision.id)}`, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) { setOpen(null); onExpired(); return; }
      if (!response.ok) throw new Error("Read failed");
      const body: unknown = await response.json();
      const content = storefrontContentSchema.parse((body as { content?: unknown }).content);
      setDetail({ status: "ready", changes: diffContent(content, current) });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setDetail({ status: "error", message: error instanceof AdminRequestTimeout ? "Loading this version timed out." : "We couldn't load this version." });
    }
  }
  const restoreButton = (revision: Revision, className?: string) => (
    <Button type="button" size="sm" variant="outline" className={className} disabled={dirty} title={dirty ? "Save local changes before restoring" : undefined} onClick={() => { setOpen(null); onRestore(revision.id); }}>
      Restore version {revision.version}
    </Button>
  );
  const columns = useMemo(() => [
    column.accessor("version", {
      header: "Version",
      cell: (info) => <span className="text-[15px] font-semibold text-foreground tabular-nums">{info.getValue()}</span>,
      meta: { className: "w-20" },
    }),
    column.accessor("action", {
      header: "Change",
      cell: (info) => <Badge variant="secondary" className={cn("rounded-md border-0 font-semibold", actionTone[info.getValue()] ?? actionTone.save)}>{titleCase(info.getValue())}</Badge>,
      meta: { filter: "select", label: "Change", options: [...new Set(revisions.map((revision) => revision.action))].map((action) => [action, titleCase(action)] as const) },
      filterFn: "equalsString",
    }),
    column.accessor("actorEmail", { header: "By", cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>, meta: { filter: "text", label: "Staff" }, filterFn: "includesString" }),
    column.accessor("createdAt", { header: "When", cell: (info) => <time dateTime={info.getValue()} className="text-muted-foreground tabular-nums">{new Date(info.getValue()).toLocaleString()}</time> }),
    column.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: (info) => (
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" aria-label={`Preview changes in version ${info.row.original.version}`} onClick={() => void load(info.row.original)}>
            <FileDiff aria-hidden="true" strokeWidth={1.5} />Changes
          </Button>
          {canRestore && restoreButton(info.row.original)}
        </div>
      ),
      meta: { className: "text-right" },
    }),
  ], [revisions, canRestore, dirty, current]);
  const grouped = detail.status === "ready"
    ? [...new Set(detail.changes.map((change) => change.area))].map((area) => ({ area, changes: detail.changes.filter((change) => change.area === area) }))
    : [];
  return (
    <>
      <PanelHeader title="Revision history" description="Restore saved content as a new draft. Save local changes before restoring." />
      {loading && revisions.length === 0 ? (
        <div aria-busy="true"><p role="status" className="sr-only">Loading revision history</p><Skeleton rows={4} /></div>
      ) : revisions.length === 0 ? (
        <EmptyState title="No revisions yet" icon={<History strokeWidth={1.5} />}>Save a draft to start its history.</EmptyState>
      ) : (
        <DataTable
          label="Revisions"
          columns={columns}
          data={revisions}
          getRowId={(revision) => revision.id}
          empty="No revisions match these filters."
        />
      )}
      <Sheet open={open !== null} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <SheetContent className="w-full gap-0 sm:max-w-xl">
          <SheetHeader className="border-b border-line-soft px-6 py-5">
            <SheetTitle className="text-[20px] font-semibold tracking-[-0.01em] tabular-nums">Version {open?.version}</SheetTitle>
            <SheetDescription>
              {open ? `${titleCase(open.action)} by ${open.actorEmail}, ${new Date(open.createdAt).toLocaleString()}. Compared with the draft you are editing.` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="grid content-start gap-6 overflow-y-auto px-6 py-5" aria-busy={detail.status === "loading"}>
            {detail.status === "loading" ? <Skeleton rows={5} />
              : detail.status === "error" ? (
                <div className="grid justify-items-start gap-3">
                  <Notice tone="error">{detail.message} Check your connection, then try again.</Notice>
                  <Button type="button" variant="outline" size="sm" onClick={() => open && void load(open)}>Try again</Button>
                </div>
              ) : grouped.length === 0 ? (
                <EmptyState title="No differences" icon={<FileDiff strokeWidth={1.5} />}>This version is the same as the current draft.</EmptyState>
              ) : grouped.map(({ area, changes }) => (
                <section key={area} className="grid gap-2" aria-label={area}>
                  <h3 className="flex items-baseline justify-between text-[13.5px] font-semibold">{area}<span className="text-[12px] font-normal text-muted-foreground tabular-nums">{changes.length} {changes.length === 1 ? "change" : "changes"}</span></h3>
                  <ul className="grid gap-2">
                    {changes.slice(0, 60).map((change) => (
                      <li key={change.path} data-change={change.path} className="grid gap-1.5 rounded-lg border border-border bg-card p-3 text-[12.5px]">
                        <code className="font-sans text-[11.5px] font-medium text-faint">{change.path}</code>
                        <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
                          <p className="rounded-md bg-accent-tint px-2 py-1.5 break-words text-foreground"><span className="block text-[11px] font-semibold text-primary">In version {open?.version}</span>{change.revision}</p>
                          <p className="rounded-md bg-sunken px-2 py-1.5 break-words text-foreground"><span className="block text-[11px] font-semibold text-muted-foreground">Current draft</span>{change.current}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {changes.length > 60 && <p className="text-[12px] text-muted-foreground">And {changes.length - 60} more in this area.</p>}
                </section>
              ))}
          </div>
          {canRestore && open && (
            <SheetFooter className="border-t border-line-soft px-6 py-4">
              {dirty && <p className="text-[12.5px] text-muted-foreground">Save local changes before restoring.</p>}
              {restoreButton(open)}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
