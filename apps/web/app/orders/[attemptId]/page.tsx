import { notFound } from "next/navigation";
import { pageTitle } from "@/components/store/current-look";
import { OrderStatus } from "@/components/store/order-status";

// Private, per-browser order status: read through the guest cart cookie, never cached or indexed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Your order", robots: { index: false, follow: false } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function OrderPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  if (!uuid.test(attemptId)) notFound();
  return (
    <section data-store className="mx-auto min-h-[60vh] max-w-[820px] px-10 py-12 max-[1001px]:px-6 max-[1001px]:py-9 max-[701px]:px-4 max-[701px]:py-8">
      <h1 className={`${pageTitle} mb-8`}>Your order</h1>
      <OrderStatus attemptId={attemptId} />
    </section>
  );
}
