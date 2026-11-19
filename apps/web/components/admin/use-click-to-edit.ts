"use client";
import { useCallback, useRef } from "react";
import { categoryPageSlugs, homeSectionKeys, type StorefrontContent } from "@shopmaple/contracts";
import { applyCandidate, findTextCandidates, pickCandidate, rendered, revealCandidate, selectNamed, selectOffering, setFieldValue, type TextCandidate } from "@/lib/admin-focus";
import { previewRouteFor, type FrameToParentMessage, type PreviewTextArea } from "@/lib/live-preview";
import type { HomeSectionKey } from "@/lib/section-thumbnails";
import { isSiteWordKey, type SiteWordKey } from "@/lib/site-words";

export type TextSelectMessage = Extract<FrameToParentMessage, { type: "text-select" }>;
export type TextEditMessage = Extract<FrameToParentMessage, { type: "text-edit" }>;
export type TextReply = (result: { ok: boolean; message?: string }) => void;

type ChromePart = Exclude<PreviewTextArea, "section" | "page">;
/**
 * The admin screen that edits clicked words. Homepage sections open their inspector; the storefront chrome opens
 * Navigation & footer on the tab for that part; other pages open their own screen with that page chosen.
 */
export type ClickEditScreen =
  | { kind: "section"; section: HomeSectionKey }
  | { kind: "chrome"; part: ChromePart }
  | { kind: "existing"; page: string }
  | { kind: "pages"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "editorial"; choice: string; article?: string }
  /** A word the theme writes itself (Site words), named by the page. */
  | { kind: "words"; key: SiteWordKey }
  | { kind: "current" };

/** Navigation & footer's tabs that hold each part of the chrome, in the order to look. */
const chromeTabs: Record<ChromePart, string[]> = {
  announcement: ["Announcement & WhatsApp"],
  whatsapp: ["Announcement & WhatsApp"],
  header: ["Header links", "Main navigation"],
  footer: ["Footer"],
};

/** Where clicked words are edited, from where they sit on the page. */
export function clickEditScreen(message: TextSelectMessage | TextEditMessage, content: StorefrontContent | null, existingPages: readonly (readonly [string, string, string])[]): ClickEditScreen {
  // The theme's own words name their place on the page: Site words holds them, wherever they sit.
  if (message.word && isSiteWordKey(message.word)) return { kind: "words", key: message.word };
  if (message.area === "section") {
    return message.section && (homeSectionKeys as readonly string[]).includes(message.section) ? { kind: "section", section: message.section as HomeSectionKey } : { kind: "current" };
  }
  if (message.area !== "page") return { kind: "chrome", part: message.area };
  const [first, second, third] = message.path.split("/").filter(Boolean);
  if (first === "policies" && second && !third) return { kind: "editorial", choice: `policy:${second}` };
  if (first === "blogs" && second) return third ? { kind: "editorial", choice: `article:${second}/${third}`, article: third } : { kind: "editorial", choice: `blog:${second}` };
  if (!first || second) return { kind: "current" };
  if ((categoryPageSlugs as readonly string[]).includes(first)) return { kind: "category", slug: first };
  const existing = existingPages.find(([, , route]) => route === `pages/${first}`);
  if (existing) return { kind: "existing", page: existing[0] };
  if (content?.pages.some((page) => page.slug === first)) return { kind: "pages", slug: first };
  return { kind: "current" };
}

export type ClickToEditOptions = {
  canEdit: boolean;
  /** Why nothing can change right now (a schedule is open, a newer draft exists), or null. */
  blocked: () => string | null;
  /** A load or save is running and the editor's fields are locked for a moment: click-to-edit waits for it. */
  busy: () => boolean;
  content: StorefrontContent | null;
  existingPages: readonly (readonly [string, string, string])[];
  /** Switches the editor to the screen; `keep` is the frame route the preview stays on meanwhile. */
  open: (screen: ClickEditScreen, keep: string) => void;
  /** A message in the editor's notice line. */
  notice: (message: string) => void;
  /**
   * Runs the typing of a kept edit, so the editor knows the page already shows it (no reload needed). `elsewhere`: the
   * same field also shows in other places on the page, which still show the old words until it reloads.
   */
  whileApplying?: <T>(run: () => T, elsewhere: boolean) => T;
};

