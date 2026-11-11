"use client";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { z } from "zod";
import { ExternalLink, RotateCw } from "lucide-react";
import { enquiryAdminDetailSchema, enquiryAdminListSchema, enquiryKinds, type EnquiryAdminDetail, type EnquiryAdminSummary } from "@shopmaple/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DataTable } from "./data-table";
import { ActionButton, PanelHeader, SelectField, Subsection, useLatest } from "./kit";
import { EnquiryDeliveryPanel } from "./enquiry-delivery-panel";
import { EmptyState, Notice, RetryNotice, Skeleton, ago, formatDate, formatDateTime, kindLabels, localToday, readJson } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { useAdminRequest } from "./use-admin-request";

// Website enquiries are handled in Keeri (reply, assign, follow up). This screen only lists what the
// store's forms saved and whether each one reached Keeri, so a failed lead can still be resent.
const handoff = "Website enquiries are handled in Keeri. Open a lead there to reply, assign or follow up.";
const accessMessage = "Your account does not have access to customer enquiries. Contact your administrator.";
type Lead = NonNullable<EnquiryAdminSummary["keeri"]>;
const stateLabels: Record<Lead["state"], string> = { pending: "Pending", created: "Lead created", matched: "Matched a lead", failed: "Failed" };
const stateTone: Record<Lead["state"] | "none", string> = {
  pending: "bg-info-bg text-info", created: "bg-success-bg text-success", matched: "bg-success-bg text-success", failed: "bg-danger-bg text-danger", none: "bg-neutral-bg text-neutral",
};
// Signups and kept reviews never go to Keeri; a contact, project or bulk enquiry without a lead was saved while leads were off.
const noLead = (kind: string) => kind === "newsletter" || kind === "review" ? "Stays in the store" : "Not sent";
const cell = (render: (row: EnquiryAdminSummary) => ReactNode) => ({ row }: CellContext<EnquiryAdminSummary, unknown>) => render(row.original);

