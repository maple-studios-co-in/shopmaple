"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpRight, GripVertical, RotateCw, UserRound } from "lucide-react";
import { enquiryAdminDetailSchema, enquiryAdminListSchema, enquiryStageLabels, enquiryStages, type EnquiryAdminSummary, type EnquiryStage } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Avatar, DueBadge, Notice, Skeleton, ageLabel, dueState, localToday, readJson, stageOptions, useDirectory, writeOptions, type DueState } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

type BoardItem = EnquiryAdminSummary & { lostReason?: string | null; pending?: boolean };
type Columns = Record<EnquiryStage, BoardItem[]>;
type Directory = ReturnType<typeof useDirectory>;
const emptyColumns = (): Columns => ({ new: [], contacted: [], quoted: [], won: [], lost: [] });
const emptyCopy: Record<EnquiryStage, string> = { new: "No new enquiries. Fresh submissions land here.", contacted: "Nothing contacted yet. Drag a card here once you have replied.", quoted: "Nothing quoted yet. Move an enquiry here when a quote goes out.", won: "No wins yet.", lost: "Nothing lost. Each lost enquiry keeps a short reason." };
/** Cards per column; a column with more shows a pointer to the list view instead of loading everything. */
const columnLimit = 50;
const stageOf = (value: string): EnquiryStage => (enquiryStages as readonly string[]).includes(value) ? value as EnquiryStage : "new";

function BoardCard({ card, today, staff, due, busy, lostPrompt, onMoveIntent, onConfirmLost, onCancelLost, onOpenEnquiry, onOpenContact }: {
  card: BoardItem; today: string; staff: Directory; due: DueState | null; busy: boolean; lostPrompt: boolean;
  onMoveIntent: (card: BoardItem, stage: EnquiryStage) => void; onConfirmLost: (card: BoardItem, reason: string) => void; onCancelLost: () => void;
  onOpenEnquiry: (id: string) => void; onOpenContact: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: busy || card.pending });
  const [reason, setReason] = useState("");
  const assignee = card.assignedToId ? staff.get(card.assignedToId) : null;
  const name = card.name || "enquiry";
  return <Card ref={setNodeRef} data-card data-name={card.name} data-version={card.version} data-enquiry={card.id}
    data-dragging={isDragging ? "true" : undefined} data-pending={card.pending ? "true" : undefined} style={{ transform: CSS.Translate.toString(transform) }}
    className="relative gap-2.5 rounded-lg px-3 py-3 shadow-xs transition-[box-shadow,opacity] duration-200 ease-admin data-[dragging=true]:z-20 data-[dragging=true]:shadow-lg data-[pending=true]:opacity-60">
    <div className="flex items-start gap-2">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-sm leading-snug font-semibold text-foreground [overflow-wrap:anywhere]">{card.name || "No name given"}</p>
        <p className={cn("text-xs [overflow-wrap:anywhere]", card.product ? "text-muted-foreground" : "text-faint")}>{card.product || "No product noted"}</p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" className="-mt-1 -mr-1.5 cursor-grab text-muted-foreground active:cursor-grabbing" data-drag-handle ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={busy || card.pending} aria-label={`Drag ${name}`}><GripVertical aria-hidden="true" strokeWidth={1.5} /></Button>
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground tabular-nums" title={`Received ${new Date(card.createdAt).toLocaleDateString()}`}>{ageLabel(card.createdAt, today)}</span>
      {due && <DueBadge state={due} />}
      <span className="ml-auto">{assignee ? <Avatar email={assignee.email} title={`Assigned to ${assignee.email}`} /> : card.assignedToId ? <Avatar email={card.assignedToId} title={`Assigned to staff ${card.assignedToId}`} /> : null}</span>
    </div>
    {card.status === "lost" && card.lostReason && <p className="rounded-md bg-surface px-2.5 py-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{card.lostReason}</p>}
    {lostPrompt && <form className="grid gap-2 border-t border-line-soft pt-2.5" aria-label={`Reason for losing ${name}`}
      // A form submission, not a click handler: dnd-kit swallows document clicks for 50ms after a drop,
      // while a submit button's default action still fires the submit event. The reason is always sent.
      onSubmit={event => { event.preventDefault(); if (!busy && reason.trim()) onConfirmLost(card, reason.trim()); }}>
      <label className="grid gap-1.5 text-xs font-medium text-foreground">Why was this enquiry lost?<Textarea aria-label="Reason for losing" value={reason} maxLength={500} rows={2} className="min-h-14 bg-card text-sm" onInput={event => setReason(event.currentTarget.value)} onChange={() => {}} /></label>
      <div className="flex gap-1.5">
        <Button type="submit" size="xs" disabled={busy || !reason.trim()}>Confirm lost</Button>
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => { setReason(""); onCancelLost(); }}>Cancel</Button>
      </div>
    </form>}
    <div className="flex items-center gap-1 border-t border-line-soft pt-2.5">
      <NativeSelect size="sm" aria-label={`Move ${name} to`} containerClassName="min-w-0 flex-1" className="h-7 bg-card text-xs" value={card.status} disabled={busy || card.pending} onChange={event => onMoveIntent(card, stageOf(event.currentTarget.value))}>
        {stageOptions.map(([stage, label]) => <NativeSelectOption key={stage} value={stage}>{label}</NativeSelectOption>)}
      </NativeSelect>
      <Button type="button" variant="ghost" size="icon-sm" title="Open enquiry" aria-label={`Open enquiry from ${name}`} onClick={() => onOpenEnquiry(card.id)}><ArrowUpRight aria-hidden="true" strokeWidth={1.5} /></Button>
      {card.contactId && <Button type="button" variant="ghost" size="icon-sm" title="Open contact" aria-label={`Open contact for ${name}`} onClick={() => onOpenContact(card.contactId!)}><UserRound aria-hidden="true" strokeWidth={1.5} /></Button>}
    </div>
  </Card>;
}

