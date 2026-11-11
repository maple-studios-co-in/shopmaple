import "server-only";
import { redirect } from "next/navigation";
import { authHref } from "./next-path";
import type { AccountRead } from "./server";

/**
 * What a signed-in account page needs from a read: the data, or the way out. Accounts switched off lead to /account
 * (today's not-available page); a visitor who is not signed in goes to sign in and comes back to `path`. An outage
 * returns null, for the page to say so.
 */
export function requireAccount<T>(read: AccountRead<T>, path: string): T | null {
  if (read.kind === "ok") return read.data;
  if (read.kind === "off") redirect("/account");
  if (read.kind === "signed-out") redirect(authHref("login", path));
  return null;
}
