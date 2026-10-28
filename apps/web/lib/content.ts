import "server-only";
import { cache } from "react";
import { z } from "zod";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "./content-defaults";
const publishedSchema = z
  .object({
    version: z.number().int().min(1),
    content: storefrontContentSchema,
  })
  .strict();
export async function readPublishedContent(transport: typeof fetch = fetch) {
  try {
    const response = await transport(
      (process.env.API_URL ?? "http://127.0.0.1:4100") +
        "/api/content/storefront",
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (response.ok) {
      const result = publishedSchema.safeParse(await response.json());
      if (result.success) return { ...result.data.content, campaignsAvailable: true };
    } else if (response.status === 404) {
      const error = await response.json();
      if (error?.code === "CONTENT_NOT_PUBLISHED")
        return { ...structuredClone(defaultStorefrontContent), campaignsAvailable: true };
    }
  } catch {
    /* Original bundled public content remains available during an outage. */
  }
  return { ...structuredClone(defaultStorefrontContent), campaignsAvailable: false };
}
export const getPublishedContent = cache(() => readPublishedContent());
/** Published content plus the campaign availability flag the renderer needs. */
export type StorefrontContentView = Awaited<ReturnType<typeof readPublishedContent>>;
const draftSchema = z
  .object({ version: z.number().int().min(1), content: storefrontContentSchema })
  .strict();
export type DraftPreviewResult =
  | { ok: true; version: number; content: StorefrontContentView }
  | { ok: false; reason: "unauthenticated" | "invalid" | "stale" | "unavailable" };
/**
 * Read the current draft for a staff preview. The browser's staff cookie is
 * forwarded to the API together with the signed preview token; there is no
 * fallback to published or bundled content because a preview must never
 * silently show something other than the draft.
 */
export async function readDraftPreview(
  token: string,
  cookie: string | null,
  transport: typeof fetch = fetch,
): Promise<DraftPreviewResult> {
  if (!token || token.length > 4000 || !cookie) return { ok: false, reason: token && !cookie ? "unauthenticated" : "invalid" };
  try {
    const response = await transport(
      (process.env.API_URL ?? "http://127.0.0.1:4100") +
        "/api/admin/content/preview?token=" +
        encodeURIComponent(token),
      { cache: "no-store", headers: { cookie }, signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) {
      const result = draftSchema.safeParse(await response.json());
      if (result.success) return { ok: true, version: result.data.version, content: { ...result.data.content, campaignsAvailable: true } };
      return { ok: false, reason: "unavailable" };
    }
    if (response.status === 401) return { ok: false, reason: "unauthenticated" };
    if (response.status === 403 || response.status === 400) return { ok: false, reason: "invalid" };
    if (response.status === 409) return { ok: false, reason: "stale" };
  } catch {
    /* Treated as unavailable below. */
  }
  return { ok: false, reason: "unavailable" };
}
