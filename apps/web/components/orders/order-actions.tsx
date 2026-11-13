"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrderDetail } from "@shopmaple/contracts/account";
import { formatDate } from "@/lib/account/format";

/** The reasons a buyer picks from; the words go to Keeri for staff as chosen, with anything the buyer adds. */
const reasons = ["Ordered by mistake", "Found a better price", "Delivery takes too long", "Want a different colour or size", "Something else"];
const failed = "We couldn’t send your request just now. Please try again in a moment.";

/** The order's private link reference, from its page's path ("/orders/MF-10482-<hex>"). */
const refOf = (order: OrderDetail) => order.links?.view.replace(/^\/orders\//, "") ?? null;

/**
 * Under an order behind a private link (and in the account with links on): Track your order, and Cancel while Keeri can
 * still accept a request (the order is confirmed and not yet being made). A request is staff's to decide in Keeri; the
 * page says so, and when they decline it shows their note to the buyer.
 */
export function OrderActions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]!);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<OrderDetail["cancelRequest"]>(null);
  const ref = refOf(order);
  const request = sent ?? order.cancelRequest ?? null;
  if (!order.links && !request) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ref || busy) return;
    setBusy(true); setError("");
    try {
      const words = note.trim() ? `${reason}: ${note.trim()}` : reason;
      const response = await fetch(`/api/orders/link/${ref}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: words.slice(0, 500) }),
      });
      const body = (await response.json().catch(() => null)) as (Partial<OrderDetail> & { message?: string }) | null;
      if (!response.ok) { setError(body?.message ?? failed); return; }
      setSent(body?.cancelRequest ?? { status: "requested", requestedAt: new Date().toISOString() });
      setOpen(false);
      router.refresh();
    } catch {
      setError(failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-panel" data-order-actions="" aria-label="Order actions">
      {order.links ? (
        <p className="account-muted">
          <Link className="account-text-link" href={order.links.tracking}>Track your order</Link>
        </p>
      ) : null}
      {request?.status === "requested" ? (
        <p className="account-muted" data-cancel-request="requested">
          {sent ? "We’ve asked our team to cancel this order. " : ""}
          {`Cancellation requested on ${formatDate(request.requestedAt)}. Our team will confirm, and refund in full to your original payment method.`}
        </p>
      ) : request?.status === "declined" ? (
        <p className="account-muted" data-cancel-request="declined">
          {request.note
            ? <>Our team couldn’t cancel this order: “{request.note}” Please contact us if you have any questions.</>
            : "Our team couldn’t cancel this order, as it is already being prepared. Please contact us and we’ll help."}
        </p>
      ) : null}
      {order.canCancel && !request && !open ? (
        <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" onClick={() => setOpen(true)}>Cancel order</button>
      ) : null}
      {order.canCancel && !request && open ? (
        <form className="account-form" onSubmit={(event) => void submit(event)} noValidate>
          <label className="account-label">
            Why would you like to cancel?
            <select name="reason" className="account-input" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)}>
              {reasons.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="account-label">
            Anything else we should know? (optional)
            <textarea name="note" className="account-input" rows={3} maxLength={400} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
          </label>
          <p className="account-fineprint">Our team confirms each cancellation and refunds in full to your original payment method.</p>
          <div className="account-buttons">
            <button type="submit" className="account-cta" disabled={busy}>{busy ? "Sending…" : "Request cancellation"}</button>
            <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" disabled={busy} onClick={() => setOpen(false)}>Keep my order</button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="account-field-error">{error}</p> : null}
    </section>
  );
}
