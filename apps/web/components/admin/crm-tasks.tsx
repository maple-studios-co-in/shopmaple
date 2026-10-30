"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { followUpTaskListSchema, followUpTaskSchema, type FollowUpTask } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { CheckField, FieldGrid, SelectField, Subsection, rowCard, TabBar, useLatest, usePaged, useWrite, withCursor } from "./kit";
import { DueBadge, EmptyState, Notice, Skeleton, dueState, formatDate, localToday, readJson, useDirectory, writeOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

type Parent = { enquiryId: string } | { contactId: string };
const byDue = (a: FollowUpTask, b: FollowUpTask) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id);
const tasksPath = "/api/admin/crm/tasks";

function TaskRow({ task, today, staff, busy, onToggle, onOpenEnquiry, onOpenContact }: {
  task: FollowUpTask; today: string; staff: ReturnType<typeof useDirectory>; busy: boolean; onToggle: (task: FollowUpTask) => void; onOpenEnquiry?: (id: string) => void; onOpenContact?: (id: string) => void;
}) {
  const state = dueState(task.dueOn, today);
  const assignee = task.assigneeId ? staff.get(task.assigneeId)?.email ?? `Staff ${task.assigneeId}` : "Unassigned";
  return <li><article className={cn(rowCard, "items-start data-[done=true]:bg-surface")} data-task={task.id} data-due={state} data-done={task.done ? "true" : "false"}>
    <button type="button" disabled={busy} aria-pressed={task.done} aria-label={task.done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onClick={() => onToggle(task)}
      className="mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border border-input bg-card text-transparent transition-[background-color,border-color,color] duration-150 ease-admin focus-visible:outline-none hover:border-primary hover:text-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
      <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
    </button>
    <div className="grid min-w-0 flex-1 gap-1">
      <p className={cn("text-sm leading-snug font-semibold text-foreground [overflow-wrap:anywhere]", task.done && "text-muted-foreground line-through decoration-line-soft")}>{task.title}</p>
      {task.note && <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{task.note}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {task.done && task.completedAt ? <span className="tabular-nums">Done {formatDate(task.completedAt)}</span> : <DueBadge state={state}>{state === "upcoming" ? `Due ${formatDate(task.dueOn)}` : `${state === "overdue" ? "Overdue" : "Due today"}, ${formatDate(task.dueOn)}`}</DueBadge>}
        <span className="[overflow-wrap:anywhere]">{assignee}</span>
      </div>
    </div>
    <div className="flex shrink-0 gap-1 empty:hidden">
      {onOpenEnquiry && task.enquiryId && <Button type="button" size="xs" variant="ghost" aria-label={`Open enquiry for ${task.title}`} onClick={() => onOpenEnquiry(task.enquiryId!)}>Enquiry</Button>}
      {onOpenContact && task.contactId && <Button type="button" size="xs" variant="ghost" aria-label={`Open contact for ${task.title}`} onClick={() => onOpenContact(task.contactId!)}>Contact</Button>}
    </div>
  </article></li>;
}

/** A completion request with busy, error and notice state; shared by both task lists, and its write runs the add form too. */
function useToggle(csrfToken: string, onDenied: (status: number) => void, onDone: (before: FollowUpTask, after: FollowUpTask) => void) {
  const request = useAdminRequest();
  const write = useWrite();
  const toggle = (task: FollowUpTask) => write.run(async () => {
    const response = await request(`${tasksPath}/${encodeURIComponent(task.id)}/complete`, writeOptions(csrfToken, { expectedVersion: task.version, done: !task.done }));
    if (!write.active.current) return;
    if (response.status === 401 || response.status === 403) { onDenied(response.status); return; }
    if (response.status === 409) { write.setError("This follow-up changed. Reload follow-ups before trying again."); return; }
    if (!response.ok) throw Error("toggle");
    const value = followUpTaskSchema.parse(await response.json());
    if (value.id !== task.id) throw Error("Wrong follow-up");
    onDone(task, value); write.setNotice(value.done ? "Follow-up marked done." : "Follow-up reopened.");
  }, timedOut => timedOut ? "The request timed out. Reload follow-ups to see whether it was saved." : "We couldn't update the follow-up. Reload follow-ups and try again.");
  return { ...write, toggle };
}

export function TaskPanel({ session, onDenied, parent, today = localToday(), onChanged }: {
  session: StaffSession; onDenied: (status: number) => void; parent: Parent; today?: string; onChanged?: () => void;
}) {
  const request = useAdminRequest();
  const staff = useDirectory(onDenied);
  const callbacks = useLatest({ onDenied, onChanged });
  const scope = "enquiryId" in parent ? `enquiryId=${encodeURIComponent(parent.enquiryId)}` : `contactId=${encodeURIComponent(parent.contactId)}`;
  const denied = (status: number) => { open.setItems([]); done.setItems([]); callbacks.current.onDenied(status); };
  const open = usePaged(() => readJson(request, `${tasksPath}?view=open&today=${today}&${scope}&limit=50`, followUpTaskListSchema, "Follow-ups"), denied);
  const done = usePaged(() => readJson(request, `${tasksPath}?view=done&today=${today}&${scope}&limit=20`, followUpTaskListSchema, "Follow-ups"), denied);
  const reload = () => { void open.load(); void done.load(); };
  useEffect(reload, [request, today, scope, open.load, done.load]);
  const [draft, setDraft] = useState({ title: "", dueOn: today, assigneeId: "", note: "" });
  const [adding, setAdding] = useState(false);
  const { busy, error, setError, notice, setNotice, toggle, active, run } = useToggle(session.csrfToken, denied, (task, value) => {
    open.setItems(rows => value.done ? rows.filter(row => row.id !== task.id) : [...rows, value].sort(byDue));
    done.setItems(rows => value.done ? [value, ...rows] : rows.filter(row => row.id !== task.id));
    callbacks.current.onChanged?.();
  });
  const set = (key: keyof typeof draft) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  const canAdd = !busy && draft.title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueOn);
  function add(event: FormEvent) {
    event.preventDefault();
    if (!canAdd) return;
    setAdding(true);
    void run(async () => {
      const response = await request(tasksPath, writeOptions(session.csrfToken, { ...parent, title: draft.title.trim(), dueOn: draft.dueOn, assigneeId: draft.assigneeId || null, note: draft.note.trim() }));
      if (!active.current) return;
      if (response.status === 401 || response.status === 403) { setDraft(current => ({ ...current, title: "", note: "" })); callbacks.current.onDenied(response.status); return; }
      if (response.status === 400) { setError("Choose an active staff member with enquiry access, or leave the follow-up unassigned."); return; }
      if (!response.ok) throw Error("create");
      const value = followUpTaskSchema.parse(await response.json());
      open.setItems(rows => [...rows, value].sort(byDue));
      setDraft({ title: "", dueOn: today, assigneeId: "", note: "" });
      setNotice("Follow-up added."); callbacks.current.onChanged?.();
    }, timedOut => timedOut ? "Adding the follow-up timed out. Reload follow-ups to see whether it was saved." : "We couldn't add the follow-up. Try again.").then(() => { if (active.current) setAdding(false); });
  }
  const loading = open.loading || done.loading, failure = error || open.error || done.error, none = open.items.length === 0 && done.items.length === 0;
  const rows = (tasks: FollowUpTask[]) => <ul className="grid gap-2">{tasks.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} />)}</ul>;
  return <Subsection title="Follow-ups" aria-label="Follow-ups" aria-busy={busy || loading}>
    {loading && none && <Skeleton rows={2} />}
    {!loading && !failure && none && <EmptyState title="No follow-ups yet.">Add the next step with a due date so it shows up in Overdue and Due today.</EmptyState>}
    {open.items.length > 0 && rows(open.items)}
    {done.items.length > 0 && <><p className="mt-2 text-2xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Done</p>{rows(done.items)}</>}
    {failure && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{failure}</Notice><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); reload(); }}>Reload follow-ups</Button></div>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <form className="mt-1 grid gap-4 rounded-lg border border-line-soft bg-surface p-4" onSubmit={add} aria-label="Add a follow-up">
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0"><FieldGrid>
        <Field label="Follow-up title" value={draft.title} maxLength={200} onChange={set("title")} />
        <label className="grid min-w-0 gap-2"><span className="text-xs font-medium text-foreground">Due</span><Input aria-label="Due date" type="date" className="h-10 bg-card text-sm" value={draft.dueOn} disabled={busy} onChange={event => set("dueOn")(event.currentTarget.value)} /></label>
        <SelectField label="Assign follow-up to" value={draft.assigneeId} disabled={busy} onChange={event => set("assigneeId")(event.currentTarget.value)}>
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {[...staff.values()].map(item => <NativeSelectOption key={item.id} value={item.id}>{item.email}</NativeSelectOption>)}
        </SelectField>
        <Field label="Follow-up note" value={draft.note} maxLength={2000} multiline onChange={set("note")} />
      </FieldGrid></fieldset>
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={!canAdd} aria-busy={adding}>{adding ? "Adding follow-up…" : "Add follow-up"}</Button></div>
    </form>
  </Subsection>;
}

