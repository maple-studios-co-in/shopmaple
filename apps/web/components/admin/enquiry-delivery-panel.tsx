"use client";
import { useEffect, useRef, useState } from "react";
import { enquiryDeliveryResponseSchema, type EnquiryDeliveryResponse } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

type Props = {
  session: StaffSession;
  enquiryId: string;
  onDenied: (status: number) => void;
  onBusy: (busy: boolean) => void;
};
export function EnquiryDeliveryPanel(props: Props) {
  return <DeliverySession key={`${props.enquiryId}:${props.session.user.id}:${props.session.csrfToken}:${props.session.user.canManageEnquiries}`} {...props} />;
}
function DeliverySession({ session, enquiryId, onDenied, onBusy }: Props) {
  const request = useAdminRequest();
  const [value, setValue] = useState<EnquiryDeliveryResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(true);
  const pending = useRef(false);
  const sequence = useRef(0);
  const callbacks = useRef({ onDenied, onBusy });
  callbacks.current = { onDenied, onBusy };
  const path = `/api/admin/enquiries/${encodeURIComponent(enquiryId)}/delivery`;
  async function run(retry = false, notify = true) {
    if (pending.current || !active.current) return;
    if (retry && (!value?.enabled || value.delivery?.status !== "retry_wait" || !value.delivery.canRetry)) return;
    pending.current = true;
    const current = ++sequence.current;
    const isCurrent = () => active.current && current === sequence.current;
    setBusy(true); setError("");
    if (notify) callbacks.current.onBusy(true);
    async function read(retryRequest: boolean) {
      const response = await request(retryRequest ? `${path}/retry` : path, {
        cache: "no-store", credentials: "same-origin",
        ...(retryRequest ? { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify({ expectedVersion: value!.delivery!.version }) } : {}),
      });
      if (!isCurrent()) return null;
      if (response.status === 401 || response.status === 403) {
        active.current = false; sequence.current++; setValue(null);
        callbacks.current.onDenied(response.status);
        return null;
      }
      if (response.status === 409) throw new Error("conflict");
      if (!response.ok) throw new Error("request");
      const parsed = enquiryDeliveryResponseSchema.parse(await response.json());
      if (!isCurrent()) return null;
      if (parsed.enquiryId !== enquiryId) throw new Error("identity");
      return parsed;
    }
    try {
      const result = await read(retry);
      if (!result || !isCurrent()) return;
      // The worker may already have advanced beyond the retry response.
      const refreshed = retry ? await read(false) : result;
      if (refreshed && isCurrent()) setValue(refreshed);
    } catch (failure) {
      if (isCurrent()) {
        setValue(null);
        setError(failure instanceof AdminRequestTimeout
          ? "The notification request timed out. Reload notification status before trying again."
          : failure instanceof Error && failure.message === "conflict"
            ? "Notification status changed. Reload notification status before trying again."
            : retry
              ? "We couldn't confirm the retry. Reload notification status before trying again."
              : "We couldn't load notification status. Reload notification status to try again.");
      }
    } finally {
      if (isCurrent()) { pending.current = false; setBusy(false); if (notify) callbacks.current.onBusy(false); }
    }
  }
  useEffect(() => {
    active.current = true; pending.current = false; void run(false, false);
    return () => { active.current = false; sequence.current++; };
  }, [request, path]);
  const job = value?.delivery;
  const labels = {
    queued: "Queued for the provider.",
    sending: "Sending to the provider.",
    retry_wait: "Waiting to retry with the provider.",
    accepted: "Accepted by the email provider.",
    failed: "Needs attention. Automatic attempts have stopped; ask an operator to review.",
    uncertain: "Outcome uncertain. Operator reconciliation is required before further action.",
  };
  return <section aria-label="Enquiry notification" aria-busy={busy}>
    <h4>Enquiry notification</h4>
    <p>Provider acceptance does not confirm inbox delivery. This alert does not send a customer reply.</p>
    {value && !value.enabled && <p>Enquiry notifications are disabled.</p>}
    {value && !job && value.enabled && <p>No notification was queued for this enquiry.</p>}
    {job && <>
      <p>{labels[job.status]}</p>
      <p>Attempts: {job.attempts} of 5.</p>
      {job.nextAttemptAt && <p>Next attempt: <time dateTime={job.nextAttemptAt}>{new Date(job.nextAttemptAt).toLocaleString()}</time>.</p>}
      {job.acceptedAt && <p>Provider acceptance: <time dateTime={job.acceptedAt}>{new Date(job.acceptedAt).toLocaleString()}</time>.</p>}
      {job.errorCode && <p>Last status code: {job.errorCode}.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading notification status…</p>}
    {value?.enabled && job?.status === "retry_wait" && job.canRetry && <button type="button" disabled={busy} onClick={() => void run(true)}>Retry notification</button>}
    <button type="button" disabled={busy} onClick={() => void run()}>Reload notification</button>
  </section>;
}
