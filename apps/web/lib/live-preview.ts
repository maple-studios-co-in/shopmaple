/**
 * Pure helpers for the builder-style live preview. The pane (components/admin/live-preview.tsx)
 * and the frame bridge (components/admin/preview-shell.tsx) share these so the token, URL and
 * messaging rules are testable without a browser.
 */
import { homeSectionKeys } from "@shopmaple/contracts";
import type { HomeSectionKey } from "./section-thumbnails";

export const previewMessageSource = "shopmaple-preview";
export type PreviewDevice = "desktop" | "tablet" | "phone";
export type PreviewView = "draft" | "published";
/** Frame widths in CSS pixels; desktop fills the pane. */
export const previewDeviceWidths: Record<PreviewDevice, number | null> = { desktop: null, tablet: 820, phone: 390 };
export const previewDevices: { key: PreviewDevice; label: string }[] = [
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
  { key: "phone", label: "Phone" },
];
/** Mint again this long before a token expires, so the frame never reloads into an expired link. */
export const previewTokenLeadMs = 60_000;

/** The existing staff-only frame address; the published view is the same route rendered from the published snapshot. */
export function previewFrameUrl({ path, token, view }: { path: string; token: string; view: PreviewView }) {
  const base = `/admin/preview-frame/${path}?token=${encodeURIComponent(token)}`;
  return view === "published" ? `${base}&view=published` : base;
}

export type PreviewTokenState = { token: string; version: number | null; expiresAt: number | null };
/** "mint" when there is no token, the draft version moved on, or expiry is inside the lead time. */
export function previewTokenState(state: PreviewTokenState, version: number, now: number): "mint" | "valid" {
  if (!state.token || state.version !== version || state.expiresAt === null) return "mint";
  return state.expiresAt - now <= previewTokenLeadMs ? "mint" : "valid";
}

export type FrameToParentMessage =
  | { type: "ready"; path: string; version: number; sections: string[] }
  | { type: "navigate"; path: string }
  /** The staff member pressed Edit on a section inside the preview. */
  | { type: "select"; section: string };
export type ParentToFrameMessage = { type: "focus"; section: string | null };
export type PreviewMessage = FrameToParentMessage | ParentToFrameMessage;

const sectionKey = /^[a-z0-9-]{1,40}$/;
const isSection = (value: unknown): value is string => typeof value === "string" && sectionKey.test(value);
const isPath = (value: unknown): value is string => typeof value === "string" && value.length <= 300 && value.startsWith("/") && !value.startsWith("//");

/**
 * Reads a postMessage event from the other side of the preview. Anything from another origin,
 * from a window other than the expected one, outside this message family, or with an
 * unexpected shape is ignored (null), so a stray or hostile message can never drive the UI.
 */
export function readPreviewMessage(
  event: { origin: string; source?: unknown; data: unknown },
  expectedOrigin: string,
  expectedSource?: unknown,
): PreviewMessage | null {
  if (event.origin !== expectedOrigin) return null;
  if (expectedSource !== undefined && event.source !== expectedSource) return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.source !== previewMessageSource) return null;
  if (message.type === "ready") {
    if (!isPath(message.path) || !Number.isSafeInteger(message.version) || !Array.isArray(message.sections) || message.sections.length > 100 || !message.sections.every(isSection)) return null;
    return { type: "ready", path: message.path, version: message.version as number, sections: message.sections };
  }
  if (message.type === "navigate") return isPath(message.path) ? { type: "navigate", path: message.path } : null;
  if (message.type === "select") return isSection(message.section) ? { type: "select", section: message.section } : null;
  if (message.type === "focus") {
    if (message.section === null) return { type: "focus", section: null };
    return isSection(message.section) ? { type: "focus", section: message.section } : null;
  }
  return null;
}

/** Section keys the frame can scroll to; homepage sections today. */
export const previewSectionKeys: readonly string[] = homeSectionKeys;

/**
 * The `section` parameter of a frame address: null when absent (render the whole page), the
 * section key for a homepage section on the home page, false for anything else.
 */
export function readThumbnailSection(page: readonly string[], section: unknown): HomeSectionKey | null | false {
  if (section === undefined) return null;
  const home = page.length === 0 || (page.length === 1 && page[0] === "home");
  return home && typeof section === "string" && (homeSectionKeys as readonly string[]).includes(section) ? section as HomeSectionKey : false;
}
