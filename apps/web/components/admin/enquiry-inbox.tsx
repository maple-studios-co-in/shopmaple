"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";
import type { z } from "zod";
import { ArrowUpRight, RotateCw, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { enquiryAdminListSchema, enquiryAdminDetailSchema, enquiryStages, type EnquiryAdminSummary, type EnquiryAdminDetail } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TabsContent } from "@/components/ui/tabs";
import { DataTable } from "./data-table";
import { PanelHeader, SelectField, Subsection, TabBar, useLatest } from "./kit";
import { EnquiryWorkflow } from "./enquiry-workflow";
import { EnquiryDeliveryPanel } from "./enquiry-delivery-panel";
import { CrmBoard } from "./crm-board";
import { TaskViews } from "./crm-tasks";
import { ContactPage, ContactsDirectory, kindLabels } from "./contact-page";
import { DueBadge, EmptyState, Notice, Skeleton, StageChip, ageLabel, dueState, formatDate, localToday, readJson, stageOptions, useDirectory } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { useAdminRequest } from "./use-admin-request";

const views = [["list", "List"], ["board", "Board"], ["tasks", "Follow-ups"], ["contacts", "Contacts"]] as const;
type View = (typeof views)[number][0];
const accessMessage = "Your account does not have access to customer enquiries. Contact your administrator.";
const stageRank = (stage: string) => (enquiryStages as readonly string[]).indexOf(stage);
const ago = (createdAt: string, today: string) => { const age = ageLabel(createdAt, today); return age === "Today" ? "Today" : `${age} ago`; };
type Filters = Record<"kind" | "status" | "assignment" | "assigneeId" | "from" | "to", string>;
const noFilters: Filters = { kind: "", status: "", assignment: "", assigneeId: "", from: "", to: "" };

