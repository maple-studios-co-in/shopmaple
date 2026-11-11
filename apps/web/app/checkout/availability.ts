import "server-only";
import { z } from "zod";
import { checkoutOptionsSchema, type CheckoutOptions } from "./checkout-client";

const api = () => process.env.API_URL ?? "http://127.0.0.1:4100";
const healthSchema = z.object({ checkoutEnabled: z.boolean(), accountsEnabled: z.unknown().optional() });

/** Live checkout is a fact the API reports; the page never assumes it. Any
 * failure, malformed answer or missing option set renders the preview state.
 * The same answer says whether customer accounts are on; an unclear flag means
 * off, and never closes checkout. */
export async function readCheckoutAvailability(): Promise<{ options: CheckoutOptions; accountsEnabled: boolean } | null> {
  try {
    const health = await fetch(api() + "/api/health", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!health.ok) return null;
    const flag = healthSchema.safeParse(await health.json());
    if (!flag.success || flag.data.checkoutEnabled !== true) return null;
    const options = await fetch(api() + "/api/checkout/options", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!options.ok) return null;
    const parsed = checkoutOptionsSchema.safeParse(await options.json());
    return parsed.success ? { options: parsed.data, accountsEnabled: flag.data.accountsEnabled === true } : null;
  } catch {
    return null;
  }
}
