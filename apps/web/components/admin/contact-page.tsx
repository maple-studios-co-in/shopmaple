"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { contactListSchema, contactSchema, contactTimelineSchema, enquiryAdminSummarySchema, enquiryStageLabels, type Contact, type ContactTimelineEntry, type EnquiryAdminSummary } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { TaskPanel } from "./crm-tasks";
import { EmptyState, Notice, Skeleton, StageChip, ageLabel, formatDate, formatDateTime, localToday, readJson, useDirectory, writeOptions } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const detailSchema = z.object({ contact: contactSchema, enquiries: z.array(enquiryAdminSummarySchema).max(50) }).strict();
type Directory = ReturnType<typeof useDirectory>;
const kindLabels: Record<string, string> = { contact: "Contact", project: "Project", bulk: "Bulk" };

function describe(entry: ContactTimelineEntry): { title: string; kind: "stage" | "email" | "task" | "note" | "plain" } {
  switch (entry.action) {
    case "enquiry_received": return { title: "Enquiry received", kind: "plain" };
    case "status_changed": return { title: `Moved to ${entry.stage ? enquiryStageLabels[entry.stage] : "a new stage"}`, kind: "stage" };
    case "note": return { title: "Internal note", kind: "note" };
    case "assigned": return { title: "Assigned", kind: "plain" };
    case "unassigned": return { title: "Unassigned", kind: "plain" };
    case "task_created": return { title: "Follow-up added", kind: "task" };
    case "task_completed": return { title: "Follow-up done", kind: "task" };
    case "task_reopened": return { title: "Follow-up reopened", kind: "task" };
    case "email_sent": return { title: "Email sent", kind: "email" };
    case "email_failed": return { title: "Email failed to send", kind: "email" };
    case "updated": return { title: "Contact details updated", kind: "plain" };
  }
}
function Timeline({ entries, staff, onOpenEnquiry }: { entries: ContactTimelineEntry[]; staff: Directory; onOpenEnquiry: (id: string) => void }) {
  return <ol className="crm-timeline">{entries.map(entry => {
    const { title, kind } = describe(entry);
    const actor = entry.actorId ? staff.get(entry.actorId)?.email ?? `staff ${entry.actorId}` : null;
    return <li key={entry.id}><div className="crm-timeline-entry" data-timeline-entry={entry.id} data-kind={kind}>
      <span className="crm-timeline-title">{title}{entry.subject && <>: {entry.subject}</>}</span>
      {entry.body && <p className="crm-timeline-body">{entry.body}</p>}
      <span className="crm-timeline-meta">
        <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
        {actor && <> by {actor}</>}
        {entry.enquiryId && <> on <button type="button" className="crm-button-quiet crm-button-small" style={{ minHeight: 0, padding: "0 4px" }} onClick={() => onOpenEnquiry(entry.enquiryId!)}>enquiry {entry.enquiryId.slice(4, 12)}</button></>}
      </span>
    </div></li>;
  })}</ol>;
}

