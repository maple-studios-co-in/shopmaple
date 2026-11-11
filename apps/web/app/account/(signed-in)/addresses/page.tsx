import { AccountFrame } from "@/components/account/account-frame";
import { AccountHeading, AccountProblem } from "@/components/account/account-parts";
import { AddressBook } from "@/components/account/address-book";
import { requireAccount } from "@/lib/account/pages";
import { accountPreview, sampleAddresses, sampleOverview } from "@/lib/account/preview";
import { requestAccountCookie } from "@/lib/account/request";
import { readAddresses, readOverview } from "@/lib/account/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved addresses", robots: { index: false, follow: false } };
const heading = <AccountHeading title="Your addresses." lead="A familiar place for every delivery." />;

/** Saved delivery addresses (Figma 392:1527 "Saved Address"): add, edit, remove and choose the default, which checkout fills in. */
export default async function AccountAddressesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = accountPreview(await searchParams);
  if (preview)
    return (
      <AccountFrame active="addresses" name={preview === "empty" ? null : sampleOverview.customer.name} preview>
        {heading}
        <AddressBook initial={preview === "empty" ? [] : sampleAddresses} preview />
      </AccountFrame>
    );
  const cookie = await requestAccountCookie();
  const [account, addresses] = await Promise.all([readOverview(cookie), readAddresses(cookie)]);
  const overview = requireAccount(account, "/account/addresses");
  const saved = requireAccount(addresses, "/account/addresses");
  if (!overview || !saved) return <AccountProblem retry="/account/addresses" />;
  return (
    <AccountFrame active="addresses" name={overview.customer.name}>
      {heading}
      <AddressBook initial={saved} />
    </AccountFrame>
  );
}
