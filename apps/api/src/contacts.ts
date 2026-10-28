import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** Lower-cased, trimmed email: the primary contact key. */
export const emailKey = (raw: string) => raw.trim().toLowerCase();

/**
 * Digits only. A 10-digit Indian number gains the 91 country code and a leading trunk 0 on an
 * 11-digit number is replaced by 91, so "+91 98765 43210", "9876543210" and "09876543210" match.
 * Mirrors the SQL function `shopmaple_phone_key` used by the backfill migration.
 */
export function phoneKey(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return digits;
}

/**
 * Find or create the contact for an incoming enquiry inside the caller's transaction.
 * Email wins over phone; a transaction-scoped advisory lock serialises concurrent first contacts.
 */
export async function ensureContact(tx: Prisma.TransactionClient, input: { name: string; email: string; phone: string }) {
  const email = emailKey(input.email), phone = phoneKey(input.phone);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"contact:email:" + email}))::text`;
  if (phone) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"contact:phone:" + phone}))::text`;
  const byEmail = await tx.contact.findUnique({ where: { emailKey: email }, select: { id: true } });
  if (byEmail) return byEmail.id;
  if (phone) {
    const byPhone = await tx.contact.findUnique({ where: { phoneKey: phone }, select: { id: true } });
    if (byPhone) return byPhone.id;
  }
  const created = await tx.contact.create({ data: { id: "ct_" + randomUUID(), emailKey: email, phoneKey: phone, name: input.name, email, phone: input.phone }, select: { id: true } });
  return created.id;
}
