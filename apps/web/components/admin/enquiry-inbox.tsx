"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, RotateCw, Search, UserRound } from "lucide-react";
import { enquiryAdminListSchema, enquiryAdminDetailSchema, enquiryStages, type EnquiryAdminSummary, type EnquiryAdminDetail } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "./data-table";
import { PanelHeader } from "./kit";
import { EnquiryWorkflow } from "./enquiry-workflow";
import { EnquiryDeliveryPanel } from "./enquiry-delivery-panel";
import { CrmBoard } from "./crm-board";
import { TaskViews } from "./crm-tasks";
import { ContactPage, ContactsDirectory } from "./contact-page";
import { DueBadge, EmptyState, Notice, Skeleton, StageChip, ageLabel, dueState, formatDate, localToday, stageOptions, useDirectory } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const views = [["list", "List"], ["board", "Board"], ["tasks", "Follow-ups"], ["contacts", "Contacts"]] as const;
type View = (typeof views)[number][0];
const kindLabels: Record<string, string> = { contact: "Contact", project: "Project", bulk: "Bulk" };
const accessMessage = "Your account does not have access to customer enquiries. Contact your administrator.";
const fieldLabel = "grid gap-1.5 text-xs font-medium text-muted-foreground";
const stageRank = (stage: string) => (enquiryStages as readonly string[]).indexOf(stage);

