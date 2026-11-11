import { AccountFrame } from "@/components/account/account-frame";
import { AccountHeading, AccountProblem } from "@/components/account/account-parts";
import { OrderHistory } from "@/components/account/order-history";
import { requireAccount } from "@/lib/account/pages";
import { accountPreview, sampleOrders, sampleOverview } from "@/lib/account/preview";
import { requestAccountCookie } from "@/lib/account/request";
import { readOrders, readOverview } from "@/lib/account/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your orders", robots: { index: false, follow: false } };
const heading = <AccountHeading title="Your orders." lead="Every piece. Every step. In one place." />;

/** The order list (Figma 392:1338): every paid order placed with the account's email, newest first. */
export default async function AccountOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = accountPreview(await searchParams);
  if (preview)
    return (
      <AccountFrame active="orders" name={preview === "empty" ? null : sampleOverview.customer.name} preview>
        {heading}
        <OrderHistory orders={preview === "empty" ? [] : sampleOrders} preview />
      </AccountFrame>
    );
  const cookie = await requestAccountCookie();
  const [account, orders] = await Promise.all([readOverview(cookie), readOrders(cookie)]);
  const overview = requireAccount(account, "/account/orders");
  const list = requireAccount(orders, "/account/orders");
  if (!overview || !list) return <AccountProblem retry="/account/orders" />;
  return (
    <AccountFrame active="orders" name={overview.customer.name}>
      {heading}
      <OrderHistory orders={list} />
    </AccountFrame>
  );
}
