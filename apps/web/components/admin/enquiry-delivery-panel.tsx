"use client";
import { useEffect, useRef, useState } from "react";
import { enquiryDeliveryResponseSchema, type EnquiryDeliveryResponse } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton, writeOptions } from "./crm-primitives";
import { isDenied, type CrmViewProps } from "./crm-tasks";
import { Subsection, useLatest } from "./kit";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const labels = { queued: "Queued for the provider.", sending: "Sending to the provider.", retry_wait: "Waiting to retry with the provider.", accepted: "Accepted by the email provider.",
  failed: "Needs attention. Automatic attempts have stopped; ask an operator to review.", uncertain: "Outcome uncertain. Operator reconciliation is required before further action." };
const at = (value: string) => <time dateTime={value}>{new Date(value).toLocaleString()}</time>;

/** The staff alert for one enquiry; key it per enquiry. onEnabled says whether email is configured, so replies can refuse up front. */
export function EnquiryDeliveryPanel({ session, enquiryId, onDenied, onBusy, onEnabled }: Pick<CrmViewProps, "session" | "onDenied"> & {
  enquiryId: string; onBusy: (busy: boolean) => void; onEnabled?: (enabled: boolean) => void;
}) {
  const request = useAdminRequest();
  const [value, setValue] = useState<EnquiryDeliveryResponse | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const active = useRef(true), pending = useRef(false), sequence = useRef(0);
  const callbacks = useLatest({ onDenied, onBusy, onEnabled });
  const path = `/api/admin/enquiries/${encodeURIComponent(enquiryId)}/delivery`;
  const job = value?.delivery, canRetry = !!value?.enabled && job?.status === "retry_wait" && job.canRetry;
  async function run(retry = false, notify = true) {
    if (pending.current || !active.current || (retry && !canRetry)) return;
    pending.current = true;
    const current = ++sequence.current, isCurrent = () => active.current && current === sequence.current;
    setBusy(true); setError("");
    if (notify) callbacks.current.onBusy(true);
    async function read(post: boolean) {
      const init = post ? writeOptions(session.csrfToken, { expectedVersion: job!.version }) : { cache: "no-store", credentials: "same-origin" } as const;
      const response = await request(post ? `${path}/retry` : path, init);
      if (!isCurrent()) return null;
      if (isDenied(response.status)) { active.current = false; sequence.current++; setValue(null); callbacks.current.onDenied(response.status); return null; }
      if (!response.ok) throw new Error(response.status === 409 ? "conflict" : "request");
      const parsed = enquiryDeliveryResponseSchema.parse(await response.json());
      if (!isCurrent()) return null;
      if (parsed.enquiryId !== enquiryId) throw new Error("identity");
      return parsed;
    }
    try {
      const result = await read(retry);
      // The worker may already have advanced beyond the retry response.
      const refreshed = result && retry && isCurrent() ? await read(false) : result;
      if (refreshed && isCurrent()) { setValue(refreshed); callbacks.current.onEnabled?.(refreshed.enabled); }
    } catch (failure) {
      if (!isCurrent()) return;
      setValue(null);
      setError(failure instanceof AdminRequestTimeout ? "The notification request timed out. Reload notification status before trying again." : failure instanceof Error && failure.message === "conflict" ? "Notification status changed. Reload notification status before trying again."
        : retry ? "We couldn't confirm the retry. Reload notification status before trying again." : "We couldn't load notification status. Reload notification status to try again.");
    } finally { if (isCurrent()) { pending.current = false; setBusy(false); if (notify) callbacks.current.onBusy(false); } }
  }
  useEffect(() => {
    active.current = true; pending.current = false; void run(false, false);
    return () => { active.current = false; sequence.current++; };
  }, [request, path]);
  return <Subsection title="Enquiry notification" aria-label="Enquiry notification" aria-busy={busy}
    description="Provider acceptance does not confirm inbox delivery. This alert does not send a customer reply.">
    {busy && !value && !error && <Skeleton rows={1} />}
    {value && (!value.enabled || !job) && <p className="text-sm text-foreground">{value.enabled ? "No notification was queued for this enquiry." : "Enquiry notifications are disabled."}</p>}
    {job && <div className="grid gap-1 rounded-lg border border-line-soft bg-surface px-3.5 py-3 text-xs text-muted-foreground">
      <p className="text-sm font-semibold text-foreground">{labels[job.status]}</p>
      <p className="tabular-nums">Attempts: {job.attempts} of 5.</p>
      {job.nextAttemptAt && <p>Next attempt: {at(job.nextAttemptAt)}.</p>}{job.acceptedAt && <p>Provider acceptance: {at(job.acceptedAt)}.</p>}
      {job.errorCode && <p>Last status code: {job.errorCode}.</p>}</div>}
    {error && <Notice tone="error">{error}</Notice>}
    {busy && <p role="status" className="text-xs text-muted-foreground">Loading notification status…</p>}
    <div className="flex flex-wrap gap-2">
      {canRetry && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(true)}>Retry notification</Button>}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run()}>Reload notification</Button></div>
  </Subsection>;
}