export function EnquiryInbox(props: { session: StaffSession; onExpired: () => void }) {
    return <EnquiryInboxSession key={`${props.session.user.id}:${props.session.csrfToken}:${props.session.user.canManageEnquiries}`} {...props} />;
}
function EnquiryInboxSession({ session, onExpired }: {
    session: StaffSession;
    onExpired: () => void;
}) {
    const request = useAdminRequest();
    const today = localToday();
    const [view, setView] = useState<View>("list");
    const [contactId, setContactId] = useState<string | null>(null);
    const [items, setItems] = useState<EnquiryAdminSummary[]>([]);
    const [detail, setDetail] = useState<EnquiryAdminDetail | null>(null);
    const [kind, setKind] = useState("");
    const [status, setStatus] = useState("");
    const [assignment, setAssignment] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [term, setTerm] = useState("");
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setBusy] = useState(false);
    const [workflowBusy, setWorkflowBusy] = useState(false);
    const [deliveryBusy, setDeliveryBusy] = useState(false);
    const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
    const closed = useRef(false);
    const busy = loading || workflowBusy || deliveryBusy;
    const [error, setError] = useState("");
    const [loaded, setLoaded] = useState(false);
    const sequence = useRef(0);
    const expired = useRef(onExpired);
    expired.current = onExpired;
    const detailHeading = useRef<HTMLHeadingElement>(null);
    const detailOpener = useRef<HTMLElement | null>(null);
    const listRegion = useRef<HTMLDivElement>(null);
    const reloadButton = useRef<HTMLButtonElement>(null);
    const staff = useDirectory(code => denied(code));
    const pendingOpen = useRef<string | null>(null);
    function clear() { setItems([]); setDetail(null); setCursor(null); setLoaded(false); }
    function expire() { if (closed.current) return; closed.current = true; expired.current(); }
    function denied(code: number) { sequence.current++; clear(); setContactId(null); setBusy(false); setWorkflowBusy(false); setDeliveryBusy(false); if (code === 401) expire(); else setError(accessMessage); }
    async function run(path: string, mode: "list" | "detail", payload?: object) {
        const current = ++sequence.current;
        setBusy(true);
        setError("");
        setDetail(null);
        if (mode === "list") { setItems([]); setCursor(null); setLoaded(false); }
        try {
            // Search text can be a customer's email or phone: it goes in a POST body, never a URL.
            const response = await request(path, payload ? { cache: "no-store", credentials: "same-origin", method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(payload) } : { cache: "no-store", credentials: "same-origin" });
            if (current !== sequence.current)
                return;
            if (response.status === 401) {
                clear();
                expire();
                return;
            }
            if (response.status === 403) {
                clear();
                setError(accessMessage);
                return;
            }
            if (!response.ok)
                throw Error("Request failed");
            const body: unknown = await response.json();
            if (current !== sequence.current)
                return;
            if (mode === "list") {
                const value = enquiryAdminListSchema.parse(body);
                setItems(value.items);
                setCursor(value.nextCursor);
                setLoaded(true);
            }
            else {
                const value = enquiryAdminDetailSchema.parse(body);
                setDetail(value);
            }
        }
        catch (failure) {
            if (current === sequence.current) {
                clear();
                setError(failure instanceof AdminRequestTimeout ? "Loading enquiries timed out. Please reload the inbox." : "We couldn't load enquiries. Please reload the inbox.");
            }
        }
        finally {
            if (current === sequence.current)
                setBusy(false);
        }
    }
    function load(next?: string | null) {
        const filters: Record<string, string> = {};
        if (kind) filters.kind = kind;
        if (status) filters.status = status;
        if (assignment) filters.assignment = assignment;
        if (assigneeId) filters.assigneeId = assigneeId;
        if (from) filters.from = from;
        if (to) filters.to = to;
        if (next) filters.cursor = next;
        if (query) return run("/api/admin/enquiries/search", "list", { ...filters, q: query });
        const params = new URLSearchParams(filters);
        return run(`/api/admin/enquiries${params.size ? `?${params}` : ""}`, "list");
    }
    useEffect(() => {
        if (view === "list" && contactId === null) void load().then(() => {
            // A card or contact opened an enquiry from another view: load the list first, then its detail.
            const id = pendingOpen.current; pendingOpen.current = null;
            if (id) void run(`/api/admin/enquiries/${encodeURIComponent(id)}`, "detail");
        });
        return () => { sequence.current++; };
    }, [kind, status, assignment, assigneeId, from, to, query, request, view, contactId]);
    function openEnquiry(id: string) {
        if (view === "list" && contactId === null) { void run(`/api/admin/enquiries/${encodeURIComponent(id)}`, "detail"); return; }
        pendingOpen.current = id; setContactId(null); setView("list");
    }
    function openContact(id: string) {
        sequence.current++; setDetail(null); setBusy(false); setContactId(id);
    }
    function openDetail(id: string, opener: HTMLElement | null) {
        if (busy) return;
        detailOpener.current = opener;
        void run(`/api/admin/enquiries/${encodeURIComponent(id)}`, "detail");
    }
    function closeDetail() {
        const id = detail?.id;
        // Unmount the sheet (and its focus trap) first, then hand focus back to whatever opened it.
        flushSync(() => setDetail(null));
        const row = id ? listRegion.current?.querySelector<HTMLElement>(`[data-enquiry-row="${id}"] button`) : null;
        (detailOpener.current?.isConnected ? detailOpener.current : row ?? reloadButton.current)?.focus();
    }
    function selectView(key: View) {
        setContactId(null);
        if (key !== view) { sequence.current++; setDetail(null); setBusy(false); setView(key); }
    }
    const filtered = Boolean(kind || status || assignment || assigneeId || from || to || query || term);
    function clearFilters() { setKind(""); setStatus(""); setAssignment(""); setAssigneeId(""); setFrom(""); setTo(""); setTerm(""); setQuery(""); }
    function search(event: FormEvent) { event.preventDefault(); setQuery(term.trim()); }
    const filtersDisabled = busy;
    const assigneeLabel = (row: EnquiryAdminSummary) => row.assignedToId ? staff.get(row.assignedToId)?.email ?? `Staff ${row.assignedToId}` : "Unassigned";
    const assigneeOptions = [...new Set(items.map(assigneeLabel))].sort((a, b) => a === "Unassigned" ? -1 : b === "Unassigned" ? 1 : a.localeCompare(b));
    // TanStack renders each cell function as a component: the definitions stay stable (so row buttons
    // keep their DOM nodes and focus) and read the current busy state and handlers from this ref.
    const live = useRef({ busy, today, assigneeLabel, openDetail, openContact });
    live.current = { busy, today, assigneeLabel, openDetail, openContact };
    const optionsKey = assigneeOptions.join("\n");
    const columns = useMemo<ColumnDef<EnquiryAdminSummary, any>[]>(() => [
        {
            id: "name", header: "Customer", accessorFn: row => row.name || "No name given",
            meta: { filter: "text", label: "Name" },
            cell: ({ row: { original: row } }) => <div className="grid min-w-0 gap-0.5">
                <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{row.name || "No name given"}</span>
                <span className="text-xs text-muted-foreground">{kindLabels[row.kind] ?? row.kind} enquiry</span>
                <span className="max-w-48 truncate text-2xs text-faint tabular-nums" title={row.id}>{row.id}</span>
            </div>,
        },
        { id: "product", header: "Product", accessorFn: row => row.product, cell: ({ row: { original: row } }) => <span className={row.product ? "text-foreground" : "text-muted-foreground"}>{row.product || "No product noted"}</span>, meta: { className: "max-w-56" } },
        {
            id: "stage", header: "Stage", accessorKey: "status", filterFn: "equalsString",
            sortingFn: (a, b) => stageRank(a.original.status) - stageRank(b.original.status),
            meta: { filter: "select", label: "Stage", options: stageOptions },
            cell: ({ row: { original: row } }) => <div className="flex flex-wrap items-center gap-1.5"><StageChip stage={row.status} />{row.nextDueOn && <DueBadge state={dueState(row.nextDueOn, live.current.today)} />}</div>,
        },
        {
            id: "assignee", header: "Assignee", accessorFn: row => live.current.assigneeLabel(row), filterFn: "equalsString",
            meta: { filter: "select", label: "Assignee", options: optionsKey ? optionsKey.split("\n").map(label => [label, label] as const) : [] },
            cell: ({ getValue }) => <span className={getValue() === "Unassigned" ? "text-muted-foreground" : "text-foreground [overflow-wrap:anywhere]"}>{getValue() as string}</span>,
        },
        {
            id: "received", header: "Received", accessorKey: "createdAt",
            cell: ({ row: { original: row } }) => { const age = ageLabel(row.createdAt, live.current.today); return <span className="grid gap-0.5 tabular-nums"><time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time><span className="text-xs text-muted-foreground">{age === "Today" ? "Today" : `${age} ago`}</span></span>; },
        },
        {
            id: "actions", header: () => <span className="sr-only">Actions</span>, enableSorting: false, meta: { className: "w-px text-right" },
            cell: ({ row: { original: row } }) => <div className="flex justify-end gap-1">
                <Button type="button" size="sm" variant="outline" disabled={live.current.busy} onClick={event => live.current.openDetail(row.id, event.currentTarget)}>Open enquiry</Button>
                {row.contactId && <Button type="button" size="icon-sm" variant="ghost" title="Open contact" disabled={live.current.busy} aria-label={`Open contact for ${row.name || "enquiry"}`} onClick={() => live.current.openContact(row.contactId!)}><UserRound aria-hidden="true" strokeWidth={1.5} /></Button>}
            </div>,
        },
    ], [optionsKey]);
    const rowOpener = () => { const active = document.activeElement; return active instanceof HTMLElement && listRegion.current?.contains(active) ? active : null; };
    const tabValue = contactId === null ? view : "";
    return <section className="grid min-w-0" aria-label="Customer enquiries" aria-busy={busy}>
    <PanelHeader title="Customer enquiries" description="Every contact, project and bulk enquiry, with its pipeline stage, follow-ups and contact. Replies go out by email from here; everything else stays internal." />
    <Tabs value={tabValue} onValueChange={value => selectView(value as View)} className="gap-5">
      <TabsList aria-label="CRM views" className="h-9">
        {views.map(([key, label]) => <TabsTrigger key={key} value={key} className="px-3 text-sm" disabled={workflowBusy || deliveryBusy} onClick={() => selectView(key)}>{label}</TabsTrigger>)}
      </TabsList>
      {contactId !== null && <ContactPage session={session} contactId={contactId} onDenied={denied} onOpenEnquiry={openEnquiry} onBack={() => setContactId(null)} backLabel={view === "list" ? "Back to enquiries" : "Back"} today={today} />}
      <TabsContent value="board"><CrmBoard session={session} onDenied={denied} onOpenEnquiry={openEnquiry} onOpenContact={openContact} today={today} /></TabsContent>
      <TabsContent value="tasks"><TaskViews session={session} onDenied={denied} onOpenEnquiry={openEnquiry} onOpenContact={openContact} today={today} /></TabsContent>
      <TabsContent value="contacts"><ContactsDirectory session={session} onDenied={denied} onOpenContact={openContact} /></TabsContent>
      <TabsContent value="list" className="grid gap-4">
        <form className="grid gap-3 rounded-xl border border-line-soft bg-surface p-4" onSubmit={search} aria-label="Search the inbox">
          <div className="flex flex-wrap items-end gap-3">
            <label className={fieldLabel}>Kind<NativeSelect size="sm" className="min-w-32 bg-card" aria-label="Enquiry kind" value={kind} disabled={filtersDisabled} onChange={event => setKind(event.target.value)}><NativeSelectOption value="">All kinds</NativeSelectOption><NativeSelectOption value="contact">Contact</NativeSelectOption><NativeSelectOption value="project">Project</NativeSelectOption><NativeSelectOption value="bulk">Bulk</NativeSelectOption></NativeSelect></label>
            <label className={fieldLabel}>Stage<NativeSelect size="sm" className="min-w-32 bg-card" aria-label="Enquiry status" value={status} disabled={filtersDisabled} onChange={event => setStatus(event.target.value)}><NativeSelectOption value="">All stages</NativeSelectOption>{stageOptions.map(([stage, label]) => <NativeSelectOption key={stage} value={stage}>{label}</NativeSelectOption>)}</NativeSelect></label>
            <label className={fieldLabel}>Assignment<NativeSelect size="sm" className="min-w-36 bg-card" aria-label="Enquiry assignment" value={assignment} disabled={filtersDisabled} onChange={event => setAssignment(event.target.value)}><NativeSelectOption value="">All assignments</NativeSelectOption><NativeSelectOption value="mine">Assigned to me</NativeSelectOption><NativeSelectOption value="unassigned">Unassigned</NativeSelectOption></NativeSelect></label>
            <label className={fieldLabel}>Assignee<NativeSelect size="sm" className="min-w-40 bg-card" aria-label="Assignee" value={assigneeId} disabled={filtersDisabled} onChange={event => setAssigneeId(event.target.value)}><NativeSelectOption value="">Anyone</NativeSelectOption>{[...staff.values()].map(item => <NativeSelectOption key={item.id} value={item.id}>{item.email}</NativeSelectOption>)}</NativeSelect></label>
            <label className={fieldLabel}>From<Input aria-label="From date" type="date" className="h-8 w-40 bg-card text-sm" value={from} disabled={filtersDisabled} onChange={event => setFrom(event.target.value)} /></label>
            <label className={fieldLabel}>To<Input aria-label="To date" type="date" className="h-8 w-40 bg-card text-sm" value={to} disabled={filtersDisabled} onChange={event => setTo(event.target.value)} /></label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${fieldLabel} min-w-64 flex-1`}>Search<Input aria-label="Search enquiries" className="h-8 bg-card text-sm" value={term} maxLength={100} placeholder="Name, email, phone, product or SKU" disabled={filtersDisabled} onInput={event => setTerm(event.currentTarget.value)} onChange={() => {}} /></label>
            <Button type="submit" size="sm" disabled={filtersDisabled}><Search aria-hidden="true" strokeWidth={1.5} />Search</Button>
            <Button ref={reloadButton} type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}><RotateCw aria-hidden="true" strokeWidth={1.5} />Reload inbox</Button>
            {filtered && <Button type="button" size="sm" variant="ghost" disabled={filtersDisabled} onClick={clearFilters}>Clear filters</Button>}
          </div>
          {query && <p className="text-xs text-muted-foreground">Showing results for &ldquo;{query}&rdquo;</p>}
        </form>
        {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice>{error !== accessMessage && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Try again</Button>}</div>}
        {busy && <p role="status" className="sr-only">Loading enquiries…</p>}
        {loading && items.length === 0 && !detail && <Skeleton rows={4} />}
        {loaded && items.length === 0 && <EmptyState title="No enquiries match these filters." action={<Button type="button" size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>}>Try a wider date range, another stage, or part of a name, email, phone, product or SKU.</EmptyState>}
        {items.length > 0 && <div ref={listRegion} className="grid gap-3">
          <DataTable columns={columns} data={items} label="Enquiries" getRowId={row => row.id} rowProps={row => ({ "data-enquiry-row": row.original.id })}
            rowLabel={row => `Open enquiry from ${row.name || "No name given"}`} onRowOpen={row => openDetail(row.id, rowOpener())}
            empty="No loaded enquiries match these column filters. Clear a filter, or search the whole inbox above." />
          <p className="text-xs text-muted-foreground">Column filters narrow the rows on this page. The search above covers the whole inbox.</p>
        </div>}
        {cursor && <Button type="button" variant="outline" size="sm" className="w-fit" disabled={busy} onClick={() => void load(cursor)}>Next page</Button>}
      </TabsContent>
    </Tabs>
    {detail && <Sheet open onOpenChange={open => { if (!open && !busy) closeDetail(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-background p-0 sm:max-w-[680px]"
        onOpenAutoFocus={event => { event.preventDefault(); detailHeading.current?.focus(); }}
        onCloseAutoFocus={event => event.preventDefault()}>
        <SheetHeader className="gap-3 border-b border-line-soft bg-card px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid min-w-0 gap-1">
              <SheetTitle ref={detailHeading} tabIndex={-1} className="text-lg leading-tight focus-visible:outline-none">Enquiry details</SheetTitle>
              <SheetDescription className="text-xs [overflow-wrap:anywhere]">{detail.name || "No name given"}, {(kindLabels[detail.kind] ?? detail.kind).toLowerCase()} enquiry received <time dateTime={detail.createdAt}>{formatDate(detail.createdAt)}</time></SheetDescription>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={closeDetail}>Close enquiry</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StageChip stage={detail.status} />
            {detail.contactId && <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => openContact(detail.contactId!)}><ArrowUpRight aria-hidden="true" strokeWidth={1.5} />Open contact</Button>}
          </div>
        </SheetHeader>
        <article aria-label="Enquiry detail" className="grid flex-1 content-start gap-7 overflow-y-auto px-6 py-6">
          <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-xs [&_dd]:text-foreground [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-muted-foreground">
            <dt>Reference</dt><dd className="tabular-nums">{detail.id}</dd><dt>Name</dt><dd>{detail.name || "Not provided"}</dd><dt>Email</dt><dd>{detail.email}</dd><dt>Phone</dt><dd>{detail.phone || "Not provided"}</dd><dt>Product</dt><dd>{detail.context.product || "Not provided"}</dd><dt>Variant</dt><dd>{detail.context.variant || "Not provided"}</dd><dt>SKU</dt><dd>{detail.context.sku || "Not provided"}</dd><dt>Pincode</dt><dd>{detail.context.pincode || "Not provided"}</dd>
          </dl>
          <div className="grid gap-2">
            <h4 className="text-sm font-semibold text-foreground">Message</h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{detail.message || "No message supplied."}</p>
            {detail.reviews.map(review => <p key={review.id} className="text-xs text-muted-foreground">Reviewed by staff {review.actorId} at <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString()}</time> (before the pipeline existed).</p>)}
          </div>
          <EnquiryWorkflow key={detail.id} detail={detail} session={session} emailEnabled={emailEnabled} onBusy={setWorkflowBusy} onChange={value => { setDetail(value); setItems(rows => rows.map(row => row.id === value.id ? { ...row, status: value.status, version: value.version, assignedToId: value.assignedToId } : row).filter(row => (!status || row.status === status) && (!assignment || (assignment === "mine" ? row.assignedToId === session.user.id : row.assignedToId === null)))); }} onDenied={denied} />
          <div className="border-t border-line-soft pt-6"><EnquiryDeliveryPanel enquiryId={detail.id} session={session} onBusy={setDeliveryBusy} onDenied={denied} onEnabled={setEmailEnabled} /></div>
        </article>
      </SheetContent>
    </Sheet>}
  </section>;
}
