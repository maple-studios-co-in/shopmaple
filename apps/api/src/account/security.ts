import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { CookieOptions } from "express";
import { accountCookieName, accountSessionDays, signInCodeTtlMinutes } from "@shopmaple/contracts/account";
import { networkKey } from "../network.js";

/**
 * Customer sign-in secrets and limits (owner's spec, 10 Nov 2026; security review, 11 Nov). Codes and networks are
 * stored only as HMAC-SHA256 keyed by ACCOUNT_CODE_SECRET, so a copy of the database alone cannot recover a live code or
 * a shopper's address; sessions and sign-in cookies keep only the SHA-256 of 32 random bytes.
 */

/**
 * Codes emailed: 3 per email from one network in 15 minutes, 10 per email a day, 10 per network an hour, 300 for the
 * whole store an hour. Failed tries: 20 per network an hour, and 10 per email a day across all its codes. Counted in the
 * database (networks as IPv4 addresses or IPv6 /64s), so they hold across processes and restarts.
 */
export const signInLimits = {
  emailNetwork15m: 3, emailDay: 10, networkHour: 10, storeHour: 300,
  failedNetworkHour: 20, failedEmailDay: 10,
} as const;
export type SignInCounts = { emailNetwork15m: number; emailDay: number; networkHour: number; storeHour: number };

/** Six digits from crypto.randomInt, zero-padded: every code from 000000 to 999999 is equally likely. */
export function generateSignInCode(random: (min: number, max: number) => number = randomInt) {
  return String(random(0, 1_000_000)).padStart(6, "0");
}

/** The stored form of a code, bound to its challenge and email so one hash is useless for any other sign-in. */
export function hashSignInCode(secret: string, challengeId: string, emailKey: string, code: string) {
  return createHmac("sha256", secret).update(`sign-in-code\u0000${challengeId}\u0000${emailKey}\u0000${code}`).digest("hex");
}

/** Constant-time comparison of two stored-form hashes; anything malformed is simply unequal. */
export function sameCodeHash(stored: string, candidate: string) {
  if (!/^[a-f0-9]{64}$/.test(stored) || !/^[a-f0-9]{64}$/.test(candidate)) return false;
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(candidate, "hex"));
}

/** The requesting network (IPv4 /32 or IPv6 /64, see network.ts) for the per-network limits. Keyed, because the IPv4
 * space is small enough to reverse a plain hash. */
export function hashNetwork(secret: string, address: string) {
  return createHmac("sha256", secret).update(`sign-in-network\u0000${networkKey(address)}`).digest("hex");
}

export const newSessionToken = () => randomBytes(32).toString("hex");
export const sessionTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Where each limit's window starts (the store-wide and per-network ones share the hour). */
export function signInLimitWindows(now: Date) {
  return {
    email15m: new Date(now.getTime() - 15 * 60_000),
    emailDay: new Date(now.getTime() - 24 * 60 * 60_000),
    networkHour: new Date(now.getTime() - 60 * 60_000),
  };
}
/** Which limit stops a new code, or null when one may be sent. "store" is the cap staff are alerted to. */
export function signInLimitHit(counts: SignInCounts): "store" | "network" | "email" | null {
  if (counts.storeHour >= signInLimits.storeHour) return "store";
  if (counts.networkHour >= signInLimits.networkHour) return "network";
  if (counts.emailNetwork15m >= signInLimits.emailNetwork15m || counts.emailDay >= signInLimits.emailDay) return "email";
  return null;
}

/**
 * Whether a verify is refused before its code is looked at: a network that failed 20 times in the hour, or, once an
 * email has failed 10 times in a day, a code that has already had a try. A code nobody has tried still gets one try,
 * so outsiders who spend an email's budget on their own codes cannot lock out the customer's.
 */
export function verifyRefusal(counts: { networkFailures: number; emailFailures: number; codeTried: boolean }): "network" | "email" | null {
  if (counts.networkFailures >= signInLimits.failedNetworkHour) return "network";
  if (counts.emailFailures >= signInLimits.failedEmailDay && counts.codeTried) return "email";
  return null;
}