export function EnquiryInbox(props: { session: StaffSession; onExpired: () => void }) {
  return <EnquiryInboxSession key={`${props.session.user.id}:${props.session.csrfToken}:${props.session.user.canManageEnquiries}`} {...props} />;
}
function EnquiryInboxSession({ session, onExpired }: { session: StaffSession; onExpired: () => void }) {
  const request = useAdminRequest(), today = localToday();
  const [page, setPage] = useState<z.infer<typeof enquiryAdminListSchema> | null>(null), [detail, setDetail] = useState<EnquiryAdminDetail | null>(null);
  const [kind, setKind] = useState(""), [leadsUrl, setLeadsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [deliveryBusy, setDeliveryBusy] = useState(false), [error, setError] = useState("");
  const busy = loading || deliveryBusy, items = page?.items ?? [];
  const closed = useRef(false), sequence = useRef(0), detailOpener = useRef<HTMLElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null), listRegion = useRef<HTMLDivElement>(null), reloadButton = useRef<HTMLButtonElement>(null);
  const expired = useLatest(onExpired);
  function denied(code: number) {
    sequence.current++; setPage(null); setDetail(null); setLoading(false); setDeliveryBusy(false);
    if (code !== 401) setError(accessMessage); else if (!closed.current) { closed.current = true; expired.current(); }
  }
  async function read<T>(path: string, schema: z.ZodType<T>, apply: (value: T) => void) {
    const current = ++sequence.current; setLoading(true); setError("");
    const result = await readJson(request, path, schema, "Enquiries");
    if (current !== sequence.current) return;
    setLoading(false);
    if (result.ok) apply(result.value); else if (result.denied) denied(result.denied); else { setPage(null); setDetail(null); setError(result.message); }
  }
  function load(cursor?: string | null) {
    const params = new URLSearchParams({ ...(kind ? { kind } : {}), ...(cursor ? { cursor } : {}) });
    setDetail(null);
    return read(`/api/admin/enquiries${params.size ? `?${params}` : ""}`, enquiryAdminListSchema, value => { setPage(value); setLeadsUrl(value.keeriLeadsUrl); });
  }
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [kind, request]);
  function openDetail(id: string, opener: HTMLElement | null) {
    if (busy) return;
    detailOpener.current = opener;
    void read(`/api/admin/enquiries/${encodeURIComponent(id)}`, enquiryAdminDetailSchema, setDetail);
  }
  function closeDetail() {
    const id = detail?.id;
    // Unmount the sheet (and its focus trap) first, then hand focus back to whatever opened it.
    flushSync(() => setDetail(null));
    const row = id ? listRegion.current?.querySelector<HTMLElement>(`[data-enquiry-row="${id}"] button`) : null;
    (detailOpener.current?.isConnected ? detailOpener.current : row ?? reloadButton.current)?.focus();
  }
  // TanStack renders cells as components: stable definitions keep row buttons (and focus) alive, and read live state from this ref.
  const live = useRef({ busy, today, openDetail });
  live.current = { busy, today, openDetail };
  const columns = useMemo<ColumnDef<EnquiryAdminSummary, any>[]>(() => [
    { id: "reference", header: "Reference", accessorKey: "id", cell: cell(row => <span className="text-xs text-foreground tabular-nums [overflow-wrap:anywhere]">{row.id}</span>) },
    { id: "kind", header: "Kind", accessorFn: row => kindLabels[row.kind] ?? row.kind, cell: ({ getValue }) => <span className="text-foreground">{getValue() as string}</span> },
    { id: "received", header: "Received", accessorKey: "createdAt", cell: cell(row => <span className="grid gap-0.5 tabular-nums">
      <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time><span className="text-xs text-muted-foreground">{ago(row.createdAt, live.current.today)}</span></span>) },
    { id: "keeri", header: "Keeri", enableSorting: false, cell: cell(row => <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" data-keeri-state={row.keeri?.state ?? "none"} className={cn("rounded-md border-0 font-semibold", stateTone[row.keeri?.state ?? "none"])}>
        {row.keeri ? stateLabels[row.keeri.state] : noLead(row.kind)}</Badge>
      {row.keeri?.leadUrl && <Button asChild size="xs" variant="ghost"><a href={row.keeri.leadUrl} target="_blank" rel="noopener noreferrer">Open in Keeri<ExternalLink aria-hidden="true" strokeWidth={1.5} /></a></Button>}</div>) },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, enableSorting: false, meta: { className: "w-px text-right" }, cell: cell(row =>
      <Button type="button" size="sm" variant="outline" disabled={live.current.busy} onClick={event => live.current.openDetail(row.id, event.currentTarget)}>Open enquiry</Button>) },
  ], []);
  const rowOpener = () => { const active = document.activeElement; return active instanceof HTMLElement && listRegion.current?.contains(active) ? active : null; };
  return <section className="grid min-w-0 gap-4" aria-label="Website enquiries" aria-busy={busy}>
    <PanelHeader title="Website enquiries" description="Read-only. What the website's forms saved, newest first, and whether each enquiry reached Keeri. Newsletter signups and reviews Keeri could not take stay here." />
    <Notice tone="info" data-keeri-handoff className="text-sm">
      {leadsUrl ? <a href={leadsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-foreground underline-offset-4 hover:underline">
        {handoff}<ExternalLink aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0" /></a> : handoff}</Notice>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line-soft bg-surface p-4">
      <SelectField label="Kind" aria-label="Enquiry kind" className="min-w-40" value={kind} disabled={busy} onChange={event => setKind(event.target.value)}>
        <NativeSelectOption value="">All kinds</NativeSelectOption>
        {enquiryKinds.map(value => <NativeSelectOption key={value} value={value}>{kindLabels[value]}</NativeSelectOption>)}</SelectField>
      <ActionButton icon={RotateCw} ref={reloadButton} disabled={busy} onClick={() => void load()}>Reload list</ActionButton></div>
    {error && <RetryNotice disabled={busy} onRetry={error === accessMessage ? undefined : () => void load()}>{error}</RetryNotice>}
    {busy && <p role="status" className="sr-only">Loading enquiries…</p>}
    {loading && items.length === 0 && !detail && <Skeleton rows={4} />}
    {page && items.length === 0 && <EmptyState title={kind ? `No ${kindLabels[kind]?.toLowerCase()} entries yet.` : "No website enquiries yet."}>New contact, project and bulk enquiries appear here as soon as the forms save them, and go to Keeri as leads.</EmptyState>}
    {items.length > 0 && <div ref={listRegion} className="min-w-0"><DataTable columns={columns} data={items} label="Website enquiries" getRowId={row => row.id} empty="No enquiries on this page."
      rowProps={row => ({ "data-enquiry-row": row.original.id })} rowLabel={row => `Open enquiry ${row.id}`} onRowOpen={row => openDetail(row.id, rowOpener())} /></div>}
    {page?.nextCursor && <Button type="button" variant="outline" size="sm" className="w-fit" disabled={busy} onClick={() => void load(page.nextCursor)}>Next page</Button>}
    {detail && <Sheet open onOpenChange={open => { if (!open && !busy) closeDetail(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-background p-0 sm:max-w-[680px]"
        onOpenAutoFocus={event => { event.preventDefault(); detailHeading.current?.focus(); }} onCloseAutoFocus={event => event.preventDefault()}>
        <SheetHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 border-b border-line-soft bg-card px-6 py-5">
          <div className="grid min-w-0 gap-1">
            <SheetTitle ref={detailHeading} tabIndex={-1} className="text-lg leading-tight focus-visible:outline-none">Enquiry details</SheetTitle>
            <SheetDescription className="text-xs [overflow-wrap:anywhere]">{detail.name || "No name given"}, {(kindLabels[detail.kind] ?? detail.kind).toLowerCase()} enquiry
              received <time dateTime={detail.createdAt}>{formatDate(detail.createdAt)}</time></SheetDescription></div>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={closeDetail}>Close enquiry</Button>
        </SheetHeader>
        <article aria-label="Enquiry detail" className="grid flex-1 content-start gap-7 overflow-y-auto px-6 py-6">
          <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-xs
            [&_dd]:text-foreground [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-muted-foreground">
            {([["Reference", detail.id], ["Name", detail.name], ["Email", detail.email], ["Phone", detail.phone], ["Product", detail.context.product],
              ["Variant", detail.context.variant], ["SKU", detail.context.sku], ["Pincode", detail.context.pincode]] as const).map(([term, value]) =>
              <Fragment key={term}><dt>{term}</dt><dd className="tabular-nums">{value || "Not provided"}</dd></Fragment>)}</dl>
          <Subsection title="Message">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{detail.message || "No message supplied."}</p></Subsection>
          <div className="border-t border-line-soft pt-6"><EnquiryDeliveryPanel key={detail.id} enquiryId={detail.id} session={session} onBusy={setDeliveryBusy} onDenied={denied} /></div></article>
      </SheetContent></Sheet>}
  </section>;
}
