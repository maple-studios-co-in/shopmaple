"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { followUpTaskListSchema, followUpTaskSchema, type FollowUpTask } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { DueBadge, EmptyState, Notice, Skeleton, dueState, formatDate, localToday, readJson, useDirectory, writeOptions } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

type Parent = { enquiryId: string } | { contactId: string };
type Directory = ReturnType<typeof useDirectory>;
const conflictMessage = "This follow-up changed. Reload follow-ups before trying again.";

function TaskRow({ task, today, staff, busy, onToggle, onOpenEnquiry, onOpenContact }: {
  task: FollowUpTask; today: string; staff: Directory; busy: boolean; onToggle: (task: FollowUpTask) => void;
  onOpenEnquiry?: (id: string) => void; onOpenContact?: (id: string) => void;
}) {
  const state = dueState(task.dueOn, today);
  const assignee = task.assigneeId ? staff.get(task.assigneeId)?.email ?? `Staff ${task.assigneeId}` : "Unassigned";
  return <li><article className="crm-task" data-task={task.id} data-due={state} data-done={task.done ? "true" : "false"}>
    <button type="button" className="crm-task-check" disabled={busy} aria-pressed={task.done} aria-label={task.done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onClick={() => onToggle(task)}><Check size={16} strokeWidth={2.5} aria-hidden="true" /></button>
    <div>
      <div className="crm-task-title">{task.title}</div>
      {task.note && <p className="crm-task-note">{task.note}</p>}
      <div className="crm-task-meta">
        {task.done && task.completedAt ? <span>Done {formatDate(task.completedAt)}</span> : <DueBadge state={state}>{state === "upcoming" ? `Due ${formatDate(task.dueOn)}` : `${state === "overdue" ? "Overdue" : "Due today"}, ${formatDate(task.dueOn)}`}</DueBadge>}
        <span style={{ overflowWrap: "anywhere" }}>{assignee}</span>
      </div>
    </div>
    <div className="crm-row-actions">
      {onOpenEnquiry && task.enquiryId && <button type="button" className="crm-button-quiet crm-button-small" aria-label={`Open enquiry for ${task.title}`} onClick={() => onOpenEnquiry(task.enquiryId!)}>Enquiry</button>}
      {onOpenContact && task.contactId && <button type="button" className="crm-button-quiet crm-button-small" aria-label={`Open contact for ${task.title}`} onClick={() => onOpenContact(task.contactId!)}>Contact</button>}
    </div>
  </article></li>;
}

/** Shared completion request; returns the updated task or a user-facing message. */
async function toggleTask(request: ReturnType<typeof useAdminRequest>, csrfToken: string, task: FollowUpTask): Promise<{ task: FollowUpTask } | { denied: number } | { message: string }> {
  try {
    const response = await request(`/api/admin/crm/tasks/${encodeURIComponent(task.id)}/complete`, writeOptions(csrfToken, { expectedVersion: task.version, done: !task.done }));
    if (response.status === 401 || response.status === 403) return { denied: response.status };
    if (response.status === 409) return { message: conflictMessage };
    if (!response.ok) throw Error("toggle");
    const value = followUpTaskSchema.parse(await response.json());
    if (value.id !== task.id) throw Error("Wrong follow-up");
    return { task: value };
  } catch (failure) {
    return { message: failure instanceof AdminRequestTimeout ? "The request timed out. Reload follow-ups to see whether it was saved." : "We couldn't update the follow-up. Reload follow-ups and try again." };
  }
}

export function TaskPanel({ session, onDenied, parent, today = localToday(), onChanged }: {
  session: StaffSession; onDenied: (status: number) => void; parent: Parent; today?: string; onChanged?: () => void;
}) {
  const request = useAdminRequest();
  const staff = useDirectory(onDenied);
  const [open, setOpen] = useState<FollowUpTask[]>([]);
  const [done, setDone] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState(today);
  const [assigneeId, setAssigneeId] = useState("");
  const [note, setNote] = useState("");
  const active = useRef(true);
  const sequence = useRef(0);
  const callbacks = useRef({ onDenied, onChanged });
  callbacks.current = { onDenied, onChanged };
  const scope = "enquiryId" in parent ? `enquiryId=${encodeURIComponent(parent.enquiryId)}` : `contactId=${encodeURIComponent(parent.contactId)}`;
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError("");
    const [openResult, doneResult] = await Promise.all([
      readJson(request, `/api/admin/crm/tasks?view=open&today=${today}&${scope}&limit=50`, followUpTaskListSchema, "Follow-ups"),
      readJson(request, `/api/admin/crm/tasks?view=done&today=${today}&${scope}&limit=20`, followUpTaskListSchema, "Follow-ups"),
    ]);
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    for (const result of [openResult, doneResult]) {
      if (result.ok) continue;
      if (result.denied) { setOpen([]); setDone([]); callbacks.current.onDenied(result.denied); return; }
      setError(result.message); return;
    }
    if (openResult.ok && doneResult.ok) { setOpen(openResult.value.items); setDone(doneResult.value.items); }
  }, [request, today, scope]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; }; }, [load]);
  const canAdd = !busy && title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dueOn);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!canAdd) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await request("/api/admin/crm/tasks", writeOptions(session.csrfToken, { ...parent, title: title.trim(), dueOn, assigneeId: assigneeId || null, note: note.trim() }));
      if (!active.current) return;
      if (response.status === 401 || response.status === 403) { setTitle(""); setNote(""); callbacks.current.onDenied(response.status); return; }
      if (response.status === 400) { setError("Choose an active staff member with enquiry access, or leave the follow-up unassigned."); return; }
      if (!response.ok) throw Error("create");
      const value = followUpTaskSchema.parse(await response.json());
      setOpen(rows => [...rows, value].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id)));
      setTitle(""); setNote(""); setAssigneeId(""); setDueOn(today);
      setNotice("Follow-up added."); callbacks.current.onChanged?.();
    } catch (failure) {
      if (active.current) setError(failure instanceof AdminRequestTimeout ? "Adding the follow-up timed out. Reload follow-ups to see whether it was saved." : "We couldn't add the follow-up. Try again.");
    } finally { if (active.current) setBusy(false); }
  }
  async function toggle(task: FollowUpTask) {
    setBusy(true); setError(""); setNotice("");
    const result = await toggleTask(request, session.csrfToken, task);
    if (!active.current) return;
    setBusy(false);
    if ("denied" in result) { setOpen([]); setDone([]); callbacks.current.onDenied(result.denied); return; }
    if ("message" in result) { setError(result.message); return; }
    if (result.task.done) { setOpen(rows => rows.filter(row => row.id !== task.id)); setDone(rows => [result.task, ...rows]); setNotice("Follow-up marked done."); }
    else { setDone(rows => rows.filter(row => row.id !== task.id)); setOpen(rows => [...rows, result.task].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id))); setNotice("Follow-up reopened."); }
    callbacks.current.onChanged?.();
  }
  return <section className="crm crm-section" aria-label="Follow-ups" aria-busy={busy || loading}>
    <h4>Follow-ups</h4>
    {loading && open.length === 0 && done.length === 0 && <Skeleton rows={2} />}
    {!loading && !error && open.length === 0 && done.length === 0 && <EmptyState title="No follow-ups yet.">Add the next step with a due date so it shows up in Overdue and Due today.</EmptyState>}
    {open.length > 0 && <ul className="crm-task-list">{open.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} />)}</ul>}
    {done.length > 0 && <>
      <p className="crm-eyebrow" style={{ marginTop: 16 }}>Done</p>
      <ul className="crm-task-list">{done.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} />)}</ul>
    </>}
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {error && <button type="button" className="crm-button-small" disabled={busy} onClick={() => void load()}>Reload follow-ups</button>}
    <form className="crm-task-form" onSubmit={add}>
      <label className="crm-field"><span>Title</span><input aria-label="Follow-up title" value={title} maxLength={200} disabled={busy} onInput={event => setTitle(event.currentTarget.value)} /></label>
      <label className="crm-field"><span>Due</span><input aria-label="Due date" type="date" value={dueOn} disabled={busy} onChange={event => setDueOn(event.currentTarget.value)} /></label>
      <label className="crm-field"><span>Assignee</span><select aria-label="Assign follow-up to" value={assigneeId} disabled={busy} onChange={event => setAssigneeId(event.currentTarget.value)}>
        <option value="">Unassigned</option>
        {[...staff.values()].map(item => <option key={item.id} value={item.id}>{item.email}</option>)}
      </select></label>
      <label className="crm-field crm-task-form-note"><span>Note (optional)</span><textarea aria-label="Follow-up note" value={note} maxLength={2000} rows={2} disabled={busy} onInput={event => setNote(event.currentTarget.value)} /></label>
      <div className="crm-task-form-actions"><button type="submit" className="admin-primary" disabled={!canAdd}>Add follow-up</button></div>
    </form>
  </section>;
}