export function ContactPage({ session, contactId, onDenied, onOpenEnquiry, onBack, backLabel = "Back", today = localToday() }: {
  session: StaffSession; contactId: string; onDenied: (status: number) => void; onOpenEnquiry: (id: string) => void; onBack: () => void; backLabel?: string; today?: string;
}) {
  const request = useAdminRequest();
  const staff = useDirectory(onDenied);
  const [contact, setContact] = useState<Contact | null>(null);
  const [enquiries, setEnquiries] = useState<EnquiryAdminSummary[]>([]);
  const [timeline, setTimeline] = useState<ContactTimelineEntry[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timelineError, setTimelineError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", city: "", tags: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const sequence = useRef(0);
  const timelineSequence = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ onDenied });
  callbacks.current = { onDenied };
  const path = `/api/admin/crm/contacts/${encodeURIComponent(contactId)}`;
  const loadTimeline = useCallback(async (cursor?: string | null) => {
    const current = ++timelineSequence.current;
    setTimelineError("");
    const result = await readJson(request, `${path}/timeline?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, contactTimelineSchema, "Activity");
    if (!active.current || current !== timelineSequence.current) return;
    if (!result.ok) { if (result.denied) callbacks.current.onDenied(result.denied); else setTimelineError(result.message); return; }
    setTimeline(rows => cursor ? [...rows, ...result.value.items.filter(item => !rows.some(row => row.id === item.id))] : result.value.items);
    setTimelineCursor(result.value.nextCursor);
  }, [request, path]);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(""); setStale(false); setFormError("");
    const result = await readJson(request, path, detailSchema, "Contact");
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    if (!result.ok) { setContact(null); setEnquiries([]); if (result.denied) callbacks.current.onDenied(result.denied); else setError(result.message); return; }
    setContact(result.value.contact); setEnquiries(result.value.enquiries);
    void loadTimeline();
  }, [request, path, loadTimeline]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; timelineSequence.current++; }; }, [load]);
  useEffect(() => { if (contact) heading.current?.focus(); }, [contact?.id]);
  function startEdit() {
    if (!contact) return;
    setDraft({ name: contact.name, phone: contact.phone, city: contact.city, tags: contact.tags.join(", "), notes: contact.notes });
    setEditing(true); setFormError(""); setNotice("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!contact || busy || stale) return;
    setBusy(true); setFormError(""); setNotice("");
    const tags = [...new Set(draft.tags.split(",").map(tag => tag.trim()).filter(Boolean))].slice(0, 20);
    try {
      const response = await request(path, writeOptions(session.csrfToken, { expectedVersion: contact.version, name: draft.name.trim(), phone: draft.phone.trim(), city: draft.city.trim(), tags, notes: draft.notes.trim() }));
      if (!active.current) return;
      if (response.status === 401 || response.status === 403) { setContact(null); setEditing(false); callbacks.current.onDenied(response.status); return; }
      if (response.status === 409) {
        const body = await response.json().catch(() => ({})) as { code?: string };
        if (body.code === "CONTACT_PHONE_IN_USE") { setFormError("Another contact already uses this phone number."); return; }
        setStale(true); setFormError("This contact changed. Reload the contact before saving again. Your edits are kept."); return;
      }
      if (response.status === 400) { setFormError("Check the values: names and cities up to 100 characters, tags up to 40, notes up to 5000."); return; }
      if (!response.ok) throw Error("save");
      const value = contactSchema.parse(await response.json());
      if (!active.current || value.id !== contactId) return;
      setContact(value); setEditing(false); setNotice("Contact saved.");
      void loadTimeline();
    } catch (failure) {
      if (active.current) { setStale(true); setFormError(failure instanceof AdminRequestTimeout ? "Saving timed out. Reload the contact to see whether it was saved. Your edits are kept." : "We couldn't save the contact. Reload the contact and try again. Your edits are kept."); }
    } finally { if (active.current) setBusy(false); }
  }
  const field = (key: keyof typeof draft, label: string, extra: Record<string, unknown> = {}) =>
    <label className="crm-field"><span>{label}</span><input aria-label={label} value={draft[key]} disabled={busy} onInput={event => { const value = event.currentTarget.value; setDraft(current => ({ ...current, [key]: value })); }} {...extra} /></label>;
  return <section className="crm crm-contact" aria-label="Contact" aria-busy={loading || busy}>
    <div className="crm-contact-head">
      <div>
        <button type="button" className="crm-button-quiet" onClick={onBack}>{backLabel}</button>
        <h3 ref={heading} tabIndex={-1} style={{ marginTop: 8, fontFamily: "Newsreader, Georgia, serif", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>{contact?.name || (loading ? "Loading contact" : "Contact")}</h3>
      </div>
      {contact && !editing && <div className="crm-row-actions"><button type="button" disabled={busy} onClick={startEdit}>Edit contact</button><button type="button" className="crm-button-quiet" disabled={busy} onClick={() => void load()}>Reload contact</button></div>}
    </div>
    {loading && !contact && <Skeleton rows={2} variant="tile" />}
    {error && <Notice tone="error">{error}</Notice>}
    {error && <button type="button" className="crm-button-small" onClick={() => void load()}>Try again</button>}
    {contact && !editing && <div className="crm-contact-card">
      <dl><dt>Email</dt><dd>{contact.email}</dd></dl>
      <dl><dt>Phone</dt><dd>{contact.phone || "Not provided"}</dd></dl>
      <dl><dt>City</dt><dd>{contact.city || "Not provided"}</dd></dl>
      <dl><dt>Customer since</dt><dd>{formatDate(contact.createdAt)}</dd></dl>
      <dl><dt>Tags</dt><dd>{contact.tags.length ? <span className="crm-tags">{contact.tags.map(tag => <span key={tag} className="crm-tag" data-tag>{tag}</span>)}</span> : "None"}</dd></dl>
      <dl className="crm-contact-notes"><dt>Internal notes</dt><dd>{contact.notes || "No notes yet."}</dd></dl>
    </div>}
    {contact && editing && <form className="crm-contact-form crm-contact-card" onSubmit={save}>
      {field("name", "Contact name", { maxLength: 100 })}
      {field("phone", "Phone", { maxLength: 30 })}
      {field("city", "City", { maxLength: 100 })}
      {field("tags", "Tags", { placeholder: "Comma separated, for example trade, repeat" })}
      <label className="crm-field crm-field-wide"><span>Internal notes</span><textarea aria-label="Internal notes" value={draft.notes} maxLength={5000} disabled={busy} onInput={event => { const value = event.currentTarget.value; setDraft(current => ({ ...current, notes: value })); }} /></label>
      <p className="crm-faint crm-field-wide" style={{ margin: 0 }}>Email is the contact key and cannot be edited here: {contact.email}</p>
      <div className="crm-contact-form-actions">
        <button type="submit" className="admin-primary" disabled={busy || stale || !draft.name.trim()}>Save contact</button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setStale(false); setFormError(""); }}>Cancel</button>
        {stale && <button type="button" disabled={busy} onClick={() => void load()}>Reload contact</button>}
      </div>
    </form>}
    {formError && <Notice tone="error">{formError}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {contact && <div className="crm-contact-grid">
      <div>
        <section className="crm-section" aria-label="Enquiries from this contact" style={{ marginTop: 0 }}>
          <h4>Enquiries</h4>
          {enquiries.length === 0 && <EmptyState title="No enquiries linked yet.">Enquiries from this email or phone number will attach to this contact automatically.</EmptyState>}
          {enquiries.length > 0 && <ul className="crm-rows">{enquiries.map(row => <li key={row.id}><div className="crm-row" data-enquiry-row={row.id}>
            <div className="crm-row-primary"><strong>{row.product || "No product noted"}</strong><span className="crm-faint">{kindLabels[row.kind] ?? row.kind} enquiry, {ageLabel(row.createdAt, today) === "Today" ? "today" : `${ageLabel(row.createdAt, today)} ago`}</span></div>
            <div className="crm-row-meta"><StageChip stage={row.status} /></div>
            <div className="crm-row-actions"><button type="button" className="crm-button-quiet crm-button-small" onClick={() => onOpenEnquiry(row.id)}>Open enquiry</button></div>
          </div></li>)}</ul>}
        </section>
        <TaskPanel session={session} onDenied={onDenied} parent={{ contactId }} today={today} onChanged={() => void loadTimeline()} />
      </div>
      <section className="crm-section" aria-label="Contact timeline" style={{ marginTop: 0 }}>
        <h4>Timeline</h4>
        {timelineError && <Notice tone="error">{timelineError}</Notice>}
        {timelineError && <button type="button" className="crm-button-small" onClick={() => void loadTimeline()}>Reload timeline</button>}
        {!timelineError && timeline.length === 0 && <EmptyState title="Nothing recorded yet.">Stage changes, notes, follow-ups and emails across every enquiry from this contact appear here.</EmptyState>}
        {timeline.length > 0 && <Timeline entries={timeline} staff={staff} onOpenEnquiry={onOpenEnquiry} />}
        {timelineCursor && <button type="button" className="crm-button-small" onClick={() => void loadTimeline(timelineCursor)}>Older activity</button>}
      </section>
    </div>}
  </section>;
}

export function ContactsDirectory({ session, onDenied, onOpenContact }: { session: StaffSession; onDenied: (status: number) => void; onOpenContact: (id: string) => void }) {
  const request = useAdminRequest();
  const [items, setItems] = useState<Contact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(true);
  const sequence = useRef(0);
  const callbacks = useRef({ onDenied });
  callbacks.current = { onDenied };
  const load = useCallback(async (next?: string | null) => {
    const current = ++sequence.current;
    setLoading(true); setError("");
    if (!next) { setItems([]); setCursor(null); }
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (next) params.set("cursor", next);
    const result = await readJson(request, `/api/admin/crm/contacts${params.size ? `?${params}` : ""}`, contactListSchema, "Contacts");
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    if (!result.ok) { if (result.denied) { setItems([]); callbacks.current.onDenied(result.denied); } else setError(result.message); return; }
    setItems(rows => next ? [...rows, ...result.value.items.filter(item => !rows.some(row => row.id === item.id))] : result.value.items);
    setCursor(result.value.nextCursor);
  }, [request, query]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; }; }, [load, session.user.id]);
  return <section className="crm" aria-label="Contacts" aria-busy={loading}>
    <form className="crm-search" onSubmit={event => { event.preventDefault(); setQuery(term.trim()); }}>
      <label className="crm-field"><span>Search contacts</span><input aria-label="Search contacts" value={term} maxLength={100} placeholder="Name, email, phone or city" onInput={event => setTerm(event.currentTarget.value)} /></label>
      <button type="submit" disabled={loading}>Search</button>
      {query && <button type="button" className="crm-button-quiet" onClick={() => { setTerm(""); setQuery(""); }}>Clear</button>}
    </form>
    {loading && items.length === 0 && <Skeleton rows={4} />}
    {error && <Notice tone="error">{error}</Notice>}
    {error && <button type="button" className="crm-button-small" onClick={() => void load()}>Try again</button>}
    {!loading && !error && items.length === 0 && <EmptyState title={query ? "No contacts match that search." : "No contacts yet."}>{query ? "Try part of a name, email address, phone number or city." : "Contacts are created automatically from enquiries."}</EmptyState>}
    {items.length > 0 && <ul className="crm-rows">{items.map(contact => <li key={contact.id}><div className="crm-row" data-contact-row={contact.id}>
      <div className="crm-row-primary"><strong>{contact.name || contact.email}</strong><span className="crm-faint">{contact.email}</span></div>
      <div className="crm-row-secondary"><span>{contact.phone || "No phone"}</span><span>{contact.city || "No city"}</span></div>
      <div className="crm-row-meta crm-tags">{contact.tags.map(tag => <span key={tag} className="crm-tag">{tag}</span>)}</div>
      <div className="crm-row-actions"><button type="button" className="crm-button-quiet crm-button-small" aria-label={`Open contact ${contact.name || contact.email}`} onClick={() => onOpenContact(contact.id)}>Open contact</button></div>
    </div></li>)}</ul>}
    {cursor && <button type="button" className="crm-pager" disabled={loading} onClick={() => void load(cursor)}>More contacts</button>}
  </section>;
}