function BoardColumn({ stage, cards, loading, capped, children }: { stage: EnquiryStage; cards: BoardItem[]; loading: boolean; capped: boolean; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: stage });
  return <Card ref={setNodeRef} role="region" data-stage-column={stage} data-drop-active={isOver && active ? "true" : undefined} aria-label={`${enquiryStageLabels[stage]} column`}
    className="w-[268px] shrink-0 gap-0 rounded-xl bg-surface py-0 shadow-xs transition-[box-shadow,border-color] duration-200 ease-admin data-[drop-active=true]:border-primary data-[drop-active=true]:shadow-[0_0_0_1px_var(--primary)]">
    <header className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 py-3">
      <h4 className="text-sm font-semibold text-foreground">{enquiryStageLabels[stage]}</h4>
      <span data-column-count className="rounded-md bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums" aria-label={`${capped ? "more than " : ""}${cards.length} in ${enquiryStageLabels[stage]}`}>{cards.length}{capped ? "+" : ""}</span>
    </header>
    <div className="grid min-h-40 content-start gap-2 p-2.5">
      {loading && cards.length === 0 ? <Skeleton rows={2} variant="card" /> : children}
      {!loading && cards.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs leading-relaxed text-muted-foreground">{emptyCopy[stage]}</p>}
      {capped && <p className="px-1 text-xs leading-relaxed text-muted-foreground" data-column-capped={stage}>Showing the newest {cards.length}. More {enquiryStageLabels[stage].toLowerCase()} enquiries are in the list view.</p>}
    </div>
  </Card>;
}