const cannotChange = "These words can't be changed here: product names and prices come from Keeri, and some words are part of the store's design.";

/**
 * Click-to-edit from the live preview. Each message opens the screen that edits the words, finds the one field that
 * holds them and lights it up (a click), or types the new words into it (a kept edit). Messages are handled one at a
 * time in arrival order, so a quick second click never overtakes the edit before it.
 */
export function useClickToEdit(options: ClickToEditOptions) {
  const latest = useRef(options);
  latest.current = options;
  const queue = useRef<Promise<void>>(Promise.resolve());

  const handle = useCallback(async (message: TextSelectMessage | TextEditMessage, reply: TextReply) => {
    const { canEdit, blocked, content, existingPages, open, notice } = latest.current;
    const editing = message.type === "text-edit";
    const words = editing ? message.before : message.text;
    if (!canEdit) { reply({ ok: false, message: "You have View access, so words on the page can't be changed. Edit access is set on Keeri's Roles screen." }); return; }
    const reason = blocked();
    if (reason) { reply({ ok: false, message: reason }); if (editing) notice(reason); return; }
    // A save locks the fields for a moment; an edit kept meanwhile waits for it rather than being lost.
    if (!(await settled(() => !latest.current.busy(), 10_000))) {
      const busyNow = "The editor is busy saving. Try again in a moment.";
      reply({ ok: false, message: busyNow });
      if (editing) notice(busyNow);
      return;
    }
    const screen = clickEditScreen(message, latest.current.content ?? content, existingPages);
    latest.current.open(screen, previewRouteFor(message.path));
    const tally = { fields: 0 };
    const candidate = await locate(screen, words, message.context, message.occurrence, latest.current.content, tally, message.field);
    if (!candidate) {
      reply({ ok: false, message: cannotChange });
      if (editing) notice(`“${words.length > 60 ? `${words.slice(0, 57)}…` : words}”: ${cannotChange} The page was put back.`);
      return;
    }
    revealCandidate(candidate);
    if (!editing) { reply({ ok: true }); return; }
    const apply = () => applyCandidate(candidate, message.after);
    // Fewer fields than copies of the words on the page: some copies show this one field (the hero's four photos share
    // one headline), and they change only once the page reloads. Words that named their own field are that copy alone.
    const elsewhere = !message.field && (message.repeats ?? 1) > Math.max(1, tally.fields);
    const result = latest.current.whileApplying ? latest.current.whileApplying(apply, elsewhere) : apply();
    if (result.ok) reply({ ok: true });
    else { reply({ ok: false, message: result.message }); notice(result.message); }
  }, []);

  const run = useCallback((message: TextSelectMessage | TextEditMessage, reply: TextReply) => {
    queue.current = queue.current
      .then(() => handle(message, reply))
      .catch(() => reply({ ok: false, message: "Something went wrong finding these words in the editor. Try again." }));
  }, [handle]);
  return { onTextSelect: run, onTextEdit: run };
}

/** Resolves true once `condition` holds, or false after `limitMs`. */
function settled(condition: () => boolean, limitMs: number) {
  return new Promise<boolean>((resolve) => {
    const started = Date.now();
    const check = () => {
      if (condition()) resolve(true);
      else if (Date.now() - started >= limitMs) resolve(false);
      else window.setTimeout(check, 60);
    };
    check();
  });
}

/** The editor's panel, once it shows the screen asked for. */
function screenPanel(tab: string) {
  return document.querySelector<HTMLElement>(`[data-admin-panel][aria-label="${tab} editor"]`);
}

