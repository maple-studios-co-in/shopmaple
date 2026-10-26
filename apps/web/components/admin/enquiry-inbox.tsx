"use client";
import { useEffect, useRef, useState } from "react";
import { enquiryAdminListSchema, enquiryAdminDetailSchema, type EnquiryAdminSummary, type EnquiryAdminDetail } from "@shopmaple/contracts";
import { EnquiryWorkflow } from "./enquiry-workflow";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";
export function EnquiryInbox(props: { session: StaffSession; onExpired: () => void }) {
    return <EnquiryInboxSession key={`${props.session.user.id}:${props.session.csrfToken}:${props.session.user.canManageEnquiries}`} {...props} />;
}
function EnquiryInboxSession({ session, onExpired }: {
    session: StaffSession;
    onExpired: () => void;
}) {
    const request = useAdminRequest();
    const [items, setItems] = useState<EnquiryAdminSummary[]>([]);
    const [detail, setDetail] = useState<EnquiryAdminDetail | null>(null);
    const [kind, setKind] = useState("");
    const [status, setStatus] = useState("");
    const [assignment, setAssignment] = useState("");
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setBusy] = useState(false);
    const [workflowBusy, setWorkflowBusy] = useState(false);
    const busy = loading || workflowBusy;
    const [error, setError] = useState("");
    const [loaded, setLoaded] = useState(false);
    const sequence = useRef(0);
    const expired = useRef(onExpired);
    expired.current = onExpired;
    const detailHeading = useRef<HTMLHeadingElement>(null);
    const detailOpener = useRef<HTMLButtonElement | null>(null);
    const reloadButton = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (detail)
        detailHeading.current?.focus(); }, [detail?.id]);
    function clear() { setItems([]); setDetail(null); setCursor(null); setLoaded(false); }
    async function run(path: string, mode: "list" | "detail") {
        const current = ++sequence.current;
        setBusy(true);
        setError("");
        setDetail(null);
        if (mode === "list") { setItems([]); setCursor(null); setLoaded(false); }
        try {
            const response = await request(path, { cache: "no-store", credentials: "same-origin" });
            if (current !== sequence.current)
                return;
            if (response.status === 401) {
                clear();
                expired.current();
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
        const query = new URLSearchParams();
        if (kind)
            query.set("kind", kind);
        if (status)
            query.set("status", status);
        if (assignment)
            query.set("assignment", assignment);
        if (next)
            query.set("cursor", next);
        return run(`/api/admin/enquiries${query.size ? `?${query}` : ""}`, "list");
    }
    useEffect(() => { void load(); return () => { sequence.current++; }; }, [kind, status, assignment, request]);
    return <section className="admin-enquiry-inbox" aria-label="Customer enquiries" aria-busy={busy}>
    <h2>Customer enquiries</h2>
    <p>Contact, project and bulk submissions. Reviewing records an internal acknowledgement; it does not send a reply.</p>
    <div className="admin-toolbar">
      <label>Enquiry kind<select aria-label="Enquiry kind" value={kind} disabled={busy} onChange={event => setKind(event.target.value)}><option value="">All kinds</option><option value="contact">Contact</option><option value="project">Project</option><option value="bulk">Bulk</option></select></label>
      <label>Enquiry status<select aria-label="Enquiry status" value={status} disabled={busy} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="new">New</option><option value="reviewed">Reviewed</option></select></label>
      <label>Enquiry assignment<select aria-label="Enquiry assignment" value={assignment} disabled={busy} onChange={event => setAssignment(event.target.value)}><option value="">All assignments</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
      <button ref={reloadButton} type="button" disabled={busy} onClick={() => void load()}>Reload inbox</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading enquiries…</p>}
    {loaded && items.length === 0 && <p>No enquiries match these filters.</p>}
    <ul>{items.map(row => <li key={row.id}><strong>{row.kind}</strong> · {row.status === "new" ? "New" : "Reviewed"} · <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time><span> · {row.id}</span> <button type="button" disabled={busy} onClick={event => { detailOpener.current = event.currentTarget; void run(`/api/admin/enquiries/${encodeURIComponent(row.id)}`, "detail"); }}>Open enquiry</button></li>)}</ul>
    {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>Next page</button>}
    {detail && <article aria-label="Enquiry detail">
      <h3 tabIndex={-1} ref={detailHeading}>Enquiry details</h3>
      <dl><dt>Reference</dt><dd>{detail.id}</dd><dt>Name</dt><dd>{detail.name || "Not provided"}</dd><dt>Email</dt><dd>{detail.email}</dd><dt>Phone</dt><dd>{detail.phone || "Not provided"}</dd><dt>Status</dt><dd>{detail.status === "new" ? "New" : "Reviewed"}</dd><dt>Product</dt><dd>{detail.context.product || "Not provided"}</dd><dt>Variant</dt><dd>{detail.context.variant || "Not provided"}</dd><dt>SKU</dt><dd>{detail.context.sku || "Not provided"}</dd><dt>Pincode</dt><dd>{detail.context.pincode || "Not provided"}</dd></dl>
      <h4>Message</h4><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{detail.message || "No message supplied."}</p>
      {detail.reviews.map(review => <p key={review.id}>Reviewed by staff {review.actorId} at <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString()}</time>.</p>)}
      <EnquiryWorkflow key={detail.id} detail={detail} session={session} onBusy={setWorkflowBusy} onChange={value => { setDetail(value); setItems(rows => rows.map(row => row.id === value.id ? { ...row, status: value.status, version: value.version, assignedToId: value.assignedToId } : row).filter(row => (!status || row.status === status) && (!assignment || (assignment === "mine" ? row.assignedToId === session.user.id : row.assignedToId === null)))); }} onDenied={code => { sequence.current++; clear(); setBusy(false); setWorkflowBusy(false); if (code === 401) expired.current(); else setError("Your account does not have access to customer enquiries. Contact your administrator."); }} />
      <button type="button" disabled={busy} onClick={() => { setDetail(null); (detailOpener.current?.isConnected ? detailOpener.current : reloadButton.current)?.focus(); }}>Close enquiry</button>
    </article>}
  </section>;
}
