"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { crmSummarySchema, type CrmSummary as Summary } from "@shopmaple/contracts";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Notice, Skeleton, EmptyState, localToday, readJson, stageOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

const stageAccent: Record<string, string> = { new: "bg-neutral", contacted: "bg-info", quoted: "bg-warning", won: "bg-success", lost: "bg-danger", overdue: "bg-danger", today: "bg-warning", week: "bg-primary" };
/** One count on a raised tile: a small label, a large tabular number, a dot in the stage's tone. */
function Tile({ stat, label, value }: { stat: string; label: string; value: number }) {
  return <Card className="gap-2 rounded-lg px-4 py-3.5 shadow-xs">
    <span className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground"><span aria-hidden="true" className={cn("size-2 rounded-full", stageAccent[stat])} />{label}</span>
    <span className="text-[26px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums" data-stat={stat}>{value}</span>
  </Card>;
}

export function CrmSummary({ session, onExpired, today = localToday() }: { session: StaffSession; onExpired: () => void; today?: string }) {
  const request = useAdminRequest();
  const [value, setValue] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setBusy(true); setError("");
    const result = await readJson(request, `/api/admin/crm/summary?today=${today}`, crmSummarySchema, "Pipeline summary");
    if (current !== sequence.current) return;
    setBusy(false);
    if (result.ok) { setValue(result.value); return; }
    setValue(null);
    if (result.denied) { if (result.denied === 401) expired.current(); else setError("Your account does not have access to customer enquiries."); return; }
    setError(result.message);
  }, [request, today]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load, session.user.id]);
  const total = value ? Object.values(value.stages).reduce((sum, count) => sum + count, 0) : 0;
  return <section className="grid gap-4" aria-label="Pipeline summary" aria-busy={busy}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <p className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Enquiry pipeline</p>
        <h3 className="text-[15px] font-semibold text-foreground tabular-nums">{value ? `${total} ${total === 1 ? "enquiry" : "enquiries"} in the pipeline` : "Pipeline"}</h3>
      </div>
      <Button type="button" size="sm" variant="ghost" disabled={busy} aria-busy={busy} onClick={() => void load()}><RotateCw aria-hidden="true" strokeWidth={1.5} />Refresh</Button>
    </div>
    {busy && !value && <Skeleton rows={5} variant="tile" />}
    {error && <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{error}</Notice><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Try again</Button></div>}
    {value && total === 0 && !error && <EmptyState title="No enquiries yet.">Contact, project and bulk enquiries from the storefront appear here as soon as they arrive, with their stage, follow-ups and contact.</EmptyState>}
    {value && total > 0 && <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Enquiries per stage">
        {stageOptions.map(([stage, label]) => <Tile key={stage} stat={stage} label={label} value={value.stages[stage]} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-label="Follow-ups and recent enquiries">
        <Tile stat="overdue" label="Overdue follow-ups" value={value.overdueTasks} />
        <Tile stat="today" label="Due today" value={value.dueTodayTasks} />
        <Tile stat="week" label="New in the last 7 days" value={value.newLastSevenDays} />
      </div>
      <p className="text-[12px] text-muted-foreground">Counts as of today. Open the Enquiries tab to work the pipeline.</p>
    </div>}
  </section>;
}
