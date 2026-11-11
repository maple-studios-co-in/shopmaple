import "server-only";
import { z } from "zod";
import {
  accountCookieName,
  accountOverviewResponseSchema,
  addressListResponseSchema,
  formatOrderNumber,
  orderDetailSchema,
  orderListResponseSchema,
  type AccountAddress,
  type AccountOverview,
  type OrderDetail,
  type OrderSummary,
} from "@shopmaple/contracts/account";

// The account pages read the API on the server, as the browser's customer: each request forwards only the account
// session cookie, never the cart, staff or any other cookie. Reads are never cached.
const api = () => process.env.API_URL ?? "http://127.0.0.1:4100";
const sessionCookies = new Set([accountCookieName(true), accountCookieName(false)]);

/** Keeps only the account session cookie (`__Host-maple_account` in production, `maple_account` in development). */
export function accountCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("=") && sessionCookies.has(part.slice(0, part.indexOf("="))))
    .join("; ");
}

/**
 * What a read found. `signed-out`: no valid session (401). `missing`: no such order or address for this customer (a 404
 * the API names). `off`: any other 404, which is what every account route answers while accounts are switched off.
 */
export type AccountRead<T> = { kind: "ok"; data: T } | { kind: "signed-out" } | { kind: "missing" } | { kind: "off" } | { kind: "error" };

async function errorCode(response: Response) {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : "";
  } catch {
    return "";
  }
}

async function read<T>(path: string, cookie: string, schema: z.ZodType<T>): Promise<AccountRead<T>> {
  // No session cookie, nothing to ask: these reads reach the API from this server's own address, which shares one rate
  // bucket for every visitor, so anonymous visits must not spend it (security review, 11 Nov 2026).
  if (!cookie) return { kind: "signed-out" };
  try {
    const response = await fetch(api() + "/api/account" + path, {
      cache: "no-store",
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) {
      const parsed = schema.safeParse(await response.json());
      return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "error" };
    }
    if (response.status === 401) return { kind: "signed-out" };
    if (response.status === 404) return ["ORDER_NOT_FOUND", "ADDRESS_NOT_FOUND"].includes(await errorCode(response)) ? { kind: "missing" } : { kind: "off" };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

const healthSchema = z.object({ accountsEnabled: z.boolean().optional() });
/** Accounts are a fact the API reports (`/api/health` → `accountsEnabled`); a failed or unclear answer means off. */
export async function readAccountsEnabled(): Promise<boolean> {
  try {
    const response = await fetch(api() + "/api/health", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return false;
    const parsed = healthSchema.safeParse(await response.json());
    return parsed.success && parsed.data.accountsEnabled === true;
  } catch {
    return false;
  }
}

const unwrap = <T, V>(result: AccountRead<T>, pick: (data: T) => V): AccountRead<V> =>
  result.kind === "ok" ? { kind: "ok", data: pick(result.data) } : result;

export const readOverview = (cookie: string) => read<AccountOverview>("", cookie, accountOverviewResponseSchema);
export const readOrders = async (cookie: string): Promise<AccountRead<OrderSummary[]>> =>
  unwrap(await read("/orders", cookie, orderListResponseSchema), (data) => data.orders);
export const readOrder = (cookie: string, sequence: number) => read<OrderDetail>(`/orders/${formatOrderNumber(sequence)}`, cookie, orderDetailSchema);
export const readAddresses = async (cookie: string): Promise<AccountRead<AccountAddress[]>> =>
  unwrap(await read("/addresses", cookie, addressListResponseSchema), (data) => data.addresses);
