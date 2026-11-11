import type { z } from "zod";

/**
 * Nothing from Shopify stays on the store (owner, 11 Nov 2026): no product data, photos, page artwork or films. These
 * helpers recognise a Shopify media address and take it out of stored content that still names one.
 *
 * A Shopify media address is a file on Shopify's CDN (cdn.shopify.com), on a *.myshopify.com store, or under
 * shop.maplefurnishers.com/cdn/ (Shopify's file path on the old shop's domain), with or without a scheme, and the
 * /media/shopify/<name> copies an earlier release named. shop.maplefurnishers.com itself is the store's own new address,
 * so a page link to it is not media and stays.
 */
const shopifyHosted = /^(?:https?:)?\/\/(?:cdn\.shopify\.com|[a-z0-9-]+\.myshopify\.com|shop\.maplefurnishers\.com\/cdn)(?:[/?#]|$)/i;
export const isShopifyMedia = (value: unknown): value is string =>
  typeof value === "string" && (shopifyHosted.test(value.trim()) || value.trim().startsWith("/media/shopify/"));

type Path = (string | number)[];
const removed = Symbol("removed");

/** A copy of `value` without any string that is Shopify media (an object loses that key, a list that entry), and where. */
function strip(value: unknown, path: Path, gone: Path[]): unknown {
  if (isShopifyMedia(value)) {
    gone.push(path);
    return removed;
  }
  if (Array.isArray(value))
    return value.map((item, index) => strip(item, [...path, index], gone)).filter((item) => item !== removed);
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const kept = strip(item, [...path, key], gone);
      if (kept !== removed) copy[key] = kept;
    }
    return copy;
  }
  return value;
}

const related = (a: Path, b: Path) => a.slice(0, Math.min(a.length, b.length)).every((part, i) => String(part) === String(b[i]));

/** Removes the smallest piece around `path` that can go: its nearest list entry, else the property itself. */
function cut(root: unknown, path: Path): boolean {
  let index = -1;
  path.forEach((part, i) => { if (typeof part === "number") index = i; });
  const target = index >= 0 ? path.slice(0, index + 1) : path;
  if (!target.length) return false;
  let parent = root as Record<string | number, unknown> | unknown[];
  for (const part of target.slice(0, -1)) {
    parent = (parent as Record<string | number, unknown>)?.[part] as typeof parent;
    if (!parent || typeof parent !== "object") return false;
  }
  const last = target.at(-1)!;
  if (Array.isArray(parent) && typeof last === "number") parent.splice(last, 1);
  else if (Object.hasOwn(parent, last)) delete (parent as Record<string | number, unknown>)[last];
  else return false;
  return true;
}

/**
 * Stored content without Shopify media, still valid for `schema`. Each Shopify address is dropped; when that leaves an
 * entry incomplete (a hero slide without its film and poster, say) the entry goes too, and an emptied optional list is
 * left out, so the store falls back to its own default for that place. Only the places a Shopify address was in are
 * touched: content that names no Shopify media is returned exactly as it came, valid or not.
 */
export function withoutShopifyMedia(value: unknown, schema: z.ZodType): unknown {
  const gone: Path[] = [];
  const current = strip(value, [], gone);
  if (!gone.length) return value;
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = schema.safeParse(current);
    if (result.success) return current;
    const issue = result.error.issues.find((candidate) => gone.some((path) => related(path, candidate.path as Path)));
    if (!issue || !cut(current, issue.path as Path)) return current;
  }
  return current;
}
