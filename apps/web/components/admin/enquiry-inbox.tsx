"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { enquiryAdminListSchema, enquiryAdminDetailSchema, type EnquiryAdminSummary, type EnquiryAdminDetail } from "@shopmaple/contracts";
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
    const detailOpener = useRef<HTMLButtonElement | null>(null);
    const reloadButton = useRef<HTMLButtonElement>(null);
    const staff = useDirectory(code => denied(code));
    const pendingOpen = useRef<string | null>(null);
    useEffect(() => { if (detail)
        detailHeading.current?.focus(); }, [detail?.id]);
    function clear() { setItems([]); setDetail(null); setCursor(null); setLoaded(false); }
    function expire() { if (closed.current) return; closed.current = true; expired.current(); }
    function denied(code: number) { sequence.current++; clear(); setContactId(null); setBusy(false); setWorkflowBusy(false); setDeliveryBusy(false); if (code === 401) expire(); else setError("Your account does not have access to customer enquiries. Contact your administrator."); }
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
                setError("Your account does not have access to customer enquiries. Contact your administrator.");
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
    const filtered = Boolean(kind || status || assignment || assigneeId || from || to || query || term);
    function clearFilters() { setKind(""); setStatus(""); setAssignment(""); setAssigneeId(""); setFrom(""); setTo(""); setTerm(""); setQuery(""); }
    function search(event: FormEvent) { event.preventDefault(); setQuery(term.trim()); }
    const filtersDisabled = busy;
    return <section className="admin-enquiry-inbox crm" aria-label="Customer enquiries" aria-busy={busy}>
    <h2>Customer enquiries</h2>
    <p className="crm-lede">Every contact, project and bulk enquiry, with its pipeline stage, follow-ups and contact. Replies go out by email from here; everything else stays internal.</p>
    <div role="tablist" aria-label="CRM views" className="crm-tabs">
      {views.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key && contactId === null} disabled={workflowBusy || deliveryBusy} onClick={() => { setContactId(null); if (key !== view) { sequence.current++; setDetail(null); setBusy(false); setView(key); } }}>{label}</button>)}
    </div>
    {contactId !== null && <ContactPage session={session} contactId={contactId} onDenied={denied} onOpenEnquiry={openEnquiry} onBack={() => setContactId(null)} backLabel={view === "list" ? "Back to enquiries" : "Back"} today={today} />}
    {contactId === null && view === "board" && <CrmBoard session={session} onDenied={denied} onOpenEnquiry={openEnquiry} onOpenContact={openContact} today={today} />}
    {contactId === null && view === "tasks" && <TaskViews session={session} onDenied={denied} onOpenEnquiry={openEnquiry} onOpenContact={openContact} today={today} />}
    {contactId === null && view === "contacts" && <ContactsDirectory session={session} onDenied={denied} onOpenContact={openContact} />}
    {contactId === null && view === "list" && <>
    <form className="crm-filters" onSubmit={search}>
      <label className="crm-field"><span>Kind</span><select aria-label="Enquiry kind" value={kind} disabled={filtersDisabled} onChange={event => setKind(event.target.value)}><option value="">All kinds</option><option value="contact">Contact</option><option value="project">Project</option><option value="bulk">Bulk</option></select></label>
      <label className="crm-field"><span>Stage</span><select aria-label="Enquiry status" value={status} disabled={filtersDisabled} onChange={event => setStatus(event.target.value)}><option value="">All stages</option>{stageOptions.map(([stage, label]) => <option key={stage} value={stage}>{label}</option>)}</select></label>
      <label className="crm-field"><span>Assignment</span><select aria-label="Enquiry assignment" value={assignment} disabled={filtersDisabled} onChange={event => setAssignment(event.target.value)}><option value="">All assignments</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
      <label className="crm-field"><span>Assignee</span><select aria-label="Assignee" value={assigneeId} disabled={filtersDisabled} onChange={event => setAssigneeId(event.target.value)}><option value="">Anyone</option>{[...staff.values()].map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
      <label className="crm-field"><span>From</span><input aria-label="From date" type="date" value={from} disabled={filtersDisabled} onChange={event => setFrom(event.target.value)} /></label>
      <label className="crm-field"><span>To</span><input aria-label="To date" type="date" value={to} disabled={filtersDisabled} onChange={event => setTo(event.target.value)} /></label>
      <div className="crm-search">
        <label className="crm-field"><span>Search</span><input aria-label="Search enquiries" value={term} maxLength={100} placeholder="Name, email, phone, product or SKU" disabled={filtersDisabled} onInput={event => setTerm(event.currentTarget.value)} /></label>
        <button type="submit" disabled={filtersDisabled}>Search</button>
      </div>
    </form>
    <div className="crm-filter-actions">
      <button ref={reloadButton} type="button" disabled={busy} onClick={() => void load()}>Reload inbox</button>
      {filtered && <button type="button" className="crm-button-quiet" disabled={filtersDisabled} onClick={clearFilters}>Clear filters</button>}
      {query && <span className="crm-faint">Showing results for &ldquo;{query}&rdquo;</span>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {busy && <p role="status" className="crm-faint">Loading enquiries…</p>}
    {loading && items.length === 0 && !detail && <Skeleton rows={4} />}
    {loaded && items.length === 0 && <EmptyState title="No enquiries match these filters." action={<button type="button" className="crm-button-small" onClick={clearFilters}>Clear filters</button>}>Try a wider date range, another stage, or part of a name, email, phone, product or SKU.</EmptyState>}
    <ul className="crm-rows">{items.map(row => <li key={row.id}><div className="crm-row" data-enquiry-row={row.id}>
      <div className="crm-row-primary"><strong>{row.name || "No name given"}</strong><span className="crm-faint">{kindLabels[row.kind] ?? row.kind} enquiry, {ageLabel(row.createdAt, today) === "Today" ? "today" : `${ageLabel(row.createdAt, today)} ago`} (<time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time>)</span></div>
      <div className="crm-row-secondary"><span>{row.product || "No product noted"}</span><span>{row.assignedToId ? staff.get(row.assignedToId)?.email ?? `Staff ${row.assignedToId}` : "Unassigned"}</span><span className="crm-faint crm-num">{row.id}</span></div>
      <div className="crm-row-meta"><StageChip stage={row.status} />{row.nextDueOn && <DueBadge state={dueState(row.nextDueOn, today)} />}</div>
      <div className="crm-row-actions">
        <button type="button" className="crm-button-small" disabled={busy} onClick={event => { detailOpener.current = event.currentTarget; void run(`/api/admin/enquiries/${encodeURIComponent(row.id)}`, "detail"); }}>Open enquiry</button>
        {row.contactId && <button type="button" className="crm-button-quiet crm-button-small" disabled={busy} aria-label={`Open contact for ${row.name || "enquiry"}`} onClick={() => openContact(row.contactId!)}>Contact</button>}
      </div>
    </div></li>)}</ul>
    {cursor && <button type="button" className="crm-pager" disabled={busy} onClick={() => void load(cursor)}>Next page</button>}
    {detail && <article aria-label="Enquiry detail">
      <h3 tabIndex={-1} ref={detailHeading}>Enquiry details</h3>
      <div className="crm-row-meta" style={{ marginBottom: 12 }}><StageChip stage={detail.status} /><span className="crm-faint">{kindLabels[detail.kind] ?? detail.kind} enquiry received <time dateTime={detail.createdAt}>{formatDate(detail.createdAt)}</time></span>{detail.contactId && <button type="button" className="crm-button-quiet crm-button-small" disabled={busy} onClick={() => openContact(detail.contactId!)}>Open contact</button>}</div>
      <dl><dt>Reference</dt><dd>{detail.id}</dd><dt>Name</dt><dd>{detail.name || "Not provided"}</dd><dt>Email</dt><dd>{detail.email}</dd><dt>Phone</dt><dd>{detail.phone || "Not provided"}</dd><dt>Product</dt><dd>{detail.context.product || "Not provided"}</dd><dt>Variant</dt><dd>{detail.context.variant || "Not provided"}</dd><dt>SKU</dt><dd>{detail.context.sku || "Not provided"}</dd><dt>Pincode</dt><dd>{detail.context.pincode || "Not provided"}</dd></dl>
      <h4>Message</h4><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{detail.message || "No message supplied."}</p>
      {detail.reviews.map(review => <p key={review.id} className="crm-faint">Reviewed by staff {review.actorId} at <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString()}</time> (before the pipeline existed).</p>)}
      <EnquiryWorkflow key={detail.id} detail={detail} session={session} emailEnabled={emailEnabled} onBusy={setWorkflowBusy} onChange={value => { setDetail(value); setItems(rows => rows.map(row => row.id === value.id ? { ...row, status: value.status, version: value.version, assignedToId: value.assignedToId } : row).filter(row => (!status || row.status === status) && (!assignment || (assignment === "mine" ? row.assignedToId === session.user.id : row.assignedToId === null)))); }} onDenied={denied} />
      <EnquiryDeliveryPanel enquiryId={detail.id} session={session} onBusy={setDeliveryBusy} onDenied={denied} onEnabled={setEmailEnabled} />
      <button type="button" disabled={busy} onClick={() => { setDetail(null); (detailOpener.current?.isConnected ? detailOpener.current : reloadButton.current)?.focus(); }}>Close enquiry</button>
    </article>}
    </>}
  </section>;
}
