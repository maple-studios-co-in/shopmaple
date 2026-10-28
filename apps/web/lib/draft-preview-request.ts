import "server-only";
import { headers } from "next/headers";
import { readDraftPreview, type DraftPreviewResult } from "@/lib/content";
import { resolveStorefrontPath, type StorefrontPath } from "@/components/storefront/storefront-page";

export type PreviewRequest =
  | { ok: true; token: string; version: number; content: Extract<DraftPreviewResult, { ok: true }>["content"]; path: StorefrontPath | null; segments: string[] }
  | { ok: false; reason: Extract<DraftPreviewResult, { ok: false }>["reason"] };

/** Resolve the token and staff cookie of a preview request into the draft and the chosen page. */
export async function loadPreviewRequest(params: Promise<{ path?: string[] }>, searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<PreviewRequest> {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.token === "string" ? query.token : "";
  const cookie = (await headers()).get("cookie");
  const result = await readDraftPreview(token, cookie);
  if (!result.ok) return result;
  const segments = (path ?? []).filter((part) => typeof part === "string");
  return { ok: true, token, version: result.version, content: result.content, path: resolveStorefrontPath(segments, result.content, { draft: true }), segments };
}

export const previewMessages: Record<Extract<PreviewRequest, { ok: false }>["reason"], string> = {
  unauthenticated: "Sign in to the shop admin in this browser, then open Preview draft again.",
  invalid: "This preview link has expired or is not valid for your session. Open Preview draft again from the admin.",
  stale: "The draft changed after this preview link was created. Open Preview draft again from the admin.",
  unavailable: "The draft preview is temporarily unavailable. Please try again.",
};
