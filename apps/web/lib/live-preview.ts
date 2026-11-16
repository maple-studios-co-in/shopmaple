/**
 * Pure helpers for the builder-style live preview. The pane (components/admin/live-preview.tsx)
 * and the frame bridge (components/admin/preview-shell.tsx) share these so the token, URL and
 * messaging rules are testable without a browser.
 */
import { homeSectionKeys, previewTokenPattern } from "@shopmaple/contracts";
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

/**
 * Click-to-edit: where clicked words sit on the page. A homepage section, a part of the shared storefront chrome
 * (each edited on its own tab of Navigation & footer), or the body of any other page.
 */
export const previewTextAreas = ["section", "page", "announcement", "header", "footer", "whatsapp"] as const;
export type PreviewTextArea = (typeof previewTextAreas)[number];
/** Click-to-edit: enough about clicked words for the editor to open the screen and find the one field that holds them. */
export type PreviewTextTarget = {
  /** The storefront address the words are on ("/", "/our-story"). */
  path: string;
  /** The homepage section holding the words, when they sit in one. */
  section: string | null;
  area: PreviewTextArea;
  /**
   * The words of the largest element around them that holds none of their visible repeats, so "Explore" on the Terra
   * slide is told apart from "Explore" on the Nimbus card.
   */
  context: string;
  /** Which of the visible repeats of these words this is, counted down the page from 0. */
  occurrence: number;
  /**
   * How many times these words show in their part of the page (1: only here). Kept words shown more than once reload the
   * page after saving, so every copy shows them: the hero's four photos share one headline (16 Nov 2026).
   */
  repeats?: number;
};

export type FrameToParentMessage =
  | { type: "ready"; path: string; version: number; sections: string[] }
  | { type: "navigate"; path: string }
  /** The staff member pressed Edit on a section inside the preview. */
  | { type: "select"; section: string }
  /** Click-to-edit: they clicked these words, which are now a text box on the page. */
  | ({ type: "text-select"; text: string } & PreviewTextTarget)
  /** Click-to-edit: they typed over those words and kept them (Enter, or clicking away). */
  | ({ type: "text-edit"; before: string; after: string } & PreviewTextTarget)
  /** Click-to-edit: whether words on the page are being typed over right now (the pane holds reloads meanwhile). */
  | { type: "editing"; active: boolean };
export type ParentToFrameMessage =
  | { type: "focus"; section: string | null }
  /** "edit": clicking words on the page edits them; "browse": clicks follow links as on the storefront. */
  | { type: "mode"; mode: "edit" | "browse" }
  /**
   * The editor's answer to a text-select ("select") or a text-edit ("edit"). Not ok: the frame puts the words back as
   * they were and shows `message`, the reason in plain words.
   */
  | { type: "text-result"; phase: "select" | "edit"; ok: boolean; message?: string }
  /**
   * The draft saved a click-to-edit change the page already shows: the frame takes the new token and version in place
   * of a reload, so the page never jumps back to the top after each edit.
   */
  | { type: "token"; token: string; version: number }
  /** After a reload of the same page, scroll back to where the staff member was. */
  | { type: "scroll"; y: number };
export type PreviewMessage = FrameToParentMessage | ParentToFrameMessage;

const sectionKey = /^[a-z0-9-]{1,40}$/;
const isSection = (value: unknown): value is string => typeof value === "string" && sectionKey.test(value);
const isPath = (value: unknown): value is string => typeof value === "string" && value.length <= 300 && value.startsWith("/") && !value.startsWith("//");
/** Words a click-to-edit message may carry: plain, bounded, never blank. */
const isWords = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 2000;

function readTextTarget(message: Record<string, unknown>): PreviewTextTarget | null {
  const { path, section, area, context, occurrence, repeats = 1 } = message;
  if (!isPath(path) || !(section === null || isSection(section))) return null;
  if (typeof area !== "string" || !(previewTextAreas as readonly string[]).includes(area)) return null;
  if (typeof context !== "string" || context.length > 4000) return null;
  if (!Number.isSafeInteger(occurrence) || (occurrence as number) < 0 || (occurrence as number) > 999) return null;
  if (!Number.isSafeInteger(repeats) || (repeats as number) < 1 || (repeats as number) > 1000) return null;
  return { path, section, area: area as PreviewTextArea, context, occurrence: occurrence as number, repeats: repeats as number };
}

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
  if (message.type === "text-select") {
    const target = readTextTarget(message);
    return target && isWords(message.text) ? { type: "text-select", text: message.text, ...target } : null;
  }
  if (message.type === "text-edit") {
    const target = readTextTarget(message);
    return target && isWords(message.before) && isWords(message.after) ? { type: "text-edit", before: message.before, after: message.after, ...target } : null;
  }
  if (message.type === "editing") return typeof message.active === "boolean" ? { type: "editing", active: message.active } : null;
  if (message.type === "token") {
    return typeof message.token === "string" && previewTokenPattern.test(message.token) && Number.isSafeInteger(message.version) && (message.version as number) > 0
      ? { type: "token", token: message.token, version: message.version as number } : null;
  }
  if (message.type === "scroll") {
    return typeof message.y === "number" && Number.isFinite(message.y) && message.y >= 0 && message.y <= 1_000_000 ? { type: "scroll", y: message.y } : null;
  }
  if (message.type === "mode") return message.mode === "edit" || message.mode === "browse" ? { type: "mode", mode: message.mode } : null;
  if (message.type === "text-result") {
    if ((message.phase !== "select" && message.phase !== "edit") || typeof message.ok !== "boolean") return null;
    if (message.message !== undefined && !(typeof message.message === "string" && message.message.length <= 300)) return null;
    return { type: "text-result", phase: message.phase, ok: message.ok, ...(typeof message.message === "string" ? { message: message.message } : {}) };
  }
  if (message.type === "focus") {
    if (message.section === null) return { type: "focus", section: null };
    return isSection(message.section) ? { type: "focus", section: message.section } : null;
  }
  return null;
}

/**
 * The frame route that shows a storefront address: "/" is "home", a page of its own ("/our-story", "/sofas", "/king")
 * is "pages/<slug>", and longer addresses ("/policies/privacy-policy", "/blogs/news/a-post") keep their segments.
 */
export function previewRouteFor(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "home";
  if (segments.length === 1 && !["home", "pages", "policies", "blogs", "collections", "products"].includes(segments[0]!)) return `pages/${segments[0]}`;
  return segments.join("/");
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
