import { notFound } from "next/navigation";
import { pageTitle } from "@/components/store/current-look";
import { OrderStatus } from "@/components/store/order-status";
import { OrderDetailView } from "@/components/account/order-detail";
import { orderLinkRef, readOrderByLink } from "@/lib/orders/link";
import "@/styles/account.css";

// Private, never cached or indexed: a checkout's status page (read through the guest cart cookie), or an order behind its
// private link (`MF-<n>-<32 hex>`, from the order emails and WhatsApp), which needs no account.
export const dynamic = "force-dynamic";
export const metadata = { title: "Your order", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (uuid.test(reference))
    return (
      <section data-store className="mx-auto min-h-[60vh] max-w-[820px] px-10 font-text py-12 max-[1001px]:px-6 max-[1001px]:py-9 max-[701px]:px-4 max-[701px]:py-8">
        <h1 className={`${pageTitle} mb-8`}>Your order</h1>
        <OrderStatus attemptId={reference} />
      </section>
    );
  if (!orderLinkRef.test(reference)) notFound();
  const order = await readOrderByLink(reference);
  if (order.kind === "missing") notFound();
  return (
    <div className="account" data-store>
      <div className="account-main mx-auto max-w-[960px] px-10 py-12 max-[1001px]:px-6 max-[701px]:px-4">
        {order.kind === "ok" ? (
          <OrderDetailView order={order.data} />
        ) : (
          <p className="account-muted">We couldn’t load your order just now. Please refresh in a moment.</p>
        )}
      </div>
    </div>
  );
}
