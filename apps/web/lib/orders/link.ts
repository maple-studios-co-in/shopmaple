import "server-only";
import { orderDetailSchema, orderTrackingSchema, type OrderDetail, type OrderTracking } from "@shopmaple/contracts/account";
import type { z } from "zod";

/**
 * The order behind a private link (`/orders/MF-<n>-<32 hex>`; owner, 14 Nov 2026), read from the API by this server.
 * The link itself is the only credential: no cookie is sent, and nothing is cached.
 */
export const orderLinkRef = /^MF-[1-9][0-9]{0,9}-[a-f0-9]{32}$/;
const api = () => process.env.API_URL ?? "http://127.0.0.1:4100";
export type LinkRead<T> = { kind: "ok"; data: T } | { kind: "missing" } | { kind: "error" };

async function read<T>(path: string, schema: z.ZodType<T>): Promise<LinkRead<T>> {
  try {
    const response = await fetch(api() + path, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "error" };
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
export const readOrderByLink = (ref: string): Promise<LinkRead<OrderDetail>> =>
  orderLinkRef.test(ref) ? read(`/api/orders/link/${ref}`, orderDetailSchema) : Promise.resolve({ kind: "missing" });
export const readTrackingByLink = (ref: string): Promise<LinkRead<OrderTracking>> =>
  orderLinkRef.test(ref) ? read(`/api/orders/link/${ref}/tracking`, orderTrackingSchema) : Promise.resolve({ kind: "missing" });
