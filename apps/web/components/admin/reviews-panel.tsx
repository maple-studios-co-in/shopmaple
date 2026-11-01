"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquareQuote, PackageCheck } from "lucide-react";
import { adminReviewListSchema, adminReviewSchema, reviewOrderListSchema, reviewOrderSchema, type AdminReview, type ReviewOrder } from "@shopmaple/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import type { StaffSession } from "./dashboard";
import { EmptyState, Notice, Skeleton, formatDate, formatDateTime, readJson, writeOptions } from "./crm-primitives";
import { PanelHeader, TabBar, useLatest } from "./kit";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const views = [["pending", "To moderate"], ["approved", "Approved"], ["rejected", "Rejected"], ["orders", "Orders to invite"]] as const;
type View = (typeof views)[number][0];
const accessMessage = "Your account does not have access to customer reviews. Contact your administrator.";
const decided = { approved: "Approved. It now shows on the product page.", rejected: "Rejected. It won't show on the product page." } as const;
const emailLabels: Record<NonNullable<ReviewOrder["delivery"]>["email"], string> = {
  pending: "Review email queued", processing: "Review email sending", sent: "Review email sent",
  failed: "Review email failed: check the email settings", disabled: "Email is off: the review links are ready but not sent",
};
const empties: Record<View, string> = {
  pending: "No reviews are waiting. Buyers' reviews appear here after they use the link from their delivery email.",
  approved: "No approved reviews yet.", rejected: "No rejected reviews.",
  orders: "No confirmed online orders yet. Paid orders Keeri has confirmed appear here.",
};

/** Buyer reviews: approve or reject each before it shows, and mark confirmed orders delivered to invite reviews. */
export function ReviewsPanel({ session, onExpired }: { session: StaffSession; onExpired: () => void }) {
  const request = useAdminRequest();
  const [view, setView] = useState<View>("pending");
  const [reviews, setReviews] = useState<AdminReview[] | null>(null), [orders, setOrders] = useState<ReviewOrder[] | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const expired = useLatest(onExpired), active = useRef(true), sequence = useRef(0);

  function denied(code: 401 | 403) {
    if (code === 401) expired.current();
    else setError(accessMessage);
  }
  async function load(next: View) {
    const id = ++sequence.current;
    setBusy(true);
    const result = next === "orders"
      ? await readJson(request, "/api/admin/review-orders", reviewOrderListSchema, "Orders")
      : await readJson(request, `/api/admin/reviews?status=${next}`, adminReviewListSchema, "Reviews");
    if (!active.current || id !== sequence.current) return;
    setBusy(false);
    if (!result.ok) { if (result.denied) denied(result.denied); else setError(result.message); return; }
    if (next === "orders") setOrders((result.value as { items: ReviewOrder[] }).items);
    else setReviews((result.value as { items: AdminReview[] }).items);
  }
  useEffect(() => {
    active.current = true;
    void load(view);
    return () => { active.current = false; };
  }, [request, view]);

  /** One staff write; returns the parsed body, or null after reporting why it failed. */
  async function write<T>(path: string, body: object, parse: (value: unknown) => T): Promise<T | null> {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await request(path, writeOptions(session.csrfToken, body));
      if (!active.current) return null;
      if (response.status === 401 || response.status === 403) { denied(response.status); return null; }
      const json = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) { setError(json?.message ?? "That change didn't save. Try again."); return null; }
      return parse(json);
    } catch (failure) {
      setError(failure instanceof AdminRequestTimeout ? "Saving timed out. Reload and check before trying again." : "We couldn't connect. Check your connection and try again.");
      return null;
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function moderate(review: AdminReview, decision: "approved" | "rejected") {
    const saved = await write(`/api/admin/reviews/${encodeURIComponent(review.id)}/moderation`, { decision, expectedVersion: review.version, note: "" }, (v) => adminReviewSchema.parse(v));
    if (saved) {
      setReviews((items) => items?.filter((item) => item.id !== review.id) ?? null);
      setNotice(decided[decision]);
    } else void load(view);
  }
  async function markDelivered(order: ReviewOrder) {
    const saved = await write(`/api/admin/review-orders/${encodeURIComponent(order.attemptId)}/delivered`, {}, (v) => reviewOrderSchema.parse(v));
    if (saved) {
      setOrders((items) => items?.map((item) => (item.attemptId === saved.attemptId ? saved : item)) ?? null);
      setNotice(`Order ${saved.orderReference} marked delivered. The buyer is invited to review each piece.`);
    }
  }
  function select(next: View) {
    if (next === view) return;
    setError(""); setNotice("");
    setView(next);
  }

  const list = view === "orders" ? orders : reviews;
  return <div aria-busy={busy} className="grid min-w-0 gap-5">
    <PanelHeader className="mb-0" title="Reviews"
      description="Only buyers whose order was delivered can write a review, through the link we email them. Nothing shows on the product page until you approve it." />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <TabBar label="Review views" tabs={views} value={view} onSelect={select} disabled={busy} className="min-w-0 gap-5">
      {views.map(([key]) => <TabsContent key={key} value={key} className="grid min-w-0 gap-3">
        {key !== view ? null : busy && !list ? <Skeleton rows={3} variant="card" />
          : list && list.length === 0 ? <EmptyState title={key === "orders" ? "No orders" : "Nothing here"} icon={key === "orders" ? <PackageCheck strokeWidth={1.5} /> : <MessageSquareQuote strokeWidth={1.5} />}>{empties[key]}</EmptyState>
          : key === "orders" ? orders?.map((order) => <OrderRow key={order.attemptId} order={order} busy={busy} onDelivered={() => void markDelivered(order)} />)
          : reviews?.map((review) => <ReviewRow key={review.id} review={review} busy={busy} onDecide={(decision) => void moderate(review, decision)} />)}
      </TabsContent>)}
    </TabBar>
  </div>;
}

