import retired from "@/data/retired-products.json";

/**
 * The store's products come from Keeri alone (owner, 11 Nov 2026). The products that existed only in the old Shopify
 * catalogue left the store; data/retired-products.json lists each one's address with the collection its old address
 * redirects to (next.config.ts) and, for those a curated list named, the Keeri product that takes its place: the same
 * design where Keeri has it, else a published piece of the same kind with photos.
 *
 * Server-only data: read by server components, never shipped to the browser.
 */
const replacements: Record<string, string> = retired.replacements;

/**
 * A curated list of product addresses with each retired one replaced by its Keeri product, once: a replacement the
 * list already names is not repeated, and a retired product without one is left out, so the section shows fewer.
 */
export function currentHandles(handles: readonly string[]): string[] {
  const result: string[] = [];
  for (const handle of handles) {
    const current = Object.hasOwn(retired.redirects, handle) ? replacements[handle] : handle;
    if (current && !result.includes(current)) result.push(current);
  }
  return result;
}

/** A retired product's Keeri replacement, or the address itself when it is not retired; null when it has none. */
export function currentHandle(handle: string): string | null {
  return Object.hasOwn(retired.redirects, handle) ? replacements[handle] ?? null : handle;
}
