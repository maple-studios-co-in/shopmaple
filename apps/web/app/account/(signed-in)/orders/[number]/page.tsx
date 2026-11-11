import { notFound } from "next/navigation";
import { formatOrderNumber, parseOrderNumber } from "@shopmaple/contracts/account";
import { AccountFrame } from "@/components/account/account-frame";
import { AccountProblem } from "@/components/account/account-parts";
import { OrderDetailView } from "@/components/account/order-detail";
import { requireAccount } from "@/lib/account/pages";
import { accountPreview, sampleOrderDetail, sampleOverview } from "@/lib/account/preview";
import { requestAccountCookie } from "@/lib/account/request";
import { readOrder, readOverview } from "@/lib/account/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your order", robots: { index: false, follow: false } };

/**
 * One order (Figma 392:1432), by its number ("MF-10482" or "10482"), for the customer whose email placed it, on any
 * device. Anything else, another customer's order included, is the same plain not-found, so numbers cannot be probed.
 */
export default async function AccountOrderPage({ params, searchParams }: {
  params: Promise<{ number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sequence = parseOrderNumber((await params).number ?? "");
  if (sequence === null) notFound();
  const number = formatOrderNumber(sequence);
  if (accountPreview(await searchParams))
    return (
      <AccountFrame active="orders" subpage name={sampleOverview.customer.name} preview>
        <OrderDetailView order={sampleOrderDetail(number)} />
      </AccountFrame>
    );
  const cookie = await requestAccountCookie();
  const [account, order] = await Promise.all([readOverview(cookie), readOrder(cookie, sequence)]);
  if (order.kind === "missing") notFound();
  const path = `/account/orders/${number}`;
  const overview = requireAccount(account, path);
  const detail = requireAccount(order, path);
  if (!overview || !detail) return <AccountProblem retry={path} />;
  return (
    <AccountFrame active="orders" subpage name={overview.customer.name}>
      <OrderDetailView order={detail} />
    </AccountFrame>
  );
}
