import "server-only";
import { z } from "zod";
import { storefrontContentSchema } from "@shopmaple/contracts";
import type { StorefrontDocument } from "./content";

const uploadPattern = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/;
const imageKeys = new Set(["image", "mobileImage", "desktopImage", "src"]);
const staffCookieNames = new Set(["shop_admin", "__Host-shop_admin"]);
export const previewTokenPattern = /^[A-Za-z0-9_-]{1,400}\.[A-Za-z0-9_-]{43}$/;
const draftSchema = z.object({
  version: z.number().int().min(1),
  publishedVersion: z.number().int().min(0).nullable(),
  expiresAt: z.string().max(64).refine((value) => Number.isFinite(Date.parse(value))),
  content: storefrontContentSchema,
}).strict();

export type DraftPreview =
  | { ok: true; version: number; publishedVersion: number | null; expiresAt: string; content: StorefrontDocument }
  | { ok: false; status: number; code: string; message: string };

/**
 * Points library uploads at the staff-only media preview route so unpublished images
 * render for signed-in staff. Only image fields change; prose that mentions a path does not.
 */
export function previewMediaContent<T>(content: T): T {
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, name)]));
    }
    if (typeof value === "string" && key !== undefined && imageKeys.has(key)) {
      const match = uploadPattern.exec(value);
      if (match) return `/api/admin/media/${match[1]}/preview`;
    }
    return value;
  };
  return walk(content) as T;
}

/** Forwards only the staff session cookie from the browser's request to the API. */
export function staffCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => staffCookieNames.has(part.slice(0, part.indexOf("="))))
    .join("; ");
}

/** Reads the current draft for a staff preview token; the API enforces session, token and version checks. */
export async function readDraftPreview(token: string, cookieHeader: string, transport: typeof fetch = fetch): Promise<DraftPreview> {
  const unavailable = (status: number, code: string, message: string): DraftPreview => ({ ok: false, status, code, message });
  try {
    const response = await transport(
      `${process.env.API_URL ?? "http://127.0.0.1:4100"}/api/admin/content/preview?token=${encodeURIComponent(token)}`,
      { cache: "no-store", headers: { cookie: staffCookieHeader(cookieHeader) }, signal: AbortSignal.timeout(5000) },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body && typeof body === "object" ? (body as { code?: unknown; message?: unknown }) : {};
      return unavailable(
        response.status,
        typeof error.code === "string" ? error.code.slice(0, 64) : "PREVIEW_UNAVAILABLE",
        typeof error.message === "string" ? error.message.slice(0, 300) : "The draft preview is unavailable.",
      );
    }
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) return unavailable(502, "PREVIEW_INVALID_RESPONSE", "The draft preview could not be read.");
    return { ok: true, ...parsed.data, content: { ...parsed.data.content, campaignsAvailable: true } };
  } catch {
    return unavailable(503, "PREVIEW_UNREACHABLE", "The draft preview could not be loaded. Check that the API is running and try again.");
  }
}