const views = [["overdue", "Overdue"], ["today", "Due today"], ["open", "Open"], ["done", "Done"]] as const;
type View = (typeof views)[number][0];
const emptyCopy: Record<View, [string, string]> = {
  overdue: ["Nothing overdue.", "Every follow-up is on time. Anything that slips past its date lands here."],
  today: ["Nothing due today.", "Follow-ups dated today appear here for everyone, or just for you with Only mine."],
  open: ["No open follow-ups.", "Add one from an enquiry or a contact to plan the next step."],
  done: ["No completed follow-ups yet.", "Finished follow-ups are kept here with who closed them."],
};

export function TaskViews({ session, onDenied, onOpenEnquiry, onOpenContact, today = localToday() }: {
  session: StaffSession; onDenied: (status: number) => void; onOpenEnquiry: (id: string) => void; onOpenContact: (id: string) => void; today?: string;
}) {
  const request = useAdminRequest();
  const staff = useDirectory(onDenied);
  const [view, setView] = useState<View>("overdue");
  const [mine, setMine] = useState(false);
  const [items, setItems] = useState<FollowUpTask[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const sequence = useRef(0);
  const callbacks = useRef({ onDenied });
  callbacks.current = { onDenied };
  const load = useCallback(async (next?: string | null) => {
    const current = ++sequence.current;
    setLoading(true); setError(""); setNotice("");
    if (!next) { setItems([]); setCursor(null); }
    const query = `view=${view}&today=${today}${mine ? "&assignment=mine" : ""}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`;
    const result = await readJson(request, `/api/admin/crm/tasks?${query}`, followUpTaskListSchema, "Follow-ups");
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    if (!result.ok) { if (result.denied) { setItems([]); callbacks.current.onDenied(result.denied); } else setError(result.message); return; }
    setItems(rows => next ? [...rows, ...result.value.items.filter(item => !rows.some(row => row.id === item.id))] : result.value.items);
    setCursor(result.value.nextCursor);
  }, [request, view, mine, today]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; }; }, [load]);
  async function toggle(task: FollowUpTask) {
    setBusy(true); setError(""); setNotice("");
    const result = await toggleTask(request, session.csrfToken, task);
    if (!active.current) return;
    setBusy(false);
    if ("denied" in result) { setItems([]); callbacks.current.onDenied(result.denied); return; }
    if ("message" in result) { setError(result.message); return; }
    setItems(rows => rows.filter(row => row.id !== task.id));
    setNotice(result.task.done ? "Follow-up marked done." : "Follow-up reopened.");
  }
  const [emptyTitle, emptyBody] = emptyCopy[view];
  return <section className="crm" aria-label="Follow-up views" aria-busy={loading || busy}>
    <div className="crm-board-head">
      <div role="tablist" aria-label="Follow-up filters" className="crm-tabs">
        {views.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} disabled={busy} onClick={() => setView(key)}>{label}</button>)}
      </div>
      <label className="crm-inline-toggle"><input type="checkbox" aria-label="Only mine" checked={mine} disabled={busy} onChange={event => setMine(event.currentTarget.checked)} /> Only mine</label>
    </div>
    {loading && items.length === 0 && <Skeleton rows={3} />}
    {error && <Notice tone="error">{error}</Notice>}
    {error && <button type="button" className="crm-button-small" onClick={() => void load()}>Try again</button>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {!loading && !error && items.length === 0 && <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>}
    {items.length > 0 && <ul className="crm-task-list">{items.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} onOpenEnquiry={onOpenEnquiry} onOpenContact={onOpenContact} />)}</ul>}
    {cursor && <button type="button" className="crm-pager" disabled={loading || busy} onClick={() => void load(cursor)}>More follow-ups</button>}
  </section>;
}
