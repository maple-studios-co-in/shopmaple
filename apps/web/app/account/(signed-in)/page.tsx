import { redirect } from "next/navigation";
import { AccountUnavailable } from "@/components/account/account-entry";
import { AccountFrame } from "@/components/account/account-frame";
import { AccountOverviewView } from "@/components/account/account-overview";
import { AccountProblem } from "@/components/account/account-parts";
import { authHref, safeNextPath } from "@/lib/account/next-path";
import { accountPreview, emptyOverview, sampleOverview } from "@/lib/account/preview";
import { requestAccountCookie } from "@/lib/account/request";
import { readAccountsEnabled, readOverview } from "@/lib/account/server";

// Per customer and per request: never cached, never indexed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Your account", robots: { index: false, follow: false } };

/**
 * /account (owner's spec, 10–11 Nov 2026): today's not-available page while the API reports accounts switched off; else
 * the overview (Figma 392:1255) when signed in, and the sign-in page (392:1652) when not. `?next=` (a path on this site
 * only) is passed on to it, as older links such as `/account?next=/checkout` ask.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = safeNextPath(query.next);
  const preview = accountPreview(query);
  if (preview === "unavailable") return <AccountUnavailable />;
  if (preview === "sign-in") redirect(authHref("login", next, true));
  if (preview) {
    const overview = preview === "empty" ? emptyOverview : sampleOverview;
    return (
      <AccountFrame active="overview" name={overview.customer.name} preview>
        <AccountOverviewView overview={overview} preview />
      </AccountFrame>
    );
  }
  if (!(await readAccountsEnabled())) return <AccountUnavailable />;
  const account = await readOverview(await requestAccountCookie());
  if (account.kind === "off") return <AccountUnavailable />;
  if (account.kind === "signed-out") redirect(authHref("login", next));
  if (account.kind !== "ok") return <AccountProblem retry="/account" />;
  if (next !== "/account") redirect(next);
  return (
    <AccountFrame active="overview" name={account.data.customer.name}>
      <AccountOverviewView overview={account.data} />
    </AccountFrame>
  );
}
