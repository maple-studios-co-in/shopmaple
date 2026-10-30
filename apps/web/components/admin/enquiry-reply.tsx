"use client";
import { useEffect, useState } from "react";
import { enquiryAdminDetailSchema, type EnquiryAdminDetail } from "@shopmaple/contracts";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StaffSession } from "./dashboard";
import { Subsection, useLatest, useWrite } from "./kit";
import { Notice, writeOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

const bodyLimit = 5000, subjectLimit = 150;
const unconfigured = "Email replies are not configured on this server. Contact the customer by phone or from your own mailbox.";
const refusals: Record<number, string> = {
  409: "This enquiry changed. Reload the enquiry before sending again. Your draft is kept.",
  429: "You have sent many replies recently. Wait a while before sending more.",
  502: "The email provider did not accept the reply. It was recorded as failed in activity; check there before trying again.",
  503: unconfigured,
};
const fieldLabel = "grid gap-1.5 text-xs font-medium text-foreground";

export function EnquiryReply({ detail, session, emailEnabled, onChange, onDenied, onBusy }: {
  detail: EnquiryAdminDetail; session: StaffSession;
  /** From the notification panel's delivery status: false refuses sends up front, null means unknown (the server decides). */
  emailEnabled: boolean | null;
  onChange: (value: EnquiryAdminDetail) => void; onDenied: (status: number) => void; onBusy: (busy: boolean) => void;
}) {
  const request = useAdminRequest();
  const [refused, setRefused] = useState(false);
  const enabled = refused ? false : emailEnabled;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [stale, setStale] = useState(false);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState(false);
  const callbacks = useLatest({ onChange, onDenied });
  const { busy, error, setError, notice, setNotice, active, run } = useWrite(onBusy);
  // A newer enquiry version from elsewhere clears a stale marker so the draft can be sent again.
  useEffect(() => { setStale(false); }, [detail.version]);
  const ready = enabled !== false && !denied && !stale && !busy && subject.trim().length > 0 && body.trim().length > 0 && subject.length <= subjectLimit && body.length <= bodyLimit;
  const send = () => ready && run(async () => {
    const response = await request(`/api/admin/enquiries/${encodeURIComponent(detail.id)}/reply`, writeOptions(session.csrfToken, { expectedVersion: detail.version, subject: subject.trim(), body: body.trim() }));
    if (!active.current) return;
    if (response.status === 401 || response.status === 403) { setDenied(true); setSubject(""); setBody(""); callbacks.current.onDenied(response.status); return; }
    if (refusals[response.status]) { setStale(response.status === 409); setRefused(current => current || response.status === 503); setError(refusals[response.status]!); return; }
    if (!response.ok) throw Error("send");
    const value = enquiryAdminDetailSchema.parse(await response.json());
    if (!active.current) return;
    if (value.id !== detail.id) throw Error("Wrong enquiry");
    callbacks.current.onChange(value);
    setSubject(""); setBody(""); setOpen(false);
    setNotice("Reply sent to the customer and recorded in activity.");
  }, timedOut => timedOut
    ? "The reply request timed out. Your draft is kept; check activity before sending again so the customer is not emailed twice."
    : "We couldn't send the reply. Your draft is kept; reload the enquiry and check activity before trying again.");
  if (denied) return <Subsection title="Reply by email" aria-label="Reply by email"><Notice tone="info">Replies are unavailable for this account.</Notice></Subsection>;
  const recipient = <strong className="font-semibold text-foreground">{detail.email}</strong>;
  return <Subsection title="Reply by email" aria-label="Reply by email" aria-busy={busy}
    description={<>Plain text goes to {recipient} from the shop&apos;s configured sender. The full message is kept in activity.</>}
    actions={<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}><Mail aria-hidden="true" strokeWidth={1.5} />Reply</Button>}>
    {enabled === false && <Notice tone="info">{unconfigured}</Notice>}
    {!open && error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent className="gap-5 bg-card sm:max-w-xl" aria-busy={busy}>
        <DialogHeader>
          <DialogTitle className="text-lg">Reply to {detail.name || "the customer"}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed [overflow-wrap:anywhere]">Plain text goes to {recipient}. The full message is kept in activity.</DialogDescription>
        </DialogHeader>
        {enabled === false && <Notice tone="info">{unconfigured}</Notice>}
        <div className="grid gap-4">
          <label className={fieldLabel}>Subject<Input aria-label="Reply subject" value={subject} maxLength={subjectLimit} disabled={busy || enabled === false} className="h-10 bg-card text-sm" onInput={event => setSubject(event.currentTarget.value)} onChange={() => {}} /></label>
          <label className={fieldLabel}>Message<Textarea aria-label="Reply message" aria-describedby="enquiry-reply-count" value={body} maxLength={bodyLimit} rows={8} disabled={busy || enabled === false} className="min-h-40 bg-card text-sm leading-relaxed" onInput={event => setBody(event.currentTarget.value)} onChange={() => {}} /></label>
          <p id="enquiry-reply-count" className="-mt-2 justify-self-end text-2xs text-muted-foreground tabular-nums">{body.length}/{bodyLimit}</p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!ready} aria-busy={busy} onClick={() => void send()}>{busy ? "Sending reply…" : "Send reply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Subsection>;
}
