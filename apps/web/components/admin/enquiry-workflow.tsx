"use client";
import { useEffect, useRef, useState } from "react";
import { enquiryAdminDetailSchema, enquiryAssigneeListSchema, enquiryActivityListSchema, type EnquiryAdminDetail, type EnquiryAssignee, type EnquiryActivity } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

export function EnquiryWorkflow({ detail, session, onChange, onDenied, onBusy }: {
  detail: EnquiryAdminDetail; session: StaffSession; onChange: (value: EnquiryAdminDetail) => void;
  onDenied: (status: number) => void; onBusy: (busy: boolean) => void;
}) {
  const request = useAdminRequest();
  const [assignees, setAssignees] = useState<EnquiryAssignee[]>([]);
  const [assigneeCursor, setAssigneeCursor] = useState<string | null>(null);
  const [activity, setActivity] = useState<EnquiryActivity[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState(detail.assignedToId ?? "");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [error, setError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const writing = useRef(false);
  const activitySequence = useRef(0);
  const path = `/api/admin/enquiries/${encodeURIComponent(detail.id)}`;
  const callbacks = useRef({ onChange, onDenied, onBusy });
  callbacks.current = { onChange, onDenied, onBusy };
  function denied(response: Response) {
    if (response.status !== 401 && response.status !== 403) return false;
    active.current = false;
    setDraft(""); setActivity([]); setAssignees([]);
    callbacks.current.onDenied(response.status);
    return true;
  }
  async function directory(cursor?: string | null) {
    setDirectoryBusy(true); setDirectoryError("");
    try {
      const response = await request(`/api/admin/enquiries/assignees${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!active.current || denied(response)) return;
      if (!response.ok) throw Error("directory");
      const value = enquiryAssigneeListSchema.parse(await response.json());
      if (!active.current) return;
      setAssignees(rows => cursor ? [...rows, ...value.items.filter(item => !rows.some(row => row.id === item.id))] : value.items);
      setAssigneeCursor(value.nextCursor);
    } catch (failure) { if (active.current) setDirectoryError(failure instanceof AdminRequestTimeout ? "Loading assignees timed out. Retry the directory." : "We couldn't load assignees. Retry the directory."); }
    finally { if (active.current) setDirectoryBusy(false); }
  }
  async function history(cursor?: string | null) {
    const sequence = ++activitySequence.current;
    setActivityBusy(true); setActivityError("");
    try {
      const response = await request(`${path}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!active.current || sequence !== activitySequence.current || denied(response)) return;
      if (!response.ok) throw Error("history");
      const value = enquiryActivityListSchema.parse(await response.json());
      if (!active.current || sequence !== activitySequence.current) return;
      setActivity(rows => cursor ? [...rows, ...value.items.filter(item => !rows.some(row => row.id === item.id))] : value.items);
      setActivityCursor(value.nextCursor);
    } catch (failure) { if (active.current && sequence === activitySequence.current) setActivityError(failure instanceof AdminRequestTimeout ? "Loading activity timed out. Retry activity." : "We couldn't load activity. Retry activity."); }
    finally { if (active.current && sequence === activitySequence.current) setActivityBusy(false); }
  }
  useEffect(() => {
    active.current = true; void directory(); void history();
    return () => { active.current = false; activitySequence.current++; };
  }, [request, path]);
  async function save(action: "assignment" | "notes" | "review" | "reload") {
    if (writing.current || (stale && action !== "reload")) return;
    if (action === "notes" && (!draft.trim() || draft.length > 2000)) return;
    writing.current = true; setBusy(true); callbacks.current.onBusy(true); setError(""); setNotice("");
    try {
      const response = await request(action === "reload" ? path : `${path}/${action}`, {
        cache: "no-store", credentials: "same-origin",
        ...(action === "reload" ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(action === "review" ? { expectedVersion: detail.version } : action === "assignment" ? { expectedVersion: detail.version, assigneeId: selected || null } : { expectedVersion: detail.version, body: draft.trim() }) }),
      });
      if (!active.current || denied(response)) return;
      if (response.status === 409) { setStale(true); setError("This enquiry changed. Reload the enquiry before saving again. Your unsaved note is retained."); return; }
      if (response.status === 400 && action === "assignment") { setError("That assignee is unavailable. Reload the assignee directory and choose an eligible account."); void directory(); return; }
      if (!response.ok) throw Error("save");
      const value = enquiryAdminDetailSchema.parse(await response.json());
      if (!active.current) return;
      if (value.id !== detail.id) throw Error("Wrong enquiry");
      callbacks.current.onChange(value); setSelected(value.assignedToId ?? ""); setStale(false);
      if (action === "notes") setDraft("");
      setNotice(action === "reload" ? "Enquiry reloaded. Your unsaved note is retained." : action === "notes" ? "Internal note added." : action === "review" ? "Enquiry marked reviewed." : "Assignment saved.");
      void history();
    } catch (failure) {
      if (active.current) { setStale(true); setError(failure instanceof AdminRequestTimeout ? "The request timed out. Your unsaved note is retained. Reload the enquiry and check activity before trying again." : "We couldn't complete the request. Your unsaved note is retained. Reload the enquiry and check activity before trying again."); }
    } finally { writing.current = false; if (active.current) { setBusy(false); callbacks.current.onBusy(false); } }
  }
  const current = detail.assignedToId ? assignees.find(item => item.id === detail.assignedToId)?.email ?? `Staff ${detail.assignedToId} (not in the loaded eligible directory)` : "Unassigned";
  const unavailable = !!selected && !assignees.some(item => item.id === selected);
  return <section aria-label="Internal enquiry workflow" aria-busy={busy}>
    {detail.status === "new" && <button type="button" disabled={busy || stale} onClick={() => void save("review")}>Mark reviewed</button>}
    <h4>Assignment</h4>
    <p style={{ overflowWrap: "anywhere" }}>Current assignee: {current}</p>
    <label>Assign to<select aria-label="Assign to" value={selected} disabled={busy || stale || directoryBusy} onChange={event => setSelected(event.target.value)}>
      <option value="">Unassigned</option>
      {unavailable && <option value={selected} disabled>Staff {selected} — not in loaded directory</option>}
      {assignees.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}
    </select></label>
    <button type="button" disabled={busy || stale || directoryBusy || unavailable || selected === (detail.assignedToId ?? "")} onClick={() => void save("assignment")}>Save assignment</button>
    {directoryBusy && <p role="status">Loading assignees…</p>}
    {directoryError && <p role="alert">{directoryError}</p>}
    <button type="button" disabled={busy || directoryBusy} onClick={() => void directory()}>Reload assignees</button>
    {assigneeCursor && <button type="button" disabled={busy || directoryBusy} onClick={() => void directory(assigneeCursor)}>More assignees</button>}
    <h4>Internal notes</h4><p id="enquiry-note-help">Visible to authorised staff only. Adding a note does not send a customer reply.</p>
    <label>Internal note<textarea aria-label="Internal note" aria-describedby="enquiry-note-help enquiry-note-count" value={draft} rows={4} maxLength={2000} disabled={busy} onInput={event => setDraft(event.currentTarget.value)} /></label>
    <p id="enquiry-note-count">{draft.length}/2000 characters</p>
    <button type="button" disabled={busy || stale || !draft.trim() || draft.length > 2000} onClick={() => void save("notes")}>Add internal note</button>
    <button type="button" disabled={busy} onClick={() => void save("reload")}>Reload enquiry</button>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Saving or reloading enquiry…</p>}
    <h4>Internal activity</h4>
    {activityBusy && <p role="status">Loading activity…</p>}
    {activityError && <p role="alert">{activityError}</p>}
    {!activityBusy && !activityError && activity.length === 0 && <p>No internal activity yet.</p>}
    <ol>{activity.map(item => <li key={item.id} style={{ overflowWrap: "anywhere" }}><p>{item.action === "note" ? "Internal note" : item.action === "assigned" ? `Assigned to staff ${item.assigneeId}` : "Unassigned"} · staff {item.actorId} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p>{item.body !== null && <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>}</li>)}</ol>
    <button type="button" disabled={busy || activityBusy} onClick={() => void history()}>Reload activity</button>
    {activityCursor && <button type="button" disabled={busy || activityBusy} onClick={() => void history(activityCursor)}>Older activity</button>}
  </section>;
}
