"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { contactListSchema, contactSchema, contactTimelineSchema, enquiryAdminSummarySchema, enquiryStageLabels, type Contact, type ContactTimelineEntry, type EnquiryAdminSummary } from "@shopmaple/contracts";
import { ArrowLeft, Pencil, RotateCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Timeline, type TimelineItem } from "./enquiry-workflow";
import { Field } from "./field";
import { FieldGrid, rowCard } from "./kit";
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
    case "email_sending": return { title: "Email send unconfirmed", kind: "email" };
    case "email_sent": return { title: "Email sent", kind: "email" };
    case "email_failed": return { title: "Email failed to send", kind: "email" };
    case "updated": return { title: "Contact details updated", kind: "plain" };
  }
}
function ContactTimeline({ entries, staff, onOpenEnquiry }: { entries: ContactTimelineEntry[]; staff: Directory; onOpenEnquiry: (id: string) => void }) {
  const items: TimelineItem[] = entries.map(entry => {
    const { title, kind } = describe(entry);
    const actor = entry.actorId ? staff.get(entry.actorId)?.email ?? `staff ${entry.actorId}` : null;
    return {
      id: entry.id, kind, body: entry.body,
      title: <>{title}{entry.subject && <>: {entry.subject}</>}</>,
      meta: <>
        <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
        {actor && <> by {actor}</>}
        {entry.enquiryId && <> on <Button type="button" variant="link" size="xs" className="h-auto px-0.5 text-[12px]" onClick={() => onOpenEnquiry(entry.enquiryId!)}>enquiry {entry.enquiryId.slice(4, 12)}</Button></>}
      </>,
    };
  });
  return <Timeline items={items} label="Contact activity" />;
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
  const field = (key: keyof typeof draft, label: string, maxLength: number) =>
    <Field label={label} value={draft[key]} maxLength={maxLength} onChange={value => setDraft(current => ({ ...current, [key]: value }))} />;
  const subheading = "text-[13.5px] font-semibold text-foreground";
  return <section className="grid gap-5" aria-label="Contact" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-2">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}><ArrowLeft aria-hidden="true" strokeWidth={1.5} />{backLabel}</Button>
        <h3 ref={heading} tabIndex={-1} className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-foreground outline-none [overflow-wrap:anywhere]">{contact?.name || (loading ? "Loading contact" : "Contact")}</h3>
      </div>
      {contact && !editing && <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={startEdit}><Pencil aria-hidden="true" strokeWidth={1.5} />Edit contact</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} aria-busy={loading} onClick={() => void load()}><RotateCw aria-hidden="true" strokeWidth={1.5} />Reload contact</Button>
      </div>}
    </div>
    {loading && !contact && <Skeleton rows={2} variant="tile" />}
    {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice><Button type="button" size="sm" variant="outline" onClick={() => void load()}>Try again</Button></div>}
    {contact && !editing && <Card className="gap-0 px-5 py-4 shadow-xs">
      <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4 [&_dd]:text-foreground [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-[12px] [&_dt]:text-muted-foreground [&>div]:grid [&>div]:gap-0.5">
        <div><dt>Email</dt><dd>{contact.email}</dd></div>
        <div><dt>Phone</dt><dd>{contact.phone || "Not provided"}</dd></div>
        <div><dt>City</dt><dd>{contact.city || "Not provided"}</dd></div>
        <div><dt>Customer since</dt><dd className="tabular-nums">{formatDate(contact.createdAt)}</dd></div>
        <div className="sm:col-span-2 lg:col-span-4"><dt>Tags</dt><dd>{contact.tags.length ? <span className="mt-1 flex flex-wrap gap-1.5">{contact.tags.map(tag => <Badge key={tag} variant="secondary" className="rounded-md" data-tag>{tag}</Badge>)}</span> : "None"}</dd></div>
        <div className="sm:col-span-2 lg:col-span-4"><dt>Internal notes</dt><dd className="leading-relaxed whitespace-pre-wrap">{contact.notes || "No notes yet."}</dd></div>
      </dl>
    </Card>}
    {contact && editing && <form className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-xs" onSubmit={save} aria-label="Edit contact">
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0"><FieldGrid>
        {field("name", "Contact name", 100)}
        {field("phone", "Phone", 30)}
        {field("city", "City", 100)}
        <div className="grid gap-1.5">{field("tags", "Tags", 1000)}<p className="text-[12px] text-muted-foreground">Comma separated, for example trade, repeat.</p></div>
        <Field label="Internal notes" value={draft.notes} maxLength={5000} multiline onChange={value => setDraft(current => ({ ...current, notes: value }))} />
        <p data-span="full" className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">Email is the contact key and cannot be edited here: {contact.email}</p>
      </FieldGrid></fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || stale || !draft.name.trim()} aria-busy={busy}>{busy ? "Saving contact…" : "Save contact"}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setStale(false); setFormError(""); }}>Cancel</Button>
        {stale && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Reload contact</Button>}
      </div>
    </form>}
    {formError && <Notice tone="error">{formError}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {contact && <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-8">
        <section className="grid gap-3" aria-label="Enquiries from this contact">
          <h4 className={subheading}>Enquiries</h4>
          {enquiries.length === 0 && <EmptyState title="No enquiries linked yet.">Enquiries from this email or phone number will attach to this contact automatically.</EmptyState>}
          {enquiries.length > 0 && <ul className="grid gap-2">{enquiries.map(row => <li key={row.id}><div className={rowCard} data-enquiry-row={row.id}>
            <div className="grid min-w-0 flex-1 gap-0.5"><span className="text-[13.5px] font-semibold text-foreground [overflow-wrap:anywhere]">{row.product || "No product noted"}</span><span className="text-[12px] text-muted-foreground">{kindLabels[row.kind] ?? row.kind} enquiry, {ageLabel(row.createdAt, today) === "Today" ? "today" : `${ageLabel(row.createdAt, today)} ago`}</span></div>
            <StageChip stage={row.status} />
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenEnquiry(row.id)}>Open enquiry</Button>
          </div></li>)}</ul>}
        </section>
        <TaskPanel session={session} onDenied={onDenied} parent={{ contactId }} today={today} onChanged={() => void loadTimeline()} />
      </div>
      <section className="grid content-start gap-3" aria-label="Contact timeline">
        <h4 className={subheading}>Timeline</h4>
        {timelineError && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{timelineError}</Notice><Button type="button" size="sm" variant="outline" onClick={() => void loadTimeline()}>Reload timeline</Button></div>}
        {!timelineError && timeline.length === 0 && <EmptyState title="Nothing recorded yet.">Stage changes, notes, follow-ups and emails across every enquiry from this contact appear here.</EmptyState>}
        {timeline.length > 0 && <ContactTimeline entries={timeline} staff={staff} onOpenEnquiry={onOpenEnquiry} />}
        {timelineCursor && <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void loadTimeline(timelineCursor)}>Older activity</Button>}
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
    // A search term may be an email or phone number: it is posted, never placed in a URL.
    const result = query
      ? await readJson(request, "/api/admin/crm/contacts/search", contactListSchema, "Contacts", { q: query, ...(next ? { cursor: next } : {}) }, session.csrfToken)
      : await readJson(request, `/api/admin/crm/contacts${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, contactListSchema, "Contacts");
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    if (!result.ok) { if (result.denied) { setItems([]); callbacks.current.onDenied(result.denied); } else setError(result.message); return; }
    setItems(rows => next ? [...rows, ...result.value.items.filter(item => !rows.some(row => row.id === item.id))] : result.value.items);
    setCursor(result.value.nextCursor);
  }, [request, query, session.csrfToken]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; }; }, [load, session.user.id]);
  return <section className="grid gap-4" aria-label="Contacts" aria-busy={loading}>
    <form className="flex flex-wrap items-end gap-2 rounded-xl border border-line-soft bg-surface p-4" onSubmit={event => { event.preventDefault(); setQuery(term.trim()); }}>
      <label className="grid min-w-64 flex-1 gap-1.5 text-[12px] font-medium text-muted-foreground">Search contacts<Input aria-label="Search contacts" className="h-8 bg-card text-[13px]" value={term} maxLength={100} placeholder="Name, email, phone or city" onInput={event => setTerm(event.currentTarget.value)} onChange={() => {}} /></label>
      <Button type="submit" size="sm" disabled={loading}><Search aria-hidden="true" strokeWidth={1.5} />Search</Button>
      {query && <Button type="button" size="sm" variant="ghost" onClick={() => { setTerm(""); setQuery(""); }}>Clear</Button>}
    </form>
    {loading && items.length === 0 && <Skeleton rows={4} />}
    {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice><Button type="button" size="sm" variant="outline" onClick={() => void load()}>Try again</Button></div>}
    {!loading && !error && items.length === 0 && <EmptyState title={query ? "No contacts match that search." : "No contacts yet."}>{query ? "Try part of a name, email address, phone number or city." : "Contacts are created automatically from enquiries."}</EmptyState>}
    {items.length > 0 && <ul className="grid gap-2">{items.map(contact => <li key={contact.id}><div className={cn(rowCard, "flex-wrap")} data-contact-row={contact.id}>
      <div className="grid min-w-44 flex-1 gap-0.5"><span className="text-[13.5px] font-semibold text-foreground [overflow-wrap:anywhere]">{contact.name || contact.email}</span><span className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{contact.email}</span></div>
      <div className="grid min-w-32 gap-0.5 text-[12.5px] text-muted-foreground"><span>{contact.phone || "No phone"}</span><span>{contact.city || "No city"}</span></div>
      {contact.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{contact.tags.map(tag => <Badge key={tag} variant="secondary" className="rounded-md">{tag}</Badge>)}</div>}
      <Button type="button" size="sm" variant="outline" className="ml-auto" aria-label={`Open contact ${contact.name || contact.email}`} onClick={() => onOpenContact(contact.id)}>Open contact</Button>
    </div></li>)}</ul>}
    {cursor && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={loading} onClick={() => void load(cursor)}>More contacts</Button>}
  </section>;
}
