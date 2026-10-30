"use client";
import { useEffect, useState } from "react";
import { enquiryAdminDetailSchema, type EnquiryAdminDetail } from "@shopmaple/contracts";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionButton, Subsection, useLatest, useWrite } from "./kit";
import { isDenied, type CrmViewProps } from "./crm-tasks";
import { Notice, writeOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

/** emailEnabled comes from the notification panel: false refuses sends up front, null means unknown (the server decides). */
export type EnquiryPanelProps = Pick<CrmViewProps, "session" | "onDenied"> & {
  detail: EnquiryAdminDetail; emailEnabled?: boolean | null; onChange: (value: EnquiryAdminDetail) => void; onBusy: (busy: boolean) => void;
};
const bodyLimit = 5000, subjectLimit = 150;
const unconfigured = "Email replies are not configured on this server. Contact the customer by phone or from your own mailbox.";
const refusals: Record<number, string> = { 409: "This enquiry changed. Reload the enquiry before sending again. Your draft is kept.", 429: "You have sent many replies recently. Wait a while before sending more.",
  502: "The email provider did not accept the reply. It was recorded as failed in activity; check there before trying again.", 503: unconfigured };
const fieldLabel = "grid gap-1.5 text-xs font-medium text-foreground";

export function EnquiryReply({ detail, session, emailEnabled = null, onChange, onDenied, onBusy }: EnquiryPanelProps) {
  const request = useAdminRequest(), callbacks = useLatest({ onChange, onDenied });
  const [refused, setRefused] = useState(false), [denied, setDenied] = useState(false), [stale, setStale] = useState(false);
  const [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const enabled = refused ? false : emailEnabled;
  const { busy, error, setError, notice, setNotice, active, run } = useWrite(onBusy), locked = busy || enabled === false;
  // A newer enquiry version from elsewhere clears a stale marker so the draft can be sent again.
  useEffect(() => { setStale(false); }, [detail.version]);
  const ready = enabled !== false && !denied && !stale && !busy && subject.trim().length > 0 && body.trim().length > 0
    && subject.length <= subjectLimit && body.length <= bodyLimit;
  const send = () => ready && run(async () => {
    const payload = { expectedVersion: detail.version, subject: subject.trim(), body: body.trim() };
    const response = await request(`/api/admin/enquiries/${encodeURIComponent(detail.id)}/reply`, writeOptions(session.csrfToken, payload));
    if (!active.current) return;
    if (isDenied(response.status)) { setDenied(true); setSubject(""); setBody(""); callbacks.current.onDenied(response.status); return; }
    const refusal = refusals[response.status];
    if (refusal) { setStale(response.status === 409); setRefused(current => current || response.status === 503); setError(refusal); return; }
    if (!response.ok) throw Error("send");
    const value = enquiryAdminDetailSchema.parse(await response.json());
    if (!active.current) return;
    if (value.id !== detail.id) throw Error("Wrong enquiry");
    callbacks.current.onChange(value); setSubject(""); setBody(""); setOpen(false); setNotice("Reply sent to the customer and recorded in activity.");
  }, timedOut => timedOut ? "The reply request timed out. Your draft is kept; check activity before sending again so the customer is not emailed twice." : "We couldn't send the reply. Your draft is kept; reload the enquiry and check activity before trying again.");
  if (denied) return <Subsection title="Reply by email" aria-label="Reply by email"><Notice tone="info">Replies are unavailable for this account.</Notice></Subsection>;
  const recipient = <strong className="font-semibold text-foreground">{detail.email}</strong>;
  return <Subsection title="Reply by email" aria-label="Reply by email" aria-busy={busy}
    description={<>Plain text goes to {recipient} from the shop&apos;s configured sender. The full message is kept in activity.</>}
    actions={<ActionButton icon={Mail} disabled={busy} onClick={() => setOpen(true)}>Reply</ActionButton>}>
    {enabled === false && <Notice tone="info">{unconfigured}</Notice>}
    {!open && error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent className="gap-5 bg-card sm:max-w-xl" aria-busy={busy}>
        <DialogHeader><DialogTitle className="text-lg">Reply to {detail.name || "the customer"}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed [overflow-wrap:anywhere]">Plain text goes to {recipient}. The full message is kept in activity.</DialogDescription>
        </DialogHeader>
        {enabled === false && <Notice tone="info">{unconfigured}</Notice>}
        <div className="grid gap-4">
          <label className={fieldLabel}>Subject<Input aria-label="Reply subject" value={subject} maxLength={subjectLimit} disabled={locked} className="h-10 bg-card text-sm"
            onInput={event => setSubject(event.currentTarget.value)} onChange={() => {}} /></label>
          <label className={fieldLabel}>Message<Textarea aria-label="Reply message" aria-describedby="enquiry-reply-count" value={body} maxLength={bodyLimit} rows={8}
            disabled={locked} className="min-h-40 bg-card text-sm leading-relaxed" onInput={event => setBody(event.currentTarget.value)} onChange={() => {}} /></label>
          <p id="enquiry-reply-count" className="-mt-2 justify-self-end text-2xs text-muted-foreground tabular-nums">{body.length}/{bodyLimit}</p></div>
        {error && <Notice tone="error">{error}</Notice>}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!ready} aria-busy={busy} onClick={() => void send()}>{busy ? "Sending reply…" : "Send reply"}</Button></DialogFooter>
      </DialogContent></Dialog>
  </Subsection>;
}
