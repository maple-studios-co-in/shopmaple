"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { followUpTaskListSchema, followUpTaskSchema, type FollowUpTask } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { CheckField, FieldGrid, SelectField, rowCard } from "./kit";
import { DueBadge, EmptyState, Notice, Skeleton, dueState, formatDate, localToday, readJson, useDirectory, writeOptions } from "./crm-primitives";
import { NativeSelectOption } from "@/components/ui/native-select";
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
  return <li><article className={cn(rowCard, "items-start data-[done=true]:bg-surface")} data-task={task.id} data-due={state} data-done={task.done ? "true" : "false"}>
    <button type="button" disabled={busy} aria-pressed={task.done} aria-label={task.done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onClick={() => onToggle(task)}
      className="mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border border-input bg-card text-transparent transition-[background-color,border-color,color] duration-150 ease-admin outline-none hover:border-primary hover:text-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
      <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
    </button>
    <div className="grid min-w-0 flex-1 gap-1">
      <p className={cn("text-[13.5px] leading-snug font-semibold text-foreground [overflow-wrap:anywhere]", task.done && "text-muted-foreground line-through decoration-line-soft")}>{task.title}</p>
      {task.note && <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{task.note}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        {task.done && task.completedAt ? <span className="tabular-nums">Done {formatDate(task.completedAt)}</span> : <DueBadge state={state}>{state === "upcoming" ? `Due ${formatDate(task.dueOn)}` : `${state === "overdue" ? "Overdue" : "Due today"}, ${formatDate(task.dueOn)}`}</DueBadge>}
        <span className="[overflow-wrap:anywhere]">{assignee}</span>
      </div>
    </div>
    {(onOpenEnquiry && task.enquiryId || onOpenContact && task.contactId) && <div className="flex shrink-0 gap-1">
      {onOpenEnquiry && task.enquiryId && <Button type="button" size="xs" variant="ghost" aria-label={`Open enquiry for ${task.title}`} onClick={() => onOpenEnquiry(task.enquiryId!)}>Enquiry</Button>}
      {onOpenContact && task.contactId && <Button type="button" size="xs" variant="ghost" aria-label={`Open contact for ${task.title}`} onClick={() => onOpenContact(task.contactId!)}>Contact</Button>}
    </div>}
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
  const [adding, setAdding] = useState(false);
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
    setBusy(true); setAdding(true); setError(""); setNotice("");
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
    } finally { if (active.current) { setBusy(false); setAdding(false); } }
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
  return <section className="grid gap-3" aria-label="Follow-ups" aria-busy={busy || loading}>
    <h4 className="text-[13.5px] font-semibold text-foreground">Follow-ups</h4>
    {loading && open.length === 0 && done.length === 0 && <Skeleton rows={2} />}
    {!loading && !error && open.length === 0 && done.length === 0 && <EmptyState title="No follow-ups yet.">Add the next step with a due date so it shows up in Overdue and Due today.</EmptyState>}
    {open.length > 0 && <ul className="grid gap-2">{open.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} />)}</ul>}
    {done.length > 0 && <>
      <p className="mt-2 text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Done</p>
      <ul className="grid gap-2">{done.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} />)}</ul>
    </>}
    {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Reload follow-ups</Button></div>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <form className="mt-1 grid gap-4 rounded-lg border border-line-soft bg-surface p-4" onSubmit={add} aria-label="Add a follow-up">
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0"><FieldGrid>
        <Field label="Follow-up title" value={title} maxLength={200} onChange={setTitle} />
        <label className="grid min-w-0 gap-2"><span className="text-[12.5px] font-medium text-foreground">Due</span><Input aria-label="Due date" type="date" className="h-10 bg-card text-[13.5px]" value={dueOn} disabled={busy} onChange={event => setDueOn(event.currentTarget.value)} /></label>
        <SelectField label="Assign follow-up to" value={assigneeId} disabled={busy} onChange={event => setAssigneeId(event.currentTarget.value)}>
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {[...staff.values()].map(item => <NativeSelectOption key={item.id} value={item.id}>{item.email}</NativeSelectOption>)}
        </SelectField>
        <Field label="Follow-up note" value={note} maxLength={2000} multiline onChange={setNote} />
      </FieldGrid></fieldset>
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={!canAdd} aria-busy={adding}>{adding ? "Adding follow-up…" : "Add follow-up"}</Button></div>
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
  return <section className="grid gap-4" aria-label="Follow-up views" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={view} onValueChange={value => setView(value as View)}>
        <TabsList aria-label="Follow-up filters">
          {views.map(([key, label]) => <TabsTrigger key={key} value={key} className="px-3 text-[13px]" disabled={busy} onClick={() => setView(key)}>{label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <CheckField label="Only mine" aria-label="Only mine" checked={mine} disabled={busy} onChange={event => setMine(event.currentTarget.checked)} className="w-auto" />
    </div>
    {loading && items.length === 0 && <Skeleton rows={3} />}
    {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice><Button type="button" size="sm" variant="outline" onClick={() => void load()}>Try again</Button></div>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {!loading && !error && items.length === 0 && <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>}
    {items.length > 0 && <ul className="grid gap-2">{items.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} onOpenEnquiry={onOpenEnquiry} onOpenContact={onOpenContact} />)}</ul>}
    {cursor && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={loading || busy} onClick={() => void load(cursor)}>More follow-ups</Button>}
  </section>;
}