export function CrmBoard({ session, onDenied, onOpenEnquiry, onOpenContact, today = localToday() }: {
  session: StaffSession; onDenied: (status: number) => void; onOpenEnquiry: (id: string) => void; onOpenContact: (id: string) => void; today?: string;
}) {
  const request = useAdminRequest();
  const staff = useDirectory(onDenied);
  const contextId = useId();
  const [columns, setColumns] = useState<Columns>(emptyColumns);
  const [capped, setCapped] = useState<Set<EnquiryStage>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lostPrompt, setLostPrompt] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const active = useRef(true);
  const sequence = useRef(0);
  const callbacks = useRef({ onDenied });
  callbacks.current = { onDenied };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(""); setNotice("");
    const results = await Promise.all(enquiryStages.map(stage => readJson(request, `/api/admin/enquiries?status=${stage}&limit=${columnLimit}`, enquiryAdminListSchema, "Pipeline board")));
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    const denied = results.find(result => !result.ok && result.denied);
    if (denied && !denied.ok && denied.denied) { setColumns(emptyColumns()); callbacks.current.onDenied(denied.denied); return; }
    const next = emptyColumns(), full = new Set<EnquiryStage>();
    const failures: string[] = [];
    results.forEach((result, index) => { const stage = enquiryStages[index]!; if (result.ok) { next[stage] = result.value.items; if (result.value.nextCursor) full.add(stage); } else failures.push(enquiryStageLabels[stage]); });
    setColumns(next); setCapped(full);
    if (failures.length) setError(`We couldn't load part of the board (${failures.join(", ")}). Reload the board to try again.`);
  }, [request, today]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; }; }, [load, session.user.id]);

  function relocate(id: string, from: EnquiryStage, to: EnquiryStage, index: number | null, patch: Partial<BoardItem> = {}) {
    setColumns(current => {
      const card = current[from].find(item => item.id === id); if (!card) return current;
      const next = { ...current, [from]: current[from].filter(item => item.id !== id) };
      const moved = { ...card, ...patch, status: to };
      const target = [...next[to]];
      target.splice(index === null ? 0 : Math.min(index, target.length), 0, moved);
      return { ...next, [to]: target };
    });
  }
  async function move(card: BoardItem, to: EnquiryStage, reason?: string) {
    const from = card.status as EnquiryStage;
    if (from === to && !reason) return;
    const index = columns[from].findIndex(item => item.id === card.id);
    setLostPrompt(null); setBusy(true); setError(""); setNotice("");
    relocate(card.id, from, to, null, { pending: true, lostReason: reason ?? null });
    setLiveMessage(`Moving ${card.name || "enquiry"} to ${enquiryStageLabels[to]}.`);
    try {
      const response = await request(`/api/admin/enquiries/${encodeURIComponent(card.id)}/stage`, writeOptions(session.csrfToken, { expectedVersion: card.version, stage: to, ...(reason ? { reason } : {}) }));
      if (!active.current) return;
      if (response.status === 401 || response.status === 403) { setColumns(emptyColumns()); callbacks.current.onDenied(response.status); return; }
      if (!response.ok) {
        relocate(card.id, to, from, index, { pending: false, lostReason: card.lostReason ?? null });
        setError(response.status === 409 ? `${card.name || "This enquiry"} changed since the board loaded. Reload the board before moving it again.` : `We couldn't move ${card.name || "this enquiry"}. Reload the board and try again.`);
        setLiveMessage(`${card.name || "Enquiry"} returned to ${enquiryStageLabels[from]}.`);
        return;
      }
      const detail = enquiryAdminDetailSchema.parse(await response.json());
      if (!active.current || detail.id !== card.id) return;
      setColumns(current => ({ ...current, [to]: current[to].map(item => item.id === card.id ? { ...item, status: detail.status, version: detail.version, assignedToId: detail.assignedToId, lostReason: detail.lostReason, pending: false } : item) }));
      setNotice(`${card.name || "Enquiry"} moved to ${enquiryStageLabels[to]}.`);
      setLiveMessage(`${card.name || "Enquiry"} is now in ${enquiryStageLabels[to]}.`);
    } catch (failure) {
      if (!active.current) return;
      relocate(card.id, to, from, index, { pending: false, lostReason: card.lostReason ?? null });
      setError(failure instanceof AdminRequestTimeout ? `Moving ${card.name || "the enquiry"} timed out. Reload the board to see its current stage.` : `We couldn't move ${card.name || "this enquiry"}. Reload the board and try again.`);
    } finally { if (active.current) setBusy(false); }
  }
  function intent(card: BoardItem, to: EnquiryStage) {
    if (to === card.status) { setLostPrompt(null); return; }
    if (to === "lost") { setLostPrompt(card.id); return; }
    void move(card, to);
  }
  function dragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const card = enquiryStages.flatMap(stage => columns[stage]).find(item => item.id === id);
    if (!card || !event.over) return;
    intent(card, stageOf(String(event.over.id)));
  }
  const nameOf = (id: string) => enquiryStages.flatMap(stage => columns[stage]).find(item => item.id === id)?.name || "enquiry";
  const announcements: Announcements = {
    onDragStart: ({ active: item }) => `Picked up ${nameOf(String(item.id))}. Move it over a column and drop to change its stage.`,
    onDragOver: ({ over }) => over ? `Over ${enquiryStageLabels[stageOf(String(over.id))]}.` : "Not over a column.",
    onDragEnd: ({ over }) => over ? `Dropped in ${enquiryStageLabels[stageOf(String(over.id))]}.` : "Drop cancelled.",
    onDragCancel: () => "Move cancelled.",
  };
  const total = enquiryStages.reduce((sum, stage) => sum + columns[stage].length, 0);
  return <section className="grid min-w-0 gap-4" aria-label="Pipeline board" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">{loading && total === 0 ? "Loading the pipeline…" : `${total} ${total === 1 ? "enquiry" : "enquiries"} across ${enquiryStages.length} stages. Drag a card or use its Move to control.`}</p>
      <Button type="button" size="sm" variant="outline" disabled={loading || busy} aria-busy={loading} onClick={() => void load()}><RotateCw aria-hidden="true" strokeWidth={1.5} />Reload board</Button>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <p className="sr-only" aria-live="polite">{liveMessage}</p>
    <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements }} onDragEnd={dragEnd}>
      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {enquiryStages.map(stage => <BoardColumn key={stage} stage={stage} cards={columns[stage]} loading={loading} capped={capped.has(stage)}>
          {columns[stage].map(card => {
            return <BoardCard key={card.id} card={card} today={today} staff={staff} due={card.nextDueOn ? dueState(card.nextDueOn, today) : null} busy={busy}
              lostPrompt={lostPrompt === card.id} onMoveIntent={intent} onConfirmLost={(item, reason) => void move(item, "lost", reason)} onCancelLost={() => setLostPrompt(null)}
              onOpenEnquiry={onOpenEnquiry} onOpenContact={onOpenContact} />;
          })}
        </BoardColumn>)}
      </div>
      <p className="text-xs text-muted-foreground lg:hidden" aria-hidden="true">Scroll sideways to reach every stage.</p>
    </DndContext>
  </section>;
}