/** Finds the field holding the words on the opened screen, choosing the page or tab inside it first when needed. */
async function locate(screen: ClickEditScreen, words: string, context: string, occurrence: number, content: StorefrontContent | null,
  tally: { fields: number } = { fields: 0 }, named?: string): Promise<TextCandidate | null> {
  const search = (root: Element | null) => {
    if (!root) return null;
    const found = findTextCandidates(root, words, context);
    tally.fields = found.length;
    return found.length ? pickCandidate(found, context, occurrence, root) : null;
  };
  if (screen.kind === "words") {
    // The page named the place, so there is exactly one box: no matching of words needed.
    const box = await rendered(() => screenPanel("Site words")?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="site-word:${screen.key}"]`) ?? null, 15);
    if (!box) return null;
    tally.fields = 1;
    return { kind: "field", field: box, element: box, match: { how: "same" } };
  }
  if (screen.kind === "section") {
    const inspector = await rendered(() => document.querySelector<HTMLElement>(`[data-section-inspector="${screen.section}"]`));
    // Words that name their field (a hero slide's, "hero-slide:2:headline"): that very field, however many slides show the
    // same words (owner, 19 Nov 2026). The name was read against a fixed pattern, so it goes into the selector as it is.
    if (named) {
      const box = await rendered(() => inspector?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${named}"]`) ?? null, 15);
      if (box) { tally.fields = 1; return { kind: "field", field: box, element: box, match: { how: "same" } }; }
    }
    // The inspector opens on Content; give its fields a frame to appear.
    const found = await rendered(() => search(inspector), 8);
    if (found || !inspector) return found;
    // A section of several campaigns (the promos' three cards) shows one campaign's fields at a time: the second and third
    // cards' words were refused on the live shop (16 Nov 2026). Try each campaign in turn; with no match, put the list back.
    const chooser = selectNamed(inspector, "Campaign");
    if (!chooser) return null;
    const start = chooser.value;
    for (const option of [...chooser.options]) {
      if (option.value === start) continue;
      setFieldValue(chooser, option.value);
      const next = await rendered(() => (chooser.isConnected && chooser.value === option.value ? search(inspector) : null), 8);
      if (next) return next;
    }
    if (chooser.isConnected && chooser.value !== start) setFieldValue(chooser, start);
    return null;
  }
  if (screen.kind === "chrome") {
    const panel = await rendered(() => screenPanel("Navigation & footer"));
    if (!panel) return null;
    for (const label of chromeTabs[screen.part]) {
      const tab = [...panel.querySelectorAll<HTMLElement>("[role=tab]")].find((item) => item.textContent?.trim() === label);
      if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
      const found = await rendered(() => (tab?.getAttribute("aria-selected") === "true" || !tab ? search(panel) : null), 8);
      if (found) return found;
    }
    return null;
  }
  if (screen.kind === "current") return search(document.querySelector("[data-admin-panel]"));
  const tab = { existing: "Existing pages", pages: "Pages", category: "Category pages", editorial: "Policies & blogs" }[screen.kind];
  const panel = await rendered(() => screenPanel(tab));
  if (!panel) return null;
  if (screen.kind === "pages") {
    // Pages edits one page at a time: choose the clicked page in its Page list first.
    const index = content?.pages.findIndex((page) => page.slug === screen.slug) ?? -1;
    const select = index >= 0 ? await rendered(() => selectOffering(panel, "Page", String(index))) : null;
    if (select && select.value !== String(index)) setFieldValue(select, String(index));
  }
  if (screen.kind === "editorial") {
    const select = await rendered(() => selectOffering(panel, "Policy or blog page", screen.choice), 4);
    if (select && select.value !== screen.choice) setFieldValue(select, screen.choice);
    if (!select && screen.article) {
      // Articles written in the admin are chosen in their own list, by their address.
      const own = [...panel.querySelectorAll<HTMLSelectElement>("select")].find((item) => (item.getAttribute("aria-label") ?? item.labels?.[0]?.textContent ?? "").trim() === "Authored article");
      const option = own && [...own.options].find((item) => item.value.endsWith(`/${screen.article}`) || item.value === screen.article);
      if (own && option && own.value !== option.value) setFieldValue(own, option.value);
    }
  }
  return rendered(() => search(screenPanel(tab)), 10);
}
