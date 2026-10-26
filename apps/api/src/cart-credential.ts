import type { Request } from "express";

export const cartCookieName = (secure: boolean) => secure ? "__Host-maple_cart" : "maple_cart";

/** Never fall back to the legacy name in production: a sibling domain can set
 * that cookie with a known valid token. Ambiguous selected credentials also
 * fail closed. The host prefix is enforced by browsers on the emitted cookie. */
export function guestCartToken(req: Request, secure: boolean): string | undefined {
  const prefix = cartCookieName(secure) + "=";
  const values = (req.headers.cookie ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(prefix));
  if (values.length !== 1) return undefined;
  const value = values[0]!.slice(prefix.length);
  return /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