/** The server filters (they cover the whole inbox): inline on wide screens, in a sheet on narrow ones. */
function FilterFields({ value, onChange, staff, disabled }: { value: Filters; onChange: (value: Filters) => void; staff: ReturnType<typeof useDirectory>; disabled: boolean }) {
  const select = (key: keyof Filters, label: string, name: string, options: readonly (readonly [string, string])[]) => <SelectField label={label} aria-label={name} className="min-w-36" value={value[key]} disabled={disabled}
    onChange={event => onChange({ ...value, [key]: event.target.value })}>{options.map(([option, text]) => <NativeSelectOption key={option} value={option}>{text}</NativeSelectOption>)}</SelectField>;
  const date = (key: "from" | "to", label: string) => <label className="grid min-w-36 gap-2 text-xs font-medium text-foreground">{label}<Input aria-label={`${label} date`} type="date" className="h-10 bg-card text-sm"
    value={value[key]} disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>;
  return <>
    {select("kind", "Kind", "Enquiry kind", [["", "All kinds"], ...Object.entries(kindLabels)])}
    {select("status", "Stage", "Enquiry status", [["", "All stages"], ...stageOptions])}
    {select("assignment", "Assignment", "Enquiry assignment", [["", "All assignments"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"]])}
    {select("assigneeId", "Assignee", "Assignee", [["", "Anyone"], ...[...staff.values()].map(item => [item.id, item.email] as const)])}
    {date("from", "From")}{date("to", "To")}
  </>;
}

export function EnquiryInbox(props: { session: StaffSession; onExpired: () => void }) {
  return <EnquiryInboxSession key={`${props.session.user.id}:${props.session.csrfToken}:${props.session.user.canManageEnquiries}`} {...props} />;
}
function EnquiryInboxSession({ session, onExpired }: { session: StaffSession; onExpired: () => void }) {
  const request = useAdminRequest();
  const today = localToday();
  const [view, setView] = useState<View>("list");
  const [contactId, setContactId] = useState<string | null>(null);
  const [items, setItems] = useState<EnquiryAdminSummary[]>([]);
  const [detail, setDetail] = useState<EnquiryAdminDetail | null>(null);
  const [filters, setFilters] = useState(noFilters);
  const [draft, setDraft] = useState<Filters | null>(null);
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const busy = loading || workflowBusy || deliveryBusy;
  const closed = useRef(false), sequence = useRef(0);
  const expired = useLatest(onExpired);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const detailOpener = useRef<HTMLElement | null>(null);
  const listRegion = useRef<HTMLDivElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const pendingOpen = useRef<string | null>(null);
  const staff = useDirectory(code => denied(code));
  function clear() { setItems([]); setDetail(null); setCursor(null); setLoaded(false); }
  function denied(code: number) {
    sequence.current++; clear(); setContactId(null); setBusy(false); setWorkflowBusy(false); setDeliveryBusy(false);
    if (code !== 401) setError(accessMessage); else if (!closed.current) { closed.current = true; expired.current(); }
  }
  async function run<T>(path: string, schema: z.ZodType<T>, apply: (value: T) => void, payload?: object) {
    const current = ++sequence.current;
    setBusy(true); setError(""); setDetail(null);
    // Search text can be a customer's email or phone: it goes in a POST body, never a URL.
    const result = await readJson(request, path, schema, "Enquiries", payload, session.csrfToken);
    if (current !== sequence.current) return;
    setBusy(false);
    if (result.ok) apply(result.value);
    else if (result.denied) denied(result.denied);
    else { clear(); setError(result.message); }
  }
  const openById = (id: string) => run(`/api/admin/enquiries/${encodeURIComponent(id)}`, enquiryAdminDetailSchema, setDetail);
  function load(next?: string | null) {
    const params: Record<string, string> = { ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), ...(next ? { cursor: next } : {}) };
    setItems([]); setCursor(null); setLoaded(false);
    const search = new URLSearchParams(params);
    const show = (value: z.infer<typeof enquiryAdminListSchema>) => { setItems(value.items); setCursor(value.nextCursor); setLoaded(true); };
    if (query) return run("/api/admin/enquiries/search", enquiryAdminListSchema, show, { ...params, q: query });
    return run(`/api/admin/enquiries${search.size ? `?${search}` : ""}`, enquiryAdminListSchema, show);
  }
  useEffect(() => {
    if (view === "list" && contactId === null) void load().then(() => {
      // A card or contact opened an enquiry from another view: load the list first, then its detail.
      const id = pendingOpen.current; pendingOpen.current = null; if (id) void openById(id);
    });
    return () => { sequence.current++; };
  }, [filters, query, request, view, contactId]);
  function openEnquiry(id: string) {
    if (view === "list" && contactId === null) { void openById(id); return; }
    pendingOpen.current = id; setContactId(null); setView("list");
  }
  function openContact(id: string) { sequence.current++; setDetail(null); setBusy(false); setContactId(id); }
  function openDetail(id: string, opener: HTMLElement | null) { if (!busy) { detailOpener.current = opener; void openById(id); } }
  function closeDetail() {
    const id = detail?.id;
    // Unmount the sheet (and its focus trap) first, then hand focus back to whatever opened it.
    flushSync(() => setDetail(null));
    const row = id ? listRegion.current?.querySelector<HTMLElement>(`[data-enquiry-row="${id}"] button`) : null;
    (detailOpener.current?.isConnected ? detailOpener.current : row ?? reloadButton.current)?.focus();
  }
  function selectView(key: View) { setContactId(null); if (key !== view) { sequence.current++; setDetail(null); setBusy(false); setView(key); } }
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const matches = (row: EnquiryAdminSummary) => (!filters.status || row.status === filters.status) && (!filters.assignment || row.assignedToId === (filters.assignment === "mine" ? session.user.id : null));
  function clearFilters() { setFilters(noFilters); setTerm(""); setQuery(""); }
  const assigneeLabel = (row: EnquiryAdminSummary) => row.assignedToId ? staff.get(row.assignedToId)?.email ?? `Staff ${row.assignedToId}` : "Unassigned";
  // TanStack renders cells as components: stable definitions keep row buttons (and focus) alive, and read live state from this ref.
  const live = useRef({ busy, today, assigneeLabel, openDetail, openContact });
  live.current = { busy, today, assigneeLabel, openDetail, openContact };
  const columns = useMemo<ColumnDef<EnquiryAdminSummary, any>[]>(() => [
    { id: "name", header: "Customer", accessorFn: row => row.name || "No name given", cell: ({ row: { original: row } }) => <div className="grid min-w-0 gap-0.5">
      <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{row.name || "No name given"}</span>
      <span className="text-xs text-muted-foreground">{kindLabels[row.kind] ?? row.kind} enquiry</span>
      <span className="max-w-48 truncate text-2xs text-faint tabular-nums" title={row.id}>{row.id}</span>
    </div> },
    { id: "product", header: "Product", accessorFn: row => row.product, cell: ({ row: { original: row } }) => <span className={row.product ? "text-foreground" : "text-muted-foreground"}>{row.product || "No product noted"}</span>, meta: { className: "max-w-56" } },
    { id: "stage", header: "Stage", accessorKey: "status", sortingFn: (a, b) => stageRank(a.original.status) - stageRank(b.original.status), cell: ({ row: { original: row } }) =>
      <div className="flex flex-wrap items-center gap-1.5"><StageChip stage={row.status} />{row.nextDueOn && <DueBadge state={dueState(row.nextDueOn, live.current.today)} />}</div> },
    { id: "assignee", header: "Assignee", accessorFn: row => live.current.assigneeLabel(row), cell: ({ getValue }) =>
      <span className={getValue() === "Unassigned" ? "text-muted-foreground" : "text-foreground [overflow-wrap:anywhere]"}>{getValue() as string}</span> },
    { id: "received", header: "Received", accessorKey: "createdAt", cell: ({ row: { original: row } }) => <span className="grid gap-0.5 tabular-nums">
      <time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time><span className="text-xs text-muted-foreground">{ago(row.createdAt, live.current.today)}</span>
    </span> },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, enableSorting: false, meta: { className: "w-px text-right" }, cell: ({ row: { original: row } }) => <div className="flex justify-end gap-1">
      <Button type="button" size="sm" variant="outline" disabled={live.current.busy} onClick={event => live.current.openDetail(row.id, event.currentTarget)}>Open enquiry</Button>
      {row.contactId && <Button type="button" size="icon-sm" variant="ghost" title="Open contact" disabled={live.current.busy} aria-label={`Open contact for ${row.name || "enquiry"}`} onClick={() => live.current.openContact(row.contactId!)}><UserRound aria-hidden="true" strokeWidth={1.5} /></Button>}
    </div> },
  ], []);
  const rowOpener = () => { const active = document.activeElement; return active instanceof HTMLElement && listRegion.current?.contains(active) ? active : null; };
  const facts = detail && [["Reference", detail.id], ["Name", detail.name], ["Email", detail.email], ["Phone", detail.phone], ["Product", detail.context.product], ["Variant", detail.context.variant], ["SKU", detail.context.sku], ["Pincode", detail.context.pincode]];
  return <section className="grid min-w-0" aria-label="Customer enquiries" aria-busy={busy}>
    <PanelHeader title="Customer enquiries" description="Every contact, project and bulk enquiry, with its pipeline stage, follow-ups and contact. Replies go out by email from here; everything else stays internal." />
    <TabBar label="CRM views" tabs={views} value={contactId === null ? view : ""} onSelect={selectView} disabled={workflowBusy || deliveryBusy} className="gap-5">
      {contactId !== null && <ContactPage session={session} contactId={contactId} onDenied={denied} onOpenEnquiry={openEnquiry} onBack={() => setContactId(null)} backLabel={view === "list" ? "Back to enquiries" : "Back"} today={today} />}
      <TabsContent value="board"><CrmBoard session={session} onDenied={denied} onOpenEnquiry={openEnquiry} onOpenContact={openContact} today={today} /></TabsContent>
      <TabsContent value="tasks"><TaskViews session={session} onDenied={denied} onOpenEnquiry={openEnquiry} onOpenContact={openContact} today={today} /></TabsContent>
      <TabsContent value="contacts"><ContactsDirectory session={session} onDenied={denied} onOpenContact={openContact} /></TabsContent>
      <TabsContent value="list" className="grid gap-4">
        <form className="grid gap-3 rounded-xl border border-line-soft bg-surface p-4" onSubmit={event => { event.preventDefault(); setQuery(term.trim()); }} aria-label="Search the inbox">
          <div className="hidden flex-wrap items-end gap-3 md:flex"><FilterFields value={filters} onChange={setFilters} staff={staff} disabled={busy} /></div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-[1_1_16rem] gap-1.5 text-xs font-medium text-muted-foreground">Search<Input aria-label="Search enquiries" className="h-8 bg-card text-sm" value={term} maxLength={100} placeholder="Name, email, phone, product or SKU" disabled={busy} onInput={event => setTerm(event.currentTarget.value)} onChange={() => {}} /></label>
            <Button type="submit" size="sm" disabled={busy}><Search aria-hidden="true" strokeWidth={1.5} />Search</Button>
            <Button type="button" size="sm" variant="outline" className="md:hidden" disabled={busy} onClick={() => setDraft(filters)}><SlidersHorizontal aria-hidden="true" strokeWidth={1.5} />Filters{activeFilters ? ` (${activeFilters})` : ""}</Button>
            <Button ref={reloadButton} type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}><RotateCw aria-hidden="true" strokeWidth={1.5} />Reload inbox</Button>
            {(activeFilters > 0 || query || term) && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={clearFilters}>Clear filters</Button>}
          </div>
          {query && <p className="text-xs text-muted-foreground">Showing results for &ldquo;{query}&rdquo;</p>}
        </form>
        {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice>{error !== accessMessage && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Try again</Button>}</div>}
        {busy && <p role="status" className="sr-only">Loading enquiries…</p>}
        {loading && items.length === 0 && !detail && <Skeleton rows={4} />}
        {loaded && items.length === 0 && <EmptyState title="No enquiries match these filters." action={<Button type="button" size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>}>Try a wider date range, another stage, or part of a name, email, phone, product or SKU.</EmptyState>}
        {items.length > 0 && <div ref={listRegion}>
          <DataTable columns={columns} data={items} label="Enquiries" getRowId={row => row.id} rowProps={row => ({ "data-enquiry-row": row.original.id })} empty="No enquiries on this page."
            rowLabel={row => `Open enquiry from ${row.name || "No name given"}`} onRowOpen={row => openDetail(row.id, rowOpener())} />
        </div>}
        {cursor && <Button type="button" variant="outline" size="sm" className="w-fit" disabled={busy} onClick={() => void load(cursor)}>Next page</Button>}
      </TabsContent>
    </TabBar>
    <Sheet open={draft !== null} onOpenChange={open => { if (!open) setDraft(null); }}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-4 overflow-y-auto rounded-t-xl p-5">
        <SheetHeader className="p-0"><SheetTitle>Filter enquiries</SheetTitle><SheetDescription>Filters apply to the whole inbox, not just the loaded page.</SheetDescription></SheetHeader>
        {draft && <div className="grid gap-4 sm:grid-cols-2"><FilterFields value={draft} onChange={setDraft} staff={staff} disabled={busy} /></div>}
        <SheetFooter className="flex-row justify-end gap-2 p-0">
          <Button type="button" variant="ghost" onClick={() => setDraft(noFilters)}>Reset</Button>
          <Button type="button" disabled={busy} onClick={() => { if (draft) setFilters(draft); setDraft(null); }}>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    {detail && <Sheet open onOpenChange={open => { if (!open && !busy) closeDetail(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-background p-0 sm:max-w-[680px]"
        onOpenAutoFocus={event => { event.preventDefault(); detailHeading.current?.focus(); }} onCloseAutoFocus={event => event.preventDefault()}>
        <SheetHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 border-b border-line-soft bg-card px-6 py-5">
          <div className="grid min-w-0 gap-1">
            <SheetTitle ref={detailHeading} tabIndex={-1} className="text-lg leading-tight focus-visible:outline-none">Enquiry details</SheetTitle>
            <SheetDescription className="text-xs [overflow-wrap:anywhere]">{detail.name || "No name given"}, {(kindLabels[detail.kind] ?? detail.kind).toLowerCase()} enquiry received <time dateTime={detail.createdAt}>{formatDate(detail.createdAt)}</time></SheetDescription>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={closeDetail}>Close enquiry</Button>
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <StageChip stage={detail.status} />
            {detail.contactId && <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => openContact(detail.contactId!)}><ArrowUpRight aria-hidden="true" strokeWidth={1.5} />Open contact</Button>}
          </div>
        </SheetHeader>
        <article aria-label="Enquiry detail" className="grid flex-1 content-start gap-7 overflow-y-auto px-6 py-6">
          <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-xs [&_dd]:text-foreground [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-muted-foreground">
            {facts!.map(([term, value]) => <Fragment key={term}><dt>{term}</dt><dd className="tabular-nums">{value || "Not provided"}</dd></Fragment>)}
          </dl>
          <Subsection title="Message">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{detail.message || "No message supplied."}</p>
            {detail.reviews.map(review => <p key={review.id} className="text-xs text-muted-foreground">Reviewed by staff {review.actorId} at <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString()}</time> (before the pipeline existed).</p>)}
          </Subsection>
          <EnquiryWorkflow key={detail.id} detail={detail} session={session} emailEnabled={emailEnabled} onBusy={setWorkflowBusy} onDenied={denied} onChange={value => {
            setDetail(value); setItems(rows => rows.map(row => row.id === value.id ? { ...row, status: value.status, version: value.version, assignedToId: value.assignedToId } : row).filter(matches));
          }} />
          <div className="border-t border-line-soft pt-6"><EnquiryDeliveryPanel key={detail.id} enquiryId={detail.id} session={session} onBusy={setDeliveryBusy} onDenied={denied} onEnabled={setEmailEnabled} /></div>
        </article>
      </SheetContent>
    </Sheet>}
  </section>;
}
