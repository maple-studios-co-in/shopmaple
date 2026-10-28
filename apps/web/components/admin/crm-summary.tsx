"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { crmSummarySchema, type CrmSummary as Summary } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { Notice, Skeleton, EmptyState, localToday, readJson, stageOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

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
  return <section className="crm crm-summary" aria-label="Pipeline summary" aria-busy={busy}>
    <div className="crm-summary-head">
      <div>
        <p className="crm-eyebrow">Enquiry pipeline</p>
        <h3 style={{ margin: 0 }}>{value ? `${total} ${total === 1 ? "enquiry" : "enquiries"} in the pipeline` : "Pipeline"}</h3>
      </div>
      <button type="button" className="crm-button-quiet" disabled={busy} onClick={() => void load()}>Refresh</button>
    </div>
    {busy && !value && <Skeleton rows={5} variant="tile" />}
    {error && <Notice tone="error">{error}</Notice>}
    {error && <button type="button" className="crm-button-small" onClick={() => void load()}>Try again</button>}
    {value && total === 0 && !error && <EmptyState title="No enquiries yet.">Contact, project and bulk enquiries from the storefront appear here as soon as they arrive, with their stage, follow-ups and contact.</EmptyState>}
    {value && total > 0 && <div className="crm-summary-shell">
      <div className="crm-summary-grid" role="group" aria-label="Enquiries per stage">
        {stageOptions.map(([stage, label]) => <div key={stage} className="crm-tile" data-tone={stage}>
          <span className="crm-tile-label">{label}</span>
          <span className="crm-tile-value" data-stat={stage}>{value.stages[stage]}</span>
        </div>)}
      </div>
      <div className="crm-summary-grid" role="group" aria-label="Follow-ups and recent enquiries">
        <div className="crm-tile" data-tone="overdue"><span className="crm-tile-label">Overdue follow-ups</span><span className="crm-tile-value" data-stat="overdue">{value.overdueTasks}</span></div>
        <div className="crm-tile" data-tone="today"><span className="crm-tile-label">Due today</span><span className="crm-tile-value" data-stat="today">{value.dueTodayTasks}</span></div>
        <div className="crm-tile" data-tone="week"><span className="crm-tile-label">New in the last 7 days</span><span className="crm-tile-value" data-stat="week">{value.newLastSevenDays}</span></div>
      </div>
    </div>}
    {value && total > 0 && <p className="crm-faint" style={{ marginTop: 12 }}>Counts as of today. Open the Enquiries tab to work the pipeline.</p>}
  </section>;
}
