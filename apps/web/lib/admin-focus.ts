/**
 * Click-to-edit in the live preview (owner, 14 Nov 2026: "everything is live where anybody could directly edit from
 * there seeing it live"): finding, showing and filling the editor's own fields from words clicked on the page. The
 * editor's fields stay the only way content changes. These helpers type into them exactly as a person would, so every
 * limit, default and check the field applies still holds.
 */

export type TextField = HTMLInputElement | HTMLTextAreaElement;

/** The slice of a TipTap editor these helpers use; TipTap keeps its editor on the editable element as `editor`. */
type RichEditor = {
  isEditable: boolean;
  state: {
    doc: RichNode;
    tr: { insertText: (text: string, from: number, to: number) => unknown };
  };
  view: { dispatch: (transaction: never) => void };
};
type RichNode = {
  isText: boolean;
  isTextblock: boolean;
  text?: string | null;
  nodeSize: number;
  content: { size: number };
  textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string;
  descendants: (visit: (node: RichNode, position: number) => boolean | void) => void;
};

/** How a field's text relates to the clicked words. */
type Match =
  /** The field holds exactly these words. */
  | { how: "same" }
  /** The words are part of the field's text, at these offsets of its raw value. */
  | { how: "part"; start: number; end: number }
  /** The page adds fixed words around the field's text ("© 2026 " + name + "."). */
  | { how: "around"; prefix: string; suffix: string };

/** A place in the editor holding clicked words: a plain field, or a run of text in a rich text editor. */
export type TextCandidate =
  | { kind: "field"; field: TextField; element: HTMLElement; match: Match }
  | { kind: "rich"; editor: RichEditor; from: number; to: number; element: HTMLElement; neighbours: string[]; match: Match };

export type ApplyResult = { ok: true } | { ok: false; message: string };

/** Spacing never matters when page words are compared with a field: the page wraps and collapses it. */
export const squashWords = (text: string) => text.replace(/\s+/g, " ").trim();
const key = (text: string) => squashWords(text).toLowerCase();

const fillableSelector = "input:not([type]), input[type=text], input[type=url], input[type=tel], input[type=email], textarea";

/** The clicked words found inside a field's raw value, letting any run of spacing stand for any other. */
function findPart(value: string, words: string): { start: number; end: number } | null {
  const pattern = squashWords(words).split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  if (!pattern) return null;
  const found = new RegExp(pattern).exec(value);
  return found ? { start: found.index, end: found.index + found[0].length } : null;
}

/**
 * How a field's text relates to the clicked words, or null when it does not hold them. `context` is the text the page
 * shows around the clicked words (see PreviewTextTarget).
 */
export function matchWords(value: string, words: string, context?: string): Match | null {
  const field = squashWords(value), page = squashWords(words);
  if (!field || !page) return null;
  if (field === page) return { how: "same" };
  // A short word ("Shop") inside a long field is too weak a clue to change that field by, unless the field is short and
  // the page shows all of it right there: "20+" is drawn apart from "Cities" in the heading "20+ Cities" (live, 16 Nov 2026).
  const shownWhole = context !== undefined && field.length <= 60 && key(context).includes(key(field));
  if ((page.length >= 4 || shownWhole) && field.includes(page)) {
    const part = findPart(value, words);
    if (part) return { how: "part", ...part };
  }
  if (field.length >= 4 && page.includes(field)) {
    const at = page.indexOf(field);
    return { how: "around", prefix: page.slice(0, at), suffix: page.slice(at + field.length) };
  }
  return null;
}

/** The field's next value once the page's words `before` became `after`, or why it cannot be. */
function nextValue(value: string, match: Match, after: string): { value: string } | { message: string } {
  if (match.how === "same") return { value: after };
  if (match.how === "part") return { value: value.slice(0, match.start) + after + value.slice(match.end) };
  // Only the field's own words can change; the page's fixed words around them must stay as they were.
  const typed = squashWords(after);
  if (typed.startsWith(match.prefix) && typed.endsWith(match.suffix) && typed.length > match.prefix.length + match.suffix.length) {
    return { value: typed.slice(match.prefix.length, typed.length - match.suffix.length).trim() };
  }
  const own = squashWords(value);
  return { message: `Only “${own.length > 60 ? `${own.slice(0, 57)}…` : own}” in that line can be changed here; the words around it are fixed.` };
}

