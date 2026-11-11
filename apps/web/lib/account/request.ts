import "server-only";
import { cookies } from "next/headers";
import { accountCookieHeader } from "./server";

/** This request's account session cookie, ready to forward to the API; "" when the browser has none. */
export async function requestAccountCookie() {
  const jar = await cookies();
  return accountCookieHeader(jar.getAll().map(({ name, value }) => `${name}=${value}`).join("; "));
}
