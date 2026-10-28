import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Advisory-lock class for CRM contact keys. The two-argument form lives in a separate (int4, int4)
 * keyspace from the single-argument bigint locks used by the catalogue and Keeri sync, so the
 * class id cannot collide with them. Lock order everywhere: email key first, then phone key, and
 * always before any row lock.
 */
export const crmLockClass = 7701;
export async function lockContactKeys(tx: Prisma.TransactionClient, email: string | null, phone: string | null) {
  if (email) await tx.$queryRaw`SELECT pg_advisory_xact_lock(${crmLockClass}::int, hashtext(${"email:" + email}))::text`;
  if (phone) await tx.$queryRaw`SELECT pg_advisory_xact_lock(${crmLockClass}::int, hashtext(${"phone:" + phone}))::text`;
}

/** Lower-cased, trimmed email: the only contact key. */
export const emailKey = (raw: string) => raw.trim().toLowerCase();

/**
 * Normalised phone for display and search; never a linking key, because the customer typed it and
 * nobody verified it. Digits only; a 10-digit Indian number gains the 91 country code and a leading
 * trunk 0 on an 11-digit number is replaced by 91. Returns null for anything that is not a plausible
 * mobile number: fewer than 10 significant digits, a single repeated digit, or a counting sequence.
 * Mirrors the SQL function `shopmaple_phone_key` used by the backfill.
 */
export function phoneKey(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 10) digits = "91" + digits;
  else if (digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
  const national = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (national.length < 10) return null;
  if (/^(\d)\1+$/.test(national)) return null;
  if (national === "1234567890" || national === "0123456789") return null;
  return digits;
}

/**
 * Find or create the contact for an incoming enquiry inside the caller's transaction.
 * Linking is by email key only: an unverified phone must never attach a stranger's enquiry to an
 * existing contact. The enquiry contract always supplies an email, so a missing email is an error
 * rather than a reason to fall back to the phone.
 */
export async function ensureContact(tx: Prisma.TransactionClient, input: { name: string; email: string; phone: string }) {
  const email = emailKey(input.email), phone = phoneKey(input.phone);
  if (!email) throw new Error("A contact needs an email address");
  await lockContactKeys(tx, email, phone);
  const existing = await tx.contact.findUnique({ where: { emailKey: email }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.contact.create({ data: { id: "ct_" + randomUUID(), emailKey: email, phoneKey: phone, name: input.name, email, phone: input.phone }, select: { id: true } });
  return created.id;
}