const quality = { same: 0, part: 1, around: 2 } as const;
/** Addresses never show as words on a page: a page slug that happens to equal its title loses to the title. */
const addressField = /\b(slug|link|destination|url|href|web address)$/i;
const rank = (candidate: TextCandidate) => {
  const label = candidate.kind === "field" ? candidate.field.getAttribute("aria-label") ?? candidate.field.labels?.[0]?.textContent ?? "" : "";
  return quality[candidate.match.how] + (addressField.test(label.trim()) ? 0.5 : 0);
};

/**
 * Every field and rich text run under `root` holding these words, hidden ones included (a closed panel, another tab).
 * An empty field counts when its placeholder is the words: the storefront shows the theme's own words (the hero
 * headline) until staff write theirs.
 */
export function findTextCandidates(root: ParentNode, words: string, context?: string): TextCandidate[] {
  const found: TextCandidate[] = [];
  for (const field of root.querySelectorAll<TextField>(fillableSelector)) {
    if (field.closest("[data-click-edit-ignore]") || field.readOnly) continue;
    const match: Match | null = field.value ? matchWords(field.value, words, context)
      : field.placeholder && key(field.placeholder) === key(words) ? { how: "same" } : null;
    if (match) found.push({ kind: "field", field, element: field, match });
  }
  for (const element of root.querySelectorAll<HTMLElement>(".ProseMirror")) {
    const editor = (element as HTMLElement & { editor?: RichEditor }).editor;
    if (!editor?.state?.doc) continue;
    const wanted = squashWords(words);
    const blocks: { text: string; from: number; to: number }[] = [];
    const runs: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, position) => {
      if (node.isText) {
        if (squashWords(node.text ?? "") === wanted) runs.push({ from: position, to: position + node.nodeSize });
        return false;
      }
      if (node.isTextblock) {
        // Line breaks inside a paragraph read as spaces on the page, so they count as spaces here too.
        const text = node.textBetween(0, node.content.size, " ", " ");
        blocks.push({ text, from: position + 1, to: position + 1 + node.content.size });
        if (squashWords(text) === wanted) runs.push({ from: position + 1, to: position + 1 + node.content.size });
      }
      // Lists, quotes and tables hold paragraphs of their own: look inside them too.
      return true;
    });
    // A paragraph of one plain run is found twice (as the paragraph and as its run): keep one.
    const unique = runs.filter((run, index) => runs.findIndex((other) => other.from === run.from && other.to === run.to) === index);
    for (const run of unique) {
      const at = blocks.findIndex((block) => run.from >= block.from && run.to <= block.to);
      const neighbours = [blocks[at - 1]?.text, blocks[at + 1]?.text].filter((text): text is string => Boolean(text));
      found.push({ kind: "rich", editor, from: run.from, to: run.to, element: element.closest<HTMLElement>("[data-rich-text-editor]") ?? element, neighbours, match: { how: "same" } });
    }
  }
  return found;
}

/** The smallest element around `element` (inside `root`) that holds none of the other candidates. */
function ownGroup(element: HTMLElement, others: HTMLElement[], root: Element): Element {
  let group: Element = element;
  for (let up = element.parentElement; up && up !== root && root.contains(up); up = up.parentElement) {
    if (others.some((other) => other !== element && up.contains(other))) break;
    group = up;
  }
  return group;
}

/** Words that sit with a candidate in the editor: the other fields of its group, or the paragraphs around it. */
function companions(candidate: TextCandidate, all: TextCandidate[], root: Element): string[] {
  if (candidate.kind === "rich") return candidate.neighbours;
  const group = ownGroup(candidate.element, all.map((item) => item.element), root);
  return [...group.querySelectorAll<TextField>(fillableSelector)].filter((field) => field !== candidate.field).map((field) => field.value);
}

/**
 * The one candidate the clicked words came from. The closest kind of match wins; among equals, the one whose
 * neighbouring fields' words appear around the words on the page; then the repeat with the same position on the page.
 */
export function pickCandidate(candidates: TextCandidate[], context: string, occurrence: number, root: Element): TextCandidate | null {
  if (candidates.length <= 1) return candidates[0] ?? null;
  const best = Math.min(...candidates.map(rank));
  const close = candidates.filter((item) => rank(item) === best);
  if (close.length === 1) return close[0]!;
  const around = key(context);
  const scored = close.map((item) => ({
    item,
    score: companions(item, close, root).map(key).filter((words) => words.length >= 3 && around.includes(words)).length,
  }));
  const top = Math.max(...scored.map((entry) => entry.score));
  const tied = scored.filter((entry) => entry.score === top).map((entry) => entry.item);
  return tied[Math.min(occurrence, tied.length - 1)] ?? tied[0]!;
}

