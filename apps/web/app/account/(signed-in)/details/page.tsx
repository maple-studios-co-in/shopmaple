import { AccountFrame } from "@/components/account/account-frame";
import { AccountHeading, AccountProblem } from "@/components/account/account-parts";
import { AccountDetailsForm } from "@/components/account/account-details-form";
import { requireAccount } from "@/lib/account/pages";
import { accountPreview, emptyOverview, sampleOverview } from "@/lib/account/preview";
import { requestAccountCookie } from "@/lib/account/request";
import { readOverview } from "@/lib/account/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account details", robots: { index: false, follow: false } };
const heading = <AccountHeading title="Your details." lead="Keep your account up to date." />;

/** The customer's name and mobile number, the sign-in email shown read-only, and a password change (Figma 392:1585). */
export default async function AccountDetailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = accountPreview(await searchParams);
  if (preview) {
    const { customer } = preview === "empty" ? emptyOverview : sampleOverview;
    return (
      <AccountFrame active="details" name={customer.name} preview>
        {heading}
        <AccountDetailsForm customer={customer} preview />
      </AccountFrame>
    );
  }
  const overview = requireAccount(await readOverview(await requestAccountCookie()), "/account/details");
  if (!overview) return <AccountProblem retry="/account/details" />;
  return (
    <AccountFrame active="details" name={overview.customer.name}>
      {heading}
      <AccountDetailsForm customer={overview.customer} />
    </AccountFrame>
  );
}
