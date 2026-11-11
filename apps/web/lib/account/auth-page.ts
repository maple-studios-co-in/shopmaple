import "server-only";
import { redirect } from "next/navigation";
import { safeAuthNext } from "./next-path";
import { accountPreview } from "./preview";
import { requestAccountCookie } from "./request";
import { readAccountsEnabled, readOverview } from "./server";

type Query = Record<string, string | string[] | undefined>;

/**
 * What a sign-in page needs before it draws: where to go afterwards, and whether this is the local design preview (its
 * forms then answer in memory). With accounts switched off the account page explains; someone already signed in goes
 * straight on. Only a visitor with a session cookie costs an API read.
 */
export async function prepareAuthPage(searchParams: Promise<Query>): Promise<{ next: string; preview: boolean }> {
  const query = await searchParams;
  const next = safeAuthNext(query.next);
  if (accountPreview(query)) return { next, preview: true };
  if (!(await readAccountsEnabled())) redirect("/account");
  const cookie = await requestAccountCookie();
  if (cookie && (await readOverview(cookie)).kind === "ok") redirect(next);
  return { next, preview: false };
}
