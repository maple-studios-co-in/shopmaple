"use client";
import { useSyncExternalStore } from "react";
import { defaultMediaUploadRules, mediaUploadRulesSchema, type MediaUploadRules } from "@shopmaple/contracts/media-upload-rules";

/**
 * The media library's upload rules (Settings, Banner sizes; owner, 23 Nov 2026), read once per admin visit and shared by
 * every upload control, so a picture of a size that is not allowed is refused before it is sent. The API checks every
 * upload again, so rules that could not be read here only mean the refusal comes from the server instead.
 */
export type MediaUploadRulesState = { rules: MediaUploadRules; updatedAt: string | null; updatedBy: string | null };
type Send = (path: string, options?: Omit<RequestInit, "signal">) => Promise<Response>;

export const mediaUploadRulesPath = "/api/admin/settings/media-uploads";
let current: MediaUploadRulesState | null = null;
let pending: Promise<MediaUploadRulesState | null> | null = null;
const listeners = new Set<() => void>();

/** The API's answer, checked; throws on anything else. */
export function parseMediaUploadRulesState(value: unknown): MediaUploadRulesState {
  const { rules, updatedAt, updatedBy } = (value ?? {}) as Partial<Record<keyof MediaUploadRulesState, unknown>>;
  const parsed = mediaUploadRulesSchema.safeParse(rules);
  const when = updatedAt === null || (typeof updatedAt === "string" && updatedAt.length <= 40 && Number.isFinite(Date.parse(updatedAt)));
  const who = updatedBy === null || (typeof updatedBy === "string" && updatedBy.length <= 320);
  if (!parsed.success || !when || !who) throw Error("Invalid settings response");
  return { rules: parsed.data, updatedAt: updatedAt as string | null, updatedBy: updatedBy as string | null };
}

/** Shares newly saved rules with every upload control at once. */
export function publishMediaUploadRules(state: MediaUploadRulesState) {
  current = state;
  for (const listener of listeners) listener();
}

/**
 * The upload rules, from the API the first time (or again with `fresh`). Null when they could not be read: an older
 * API, a dropped connection, or a session without the website's content.
 */
export function loadMediaUploadRules(send: Send, fresh = false): Promise<MediaUploadRulesState | null> {
  if (current && !fresh) return Promise.resolve(current);
  if (pending && !fresh) return pending;
  const request = send(mediaUploadRulesPath, { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => (response.ok ? parseMediaUploadRulesState(await response.json()) : null))
    .then((state) => { if (state) publishMediaUploadRules(state); return state; })
    .catch(() => null)
    .finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request;
}

/**
 * The rules as last read (null until then), kept current as they are read again or a publisher saves new ones. Reading
 * is left to the controls that need them: the upload dialog as it opens, and each upload.
 */
export function useMediaUploadRules(): MediaUploadRulesState | null {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
    () => null,
  );
}

/** Forgets the rules read so far (tests, and a new sign-in). */
export function forgetMediaUploadRules() { current = null; pending = null; for (const listener of listeners) listener(); }

/** The rules in force, or the default (every size) when none could be read. */
export const rulesOrDefault = (state: MediaUploadRulesState | null) => state?.rules ?? defaultMediaUploadRules;

/**
 * A picture file's own size, turned upright as browsers show it (EXIF orientation), or null when it cannot be read here
 * (the API then decides). Bounded, so an unreadable file never holds up an upload.
 */
export async function measureImage(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch { /* fall back to an image element */ }
  }
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") return null;
  return new Promise((resolve) => {
    const address = URL.createObjectURL(file);
    const image = new Image();
    const done = (size: { width: number; height: number } | null) => { clearTimeout(timer); URL.revokeObjectURL(address); resolve(size); };
    const timer = setTimeout(() => done(null), 4000);
    image.onload = () => done(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => done(null);
    image.src = address;
  });
}