/**
 * Makes a candidate visible without taking the keyboard: opens a closed panel or switches to the tab around it, then
 * scrolls it into view and pulses it. The staff member keeps typing on the page while the field lights up beside it.
 */
export function revealCandidate(candidate: TextCandidate) {
  for (let up: HTMLElement | null = candidate.element; up; up = up.parentElement) {
    if (up.tagName === "DETAILS" && !(up as HTMLDetailsElement).open) (up as HTMLDetailsElement).open = true;
    if (up.getAttribute("role") === "tabpanel" && up.getAttribute("data-state") === "inactive") {
      const trigger = up.getAttribute("aria-labelledby");
      const tab = trigger ? up.ownerDocument.getElementById(trigger) : null;
      if (tab instanceof HTMLElement) tab.click();
    }
  }
  flashField(candidate.element, { focus: false });
}

/** Types the page's new words into the candidate the way a person would, so the editor's own handlers run. */
export function applyCandidate(candidate: TextCandidate, after: string): ApplyResult {
  if (candidate.kind === "rich") {
    if (!candidate.editor.isEditable) return { ok: false, message: "This text can't be changed right now." };
    const transaction = candidate.editor.state.tr.insertText(squashWords(after), candidate.from, candidate.to);
    candidate.editor.view.dispatch(transaction as never);
    return { ok: true };
  }
  const { field } = candidate;
  if (field.matches(":disabled")) return { ok: false, message: "The editor is busy. Try again in a moment." };
  // A one-line field keeps one line; a text box keeps the line breaks typed on the page.
  const typed = field.tagName === "TEXTAREA" ? after : squashWords(after);
  const next = nextValue(field.value, candidate.match, typed);
  if ("message" in next) return { ok: false, message: next.message };
  if (field.maxLength > 0 && next.value.length > field.maxLength) {
    return { ok: false, message: `That is longer than this field allows (${field.maxLength} characters), so the page was put back.` };
  }
  setFieldValue(field, next.value);
  return { ok: true };
}

/**
 * Types a value into a field the way a person would, so the editor's own onInput/onChange handlers run and the draft
 * changes exactly as if the staff member had typed it there.
 */
export function setFieldValue(field: TextField | HTMLSelectElement, value: string) {
  // The element's own prototype setter (input, text area or select), not the instance's: React tracks values through it.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The select whose label reads `label`, when it offers `value`. */
/** The list with this label under `root` (a select's aria-label or its label's text), or null. */
export function selectNamed(root: ParentNode, label: string): HTMLSelectElement | null {
  const wanted = key(label);
  return [...root.querySelectorAll<HTMLSelectElement>("select")].find((select) => key(select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent ?? "") === wanted) ?? null;
}

export function selectOffering(root: ParentNode, label: string, value: string): HTMLSelectElement | null {
  const wanted = key(label);
  for (const select of root.querySelectorAll<HTMLSelectElement>("select")) {
    const name = key(select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent ?? "");
    if (name === wanted && [...select.options].some((option) => option.value === value)) return select;
  }
  return null;
}

/**
 * Brings a field into view and pulses its outline so the eye finds it. `focus: false` leaves the keyboard where it is:
 * the live preview's click-to-edit keeps typing on the page while the matching field lights up beside it.
 */
export function flashField(field: HTMLElement, { focus = true }: { focus?: boolean } = {}) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  field.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "center" });
  if (focus) field.focus({ preventScroll: true });
  field.setAttribute("data-field-flash", "true");
  window.setTimeout(() => field.removeAttribute("data-field-flash"), 1800);
}

/** Retries `find` for a short while: a just-opened screen renders a frame or two after the click that opened it. */
export function whenRendered<T>(find: () => T | null, done: (found: T | null) => void, tries = 15, gap = 60) {
  const found = find();
  if (found || tries <= 0) { done(found); return; }
  window.setTimeout(() => whenRendered(find, done, tries - 1, gap), gap);
}

/** whenRendered as a promise. */
export const rendered = <T,>(find: () => T | null, tries?: number, gap?: number) => new Promise<T | null>((resolve) => whenRendered(find, resolve, tries, gap));