function ReviewRow({ review, busy, onDecide }: { review: AdminReview; busy: boolean; onDecide: (decision: "approved" | "rejected") => void }) {
  const who = review.city ? `${review.displayName}, ${review.city}` : review.displayName;
  return <article data-admin-review className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span role="img" aria-label={`Rated ${review.rating} out of 5`} className="text-base tracking-[0.12em] text-warning">{"★".repeat(review.rating)}<span className="text-muted-foreground/40">{"★".repeat(5 - review.rating)}</span></span>
      <span className="text-xs text-muted-foreground">{formatDateTime(review.createdAt)}</span>
    </div>
    <h3 className="m-0 text-base font-semibold">{review.title}</h3>
    <p className="m-0 max-w-[70ch] text-sm leading-relaxed whitespace-pre-line">{review.body}</p>
    <dl className="m-0 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
      <div><dt className="inline font-semibold">Shown as </dt><dd className="m-0 inline">{who}</dd></div>
      <div><dt className="inline font-semibold">Piece </dt><dd className="m-0 inline"><a href={`/products/${review.productHandle}`} target="_blank" rel="noopener noreferrer">{review.productTitle}{review.variantTitle ? `, ${review.variantTitle}` : ""}</a></dd></div>
      <div><dt className="inline font-semibold">Order </dt><dd className="m-0 inline">{review.orderReference}</dd></div>
    </dl>
    {review.audit.length > 0 && <ol aria-label="Decisions" className="m-0 grid gap-1 border-t border-line-soft pt-2 pl-0 text-xs text-muted-foreground">
      {review.audit.map((entry, index) => <li key={index} className="list-none">
        {entry.action === "approved" ? "Approved" : "Rejected"} by {entry.actorEmail} on {formatDate(entry.createdAt)}{entry.note ? `: ${entry.note}` : ""}
      </li>)}
    </ol>}
    <div className="flex flex-wrap gap-2">
      {review.status !== "approved" && <Button type="button" size="sm" disabled={busy} aria-label={`Approve review by ${review.displayName}`} onClick={() => onDecide("approved")}>Approve</Button>}
      {review.status !== "rejected" && <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Reject review by ${review.displayName}`} onClick={() => onDecide("rejected")}>{review.status === "approved" ? "Withdraw (reject)" : "Reject"}</Button>}
    </div>
  </article>;
}

function OrderRow({ order, busy, onDelivered }: { order: ReviewOrder; busy: boolean; onDelivered: () => void }) {
  const delivery = order.delivery;
  return <article data-review-order className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="grid gap-1">
      <p className="m-0 text-sm font-semibold">{order.orderReference} <span className="font-normal text-muted-foreground">· {order.customerName} · placed {formatDate(order.placedAt)}</span></p>
      <ul className="m-0 grid gap-0.5 pl-0 text-xs text-muted-foreground">
        {order.lines.map((line, index) => <li key={index} className="list-none">{line.title}{line.variantTitle ? `, ${line.variantTitle}` : ""}{line.reviewed ? " · reviewed" : ""}</li>)}
      </ul>
    </div>
    {delivery
      ? <div className="grid justify-items-start gap-1 sm:justify-items-end">
          <Badge variant="secondary" className="rounded-md border-0 bg-success-bg font-semibold text-success">Delivered {formatDate(delivery.deliveredAt)}{delivery.source === "keeri" ? " (Keeri)" : ""}</Badge>
          <span className="text-xs text-muted-foreground">{emailLabels[delivery.email]}</span>
        </div>
      : <Button type="button" size="sm" disabled={busy} aria-label={`Mark ${order.orderReference} delivered and invite review`} onClick={onDelivered}>Mark delivered and invite review</Button>}
  </article>;
}