const sessionLifetimeMs = accountSessionDays * 24 * 60 * 60_000;
const baseCookie = (secure: boolean): CookieOptions => ({ httpOnly: true, secure, sameSite: "lax", path: "/" });
/** `__Host-maple_account` (production) or `maple_account` (development): HttpOnly, Secure in production, Lax, root path, 30 days. */
export function sessionCookie(token: string, secure: boolean) {
  return { name: accountCookieName(secure), value: token, options: { ...baseCookie(secure), maxAge: sessionLifetimeMs } };
}
export function clearSessionCookie(secure: boolean) {
  return { name: accountCookieName(secure), options: baseCookie(secure) };
}
export { sessionLifetimeMs };

/** One well-formed 64-hex token from exactly one cookie of this name; none, a malformed one or two are null. */
function readToken(cookieHeader: string | undefined, name: string) {
  const prefix = name + "=";
  const values = (cookieHeader ?? "").split(";").map((value) => value.trim()).filter((value) => value.startsWith(prefix));
  if (values.length !== 1) return null;
  const token = values[0]!.slice(prefix.length);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

/** The session token from exactly one well-formed cookie of this environment's name. Production never falls back to the
 * unprefixed name, which a sibling domain could set; two cookies of the name are ambiguous and fail closed. */
export function readSessionToken(cookieHeader: string | undefined, secure: boolean) {
  return readToken(cookieHeader, accountCookieName(secure));
}

/**
 * The sign-in cookie: a random value set by sign-in start, stored only as a hash on the code it was issued with. Verify
 * looks a code up by email AND this cookie, so only the browser that asked can try the code, and a start from another
 * browser cannot void it. `__Host-maple_signin` in production, `maple_signin` in development; HttpOnly, Lax, root path,
 * ten minutes (a code's life). Cleared by a successful verify.
 */
export const signInCookieName = (secure: boolean) => (secure ? "__Host-maple_signin" : "maple_signin");
export const newSignInNonce = () => randomBytes(32).toString("hex");
export const signInNonceHash = (nonce: string) => createHash("sha256").update(`sign-in-nonce\u0000${nonce}`).digest("hex");
export function signInNonceCookie(nonce: string, secure: boolean) {
  return { name: signInCookieName(secure), value: nonce, options: { ...baseCookie(secure), maxAge: signInCodeTtlMinutes * 60_000 } };
}
export function clearSignInNonceCookie(secure: boolean) {
  return { name: signInCookieName(secure), options: baseCookie(secure) };
}
export function readSignInNonce(cookieHeader: string | undefined, secure: boolean) {
  return readToken(cookieHeader, signInCookieName(secure));
}

/**
 * Passwords (Figma 392:1652 and 392:1697): scrypt with a random 16-byte salt each, stored as
 * `scrypt$<log2 N>$<r>$<p>$<salt>$<key>` (base64url) so the cost can rise later without breaking older hashes. N = 2^15,
 * r = 8, p = 3 is one of OWASP's equivalent scrypt settings (32 MiB at a time). The text is NFC-normalised first, so a
 * password typed on another keyboard still matches.
 */
const passwordCost = { logN: 15, r: 8, p: 3 } as const;
const passwordKeyBytes = 32;
const storedPassword = /^scrypt\$(1[0-9]|20)\$([1-9][0-9]?)\$([1-9])\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;
function scryptKey(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** logN;
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, passwordKeyBytes, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}
export async function hashPassword(password: string): Promise<string> {
  const { logN, r, p } = passwordCost;
  const salt = randomBytes(16);
  const key = await scryptKey(password, salt, logN, r, p);
  return ["scrypt", logN, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}
// A full-cost hash of a random secret, checked when there is no account or no password, so that answer takes as long as
// a wrong password and the timing cannot tell which emails have accounts.
let decoy: Promise<string> | null = null;
/** Whether `password` matches the stored hash; a missing or malformed hash is never a match (after the same work). */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const match = stored ? storedPassword.exec(stored) : null;
  if (!match) {
    decoy ??= hashPassword(randomBytes(32).toString("hex"));
    const decoyMatch = storedPassword.exec(await decoy);
    if (decoyMatch) await scryptKey(password, Buffer.from(decoyMatch[4]!, "base64url"), Number(decoyMatch[1]), Number(decoyMatch[2]), Number(decoyMatch[3]));
    return false;
  }
  const [, logN, r, p, salt, key] = match;
  const expected = Buffer.from(key!, "base64url");
  const actual = await scryptKey(password, Buffer.from(salt!, "base64url"), Number(logN), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** For logs: first letter and domain only. */
export function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  return at < 1 ? "***" : `${email[0]}***${email.slice(at)}`;
}
