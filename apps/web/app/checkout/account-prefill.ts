import "server-only";
import { requestAccountCookie } from "@/lib/account/request";
import { readOverview } from "@/lib/account/server";
import type { CheckoutAccount } from "./checkout-client";

/**
 * Who is checking out, when customer accounts are on: a signed-in customer's email, name, phone and default address
 * fill the form (owner's spec, 10 Nov 2026). No session cookie, no lookup; a session the API no longer knows, or any
 * failure, checks out as a guest.
 */
export async function readCheckoutAccount(accountsEnabled: boolean): Promise<CheckoutAccount> {
  if (!accountsEnabled) return { enabled: false, prefill: null };
  const cookie = await requestAccountCookie();
  if (!cookie) return { enabled: true, prefill: null };
  const account = await readOverview(cookie);
  if (account.kind !== "ok") return { enabled: true, prefill: null };
  const { customer, defaultAddress: address } = account.data;
  return {
    enabled: true,
    prefill: {
      email: customer.email,
      // The delivery fields hold the recipient: the default address's, else the customer's own.
      name: address?.name || customer.name || "",
      phone: address?.phone || customer.phone || "",
      address: address ? { line1: address.line1, line2: address.line2, city: address.city, stateCode: address.state, pincode: address.pin } : null,
    },
  };
}
