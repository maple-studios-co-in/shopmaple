import { notFound } from "next/navigation";
import { OrderTrackingView } from "@/components/orders/order-tracking";
import { orderLinkRef, readTrackingByLink } from "@/lib/orders/link";
import "@/styles/account.css";

// An order's tracking behind its private link (owner, 14 Nov 2026): from the order emails' "Track your order" and the
// dispatched WhatsApp message. Never cached or indexed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Track your order", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function OrderTrackingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!orderLinkRef.test(reference)) notFound();
  const tracking = await readTrackingByLink(reference);
  if (tracking.kind === "missing") notFound();
  return (
    <div className="account" data-store>
      <div className="account-main mx-auto max-w-[960px] px-10 py-12 max-[1001px]:px-6 max-[701px]:px-4">
        {tracking.kind === "ok" ? (
          <OrderTrackingView tracking={tracking.data} />
        ) : (
          <p className="account-muted">We couldn’t load your order’s tracking just now. Please refresh in a moment.</p>
        )}
      </div>
    </div>
  );
}
