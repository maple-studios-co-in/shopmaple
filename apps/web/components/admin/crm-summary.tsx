"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { crmSummarySchema, type CrmSummary as Summary } from "@shopmaple/contracts";
import { RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { ActionButton, useLatest } from "./kit";
import { RetryNotice } from "./crm-tasks";
import { Skeleton, EmptyState, localToday, readJson, stageOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

const dot: Record<string, string> = { new: "bg-neutral", contacted: "bg-info", quoted: "bg-warning", won: "bg-success", lost: "bg-danger",
  overdue: "bg-danger", today: "bg-warning", week: "bg-primary" };
/** Counts on raised tiles: a small label, a large tabular number, a dot in the stage's tone. */
function Tiles({ label, className, tiles }: { label: string; className: string; tiles: [stat: string, label: string, value: number][] }) {
  return <div className={cn("grid grid-cols-2 gap-3", className)} role="group" aria-label={label}>{tiles.map(([stat, text, value]) =>
    <Card key={stat} className="gap-2 rounded-lg px-4 py-3.5 shadow-xs">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span aria-hidden="true" className={cn("size-2 rounded-full", dot[stat])} />{text}</span>
      <span className="text-2xl leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums" data-stat={stat}>{value}</span>
    </Card>)}</div>;
}

export function CrmSummary({ session, onExpired, today = localToday() }: { session: StaffSession; onExpired: () => void; today?: string }) {
  const request = useAdminRequest();
  const [value, setValue] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const expired = useLatest(onExpired), sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current; setBusy(true); setError("");
    const result = await readJson(request, `/api/admin/crm/summary?today=${today}`, crmSummarySchema, "Pipeline summary");
    if (current !== sequence.current) return;
    setBusy(false); setValue(result.ok ? result.value : null);
    if (!result.ok && result.denied === 401) expired.current();
    else if (!result.ok) setError(result.denied ? "Your account does not have access to customer enquiries." : result.message);
  }, [request, today]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load, session.user.id]);
  const total = value ? Object.values(value.stages).reduce((sum, count) => sum + count, 0) : 0;
  return <section className="grid gap-4" aria-label="Pipeline summary" aria-busy={busy}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1"><p className="text-2xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Enquiry pipeline</p>
        <h3 className="text-base font-semibold text-foreground tabular-nums">{value ? `${total} ${total === 1 ? "enquiry" : "enquiries"} in the pipeline` : "Pipeline"}</h3></div>
      <ActionButton icon={RotateCw} variant="ghost" disabled={busy} aria-busy={busy} onClick={() => void load()}>Refresh</ActionButton></div>
    {busy && !value && <Skeleton rows={5} variant="tile" />}
    {error && <RetryNotice disabled={busy} onRetry={() => void load()}>{error}</RetryNotice>}
    {value && total === 0 && !error && <EmptyState title="No enquiries yet.">Contact, project and bulk enquiries from the storefront appear here as soon as they arrive, with their stage, follow-ups and contact.</EmptyState>}
    {value && total > 0 && <div className="grid gap-3">
      <Tiles label="Enquiries per stage" className="sm:grid-cols-3 lg:grid-cols-5" tiles={stageOptions.map(([stage, label]) => [stage, label, value.stages[stage]])} />
      <Tiles label="Follow-ups and recent enquiries" className="sm:grid-cols-3"
        tiles={[["overdue", "Overdue follow-ups", value.overdueTasks], ["today", "Due today", value.dueTodayTasks], ["week", "New in the last 7 days", value.newLastSevenDays]]} />
      <p className="text-xs text-muted-foreground">Counts as of today. Open the Enquiries tab to work the pipeline.</p></div>}
  </section>;
}