const views = [
  ["overdue", "Overdue", "Nothing overdue.", "Every follow-up is on time. Anything that slips past its date lands here."],
  ["today", "Due today", "Nothing due today.", "Follow-ups dated today appear here for everyone, or just for you with Only mine."],
  ["open", "Open", "No open follow-ups.", "Add one from an enquiry or a contact to plan the next step."],
  ["done", "Done", "No completed follow-ups yet.", "Finished follow-ups are kept here with who closed them."],
] as const;
type View = (typeof views)[number][0];

export function TaskViews({ session, onDenied, onOpenEnquiry, onOpenContact, today = localToday() }: {
  session: StaffSession; onDenied: (status: number) => void; onOpenEnquiry: (id: string) => void; onOpenContact: (id: string) => void; today?: string;
}) {
  const request = useAdminRequest();
  const staff = useDirectory(onDenied);
  const [view, setView] = useState<View>("overdue");
  const [mine, setMine] = useState(false);
  const query = `${tasksPath}?view=${view}&today=${today}${mine ? "&assignment=mine" : ""}`;
  const list = usePaged(cursor => readJson(request, withCursor(query, cursor), followUpTaskListSchema, "Follow-ups"), onDenied);
  const { busy, error, setError, notice, setNotice, toggle } = useToggle(session.csrfToken, status => { list.setItems([]); onDenied(status); }, task => list.setItems(rows => rows.filter(row => row.id !== task.id)));
  const reload = () => { setError(""); setNotice(""); list.setItems([]); void list.load(); };
  useEffect(reload, [query, list.load]);
  const [, , emptyTitle, emptyBody] = views.find(([key]) => key === view)!;
  const failure = error || list.error;
  return <section className="grid gap-4" aria-label="Follow-up views" aria-busy={list.loading || busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <TabBar label="Follow-up filters" tabs={views} value={view} onSelect={setView} disabled={busy} />
      <CheckField label="Only mine" aria-label="Only mine" checked={mine} disabled={busy} onChange={event => setMine(event.currentTarget.checked)} className="w-auto" />
    </div>
    {list.loading && list.items.length === 0 && <Skeleton rows={3} />}
    {failure && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{failure}</Notice><Button type="button" size="sm" variant="outline" onClick={reload}>Try again</Button></div>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {!list.loading && !failure && list.items.length === 0 && <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>}
    {list.items.length > 0 && <ul className="grid gap-2">{list.items.map(task => <TaskRow key={task.id} task={task} today={today} staff={staff} busy={busy} onToggle={toggle} onOpenEnquiry={onOpenEnquiry} onOpenContact={onOpenContact} />)}</ul>}
    {list.cursor && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={list.loading || busy} onClick={() => void list.load(list.cursor)}>More follow-ups</Button>}
  </section>;
}
