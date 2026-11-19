"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChromeArtwork } from "@/lib/chrome-artwork";
import { useRouter } from "next/navigation";
import { MousePointer2, Pencil } from "lucide-react";
import type { SiteChrome } from "@shopmaple/contracts";
import type { MenuArtwork } from "@/lib/menu-artwork";
import { StoreChromeView } from "@/components/admin/store-chrome";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { AdminRoot } from "./admin-root";
import { editFieldPattern, keepPreviewMode, previewDevices, previewMessageSource, previewRouteFor, readPreviewMessage, readPreviewMode, type PreviewDevice, type PreviewPicture, type PreviewTextTarget } from "@/lib/live-preview";
import { sectionName } from "@/lib/section-thumbnails";

export type PreviewPageOption = { label: string; segments: string[] };

/** Fixed banner, page switcher and width toggle around the draft preview frame. */
export function PreviewShell({ token, segments, pages, version, publishedVersion, expiresAt, title }: {
  token: string; segments: string[]; pages: PreviewPageOption[]; version: number; publishedVersion: number | null; expiresAt: string; title: string;
}) {
  const router = useRouter();
  const [width, setWidth] = useState<PreviewDevice>("desktop");
  const current = segments.join("/");
  const query = `?token=${encodeURIComponent(token)}`;
  const expires = new Date(expiresAt);
  return (
    <AdminRoot aria-label="Draft preview" className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line-soft bg-surface/90 px-[clamp(16px,3vw,28px)] py-2.5 backdrop-blur-md backdrop-saturate-150">
        <strong className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><span aria-hidden="true" className="size-[7px] rounded-full bg-primary" />Draft preview, not published</strong>
        <span className="text-xs text-muted-foreground tabular-nums">
          Draft version {version}. {publishedVersion ? `Published version ${publishedVersion}.` : "Nothing published yet."} Link expires at{" "}
          {Number.isFinite(expires.getTime()) ? expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "an unknown time"}.
        </span>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span>Page</span>
          <NativeSelect size="sm" aria-label="Preview page" className="max-w-[260px] bg-card" value={current} onChange={(event) => router.push(`/admin/preview/${event.target.value}${query}`)}>
            {pages.map((page) => <NativeSelectOption key={page.segments.join("/")} value={page.segments.join("/")}>{page.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <div role="group" aria-label="Preview width" className="inline-flex gap-0.5 rounded-full bg-black/[0.07] p-[3px]">
          {previewDevices.map((device) => (
            <button key={device.key} type="button" aria-pressed={width === device.key} onClick={() => setWidth(device.key)} className="h-7 rounded-full px-3 text-xs font-semibold text-neutral focus-visible:outline-none transition-colors duration-150 ease-admin hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs">{device.label}</button>
          ))}
        </div>
        <a href="/admin" className="ml-auto rounded-sm text-xs font-semibold text-primary underline-offset-4 focus-visible:outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60">Back to editor</a>
      </header>
      <div className="flex flex-1 justify-center p-4">
        <iframe title={`Draft preview of ${title}`} src={`/admin/preview-frame/${current}${query}`} referrerPolicy="same-origin"
          className={cn("h-[calc(100dvh-84px)] min-h-[480px] w-full max-w-full rounded-xl border-0 bg-white shadow-lg motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-admin", width === "tablet" && "w-[820px]", width === "phone" && "w-[390px]")} />
      </div>
    </AdminRoot>
  );
}

/**
 * The box a homepage section draws. HomePage wraps each section in a `display: contents`
 * element that has no box of its own, so measuring, scrolling and outlining use its first child.
 */
const sectionBox = (node: HTMLElement) => (node.firstElementChild as HTMLElement | null) ?? node;

/** The parent window when this document is embedded by the same-origin admin, else null. */
function embeddingParent(): Window | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  return window.parent;
}

/** Keeps in-preview navigation on draft content: same-origin storefront links reopen inside the frame with the same token. */
export function PreviewNavigation({ token, children, navigate = (url) => window.location.assign(url), view = "draft" }: {
  token: string;
  children: ReactNode;
  /** Replaced in tests; the browser's own navigation otherwise. */
  navigate?: (url: string) => void;
  /** Carried through every in-frame navigation so the published view stays published. */
  view?: "draft" | "published";
}) {
  /** Opens a storefront address inside the frame, with the draft: its own query (a collection's page and filters, a
   * product's variant) and #anchor kept, the frame's token added. */
  function go(url: URL) {
    const search = new URLSearchParams(url.search);
    for (const key of ["token", "view", "section"]) search.delete(key);
    search.set("token", token);
    if (view === "published") search.set("view", "published");
    // Tell the embedding admin where the preview is going, so its toolbar can follow.
    embeddingParent()?.postMessage({ source: previewMessageSource, type: "navigate", path: url.pathname }, window.location.origin);
    // A page of its own ("/our-story") is served at pages/<slug> in the frame; it showed "unavailable" before (14 Nov 2026).
    navigate(`/admin/preview-frame/${previewRouteFor(url.pathname)}?${search}${url.hash}`);
  }
  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const url = new URL(anchor.href, window.location.href);
    // A link to a place on this page ("#reviews") resolves to the frame's own address and scrolls as usual.
    if (url.origin !== window.location.origin || url.pathname.startsWith("/admin")) return;
    event.preventDefault();
    go(url);
  }
  // A form that asks for a page (method GET: the header's search, a collection's filters and sort) opens its results in the
  // frame as well, instead of on the published storefront. A form that sends itself (an enquiry) has already cancelled
  // the browser's own submission by the time this runs, and is left alone.
  function onSubmit(event: React.FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
    if ((form.getAttribute("method") ?? "get").toLowerCase() !== "get") return;
    const url = new URL(form.getAttribute("action") || window.location.pathname, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/admin")) return;
    event.preventDefault();
    // Empty boxes are left out of the address, as the collection's filter form does itself.
    const fields = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string" && value !== "") fields.append(key, value);
    url.search = fields.toString();
    go(url);
  }
  // display: contents, so the wrapper changes no layout; it only has to be an ancestor of every link and form.
  return <div onClickCapture={onClick} onSubmit={onSubmit} className="contents" data-preview-navigation="">{children}</div>;
}

/** The storefront chrome around every page, by the Navigation & footer tab that edits each part. */
const chromeParts = [[".announcement", "announcement"], [".whatsapp-support", "whatsapp"], [".site-header", "header"], [".maple-footer", "footer"]] as const;
/** Never words to edit: the admin's own controls inside the frame, hidden helpers, and form controls. */
const notWords = "[data-preview-edit], [data-preview-hint], .skip-link, script, style, noscript, template, svg, select, option, textarea, input";
const squash = (text: string) => text.replace(/\s+/g, " ").trim();
/**
 * The picture a click lands on, by what changes it: an Artwork placement (`slot`, the nearest one), else a banner, card,
 * slide, post, film or page banner (`target`). Null when no picture staff chose is there.
 */
function pictureOf(node: Element): { slot: string } | { target: string } | null {
  const placed = node.closest<HTMLElement>("[data-media-slot]"), targeted = node.closest<HTMLElement>("[data-picture-target]");
  if (placed?.dataset.mediaSlot && (!targeted || targeted.contains(placed))) return { slot: placed.dataset.mediaSlot };
  if (targeted?.dataset.pictureTarget) return { target: targeted.dataset.pictureTarget };
  // A product's own photo inside such a block (the hero's featured piece) belongs to the product, not to the block.
  if (isProductPhoto(node)) return null;
  // A picture drawn behind the words over it (a collection page's hero, owner 19 Nov 2026): the block names its placement,
  // so a click anywhere on it that is not on words opens the picture, though the layer with the words is what is clicked.
  const area = node.closest<HTMLElement>("[data-media-slot-area]")?.dataset.mediaSlotArea;
  return area ? { slot: area } : null;
}
/** A product's photo (ProductImage marks each): it comes with the product from Keeri, so the admin has no picture to swap. */
const isProductPhoto = (node: Element) => node.closest("[data-product-photo]") !== null && !node.closest("button, [role=button]");
const productPhotoNote = "This photo comes from the product in Keeri. Change it on the product in Keeri, and every page that shows the product follows.";
/** The editor field clicked words name ("hero-slide:2:headline"), when the page names one. */
const editFieldOf = (node: Element) => {
  const field = node.closest<HTMLElement>("[data-edit-field]")?.dataset.editField;
  return field && editFieldPattern.test(field) ? field : undefined;
};
/** The Site words place clicked words name (their own span), or a form box's placeholder names; undefined elsewhere. */
const siteWordOf = (node: Element) => node.closest<HTMLElement>("[data-site-word]")?.dataset.siteWord ?? (node as HTMLElement).dataset?.siteWordPlaceholder;
/** The words around clicked words, as laid out (innerText needs layout; tests have none). Only compared, never saved. */
const shownText = (node: HTMLElement) => (typeof node.innerText === "string" ? node.innerText : node.textContent ?? "");
/**
 * The words an element holds, as written: line breaks (<br>, or the blocks a browser adds while typing) become "\n".
 * Not innerText, which applies the page's styling: a heading drawn in capitals would be saved in capitals.
 */
function writtenText(node: Node): string {
  let text = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) text += (child as Text).data;
    else if (child.nodeName === "BR") text += "\n";
    else if (child.nodeType === 1) text += (/^(DIV|P|LI)$/.test(child.nodeName) && text && !text.endsWith("\n") ? "\n" : "") + writtenText(child);
  });
  return text;
}
/** Typed words as kept: spaces collapsed, line breaks kept (a text box field keeps them), ends trimmed. */
const keptText = (text: string) => text.replace(/\r/g, "").replace(/[^\S\n]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
/** Words a person can change in place: an element holding only text (line breaks allowed), short enough to be one field. */
function editableWords(node: Element | null): node is HTMLElement {
  if (!(node instanceof HTMLElement) || node.closest(notWords)) return false;
  if ([...node.children].some((child) => child.tagName !== "BR")) return false;
  const words = squash(node.textContent ?? "");
  return words.length > 0 && words.length <= 600;
}
function supportsPlainText() {
  const probe = document.createElement("div");
  probe.setAttribute("contenteditable", "plaintext-only");
  return probe.contentEditable === "plaintext-only";
}

/**
 * Shows `then` once `src` has loaded (or failed, or after a second and a half), so a swapped picture never blanks out
 * while the new one downloads.
 */
function whenLoaded(src: string, then: () => void) {
  if (typeof Image === "undefined") { then(); return; }
  let done = false;
  const go = () => { if (!done) { done = true; then(); } };
  const probe = new Image();
  probe.onload = go;
  probe.onerror = go;
  probe.src = src;
  window.setTimeout(go, 1500);
}

/**
 * Swaps pictures chosen in the editor into the page where they are, before the draft is saved (owner, 17 Nov 2026: "the
 * changes with updated photo happens there immediately in live preview as I select the image"). Each `<img>` drawn for
 * the placement or target takes the new address; a phone-only part (a `<source>`, a mobile artwork layer) takes the
 * phone picture. Only attributes change, never the page's structure, so the redraw that follows the save takes over
 * cleanly. The one exception is a campaign still drawn from the theme's sliced artwork: the new picture is laid over the
 * slices, and the redraw removes it again.
 */
export function swapPictures(items: readonly PreviewPicture[], doc: Document = document) {
  for (const item of items) {
    // Slots and targets were read against fixed patterns ([a-z0-9:-]), so they go into the selector as they are.
    const selector = item.slot ? `[data-media-slot="${item.slot}"]` : `[data-picture-target="${item.target}"]`;
    for (const host of doc.querySelectorAll<HTMLElement>(selector)) {
      if (host.querySelector(".campaign-art-tile")) {
        for (const layer of host.querySelectorAll<HTMLElement>("[data-artwork]")) {
          const src = layer.dataset.artwork === "mobile" ? item.mobileSrc ?? item.src : item.src;
          whenLoaded(src, () => {
            let cover = layer.querySelector<HTMLImageElement>(":scope > img[data-preview-overlay]");
            if (!cover) {
              cover = doc.createElement("img");
              cover.alt = "";
              cover.setAttribute("data-preview-overlay", "");
              Object.assign(cover.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "1" });
              layer.append(cover);
            }
            cover.src = src;
          });
        }
        continue;
      }
      const images = host.tagName === "IMG" ? [host as HTMLImageElement] : [...host.querySelectorAll("img")];
      for (const image of images) {
        const src = image.closest('[data-artwork="mobile"]') ? item.mobileSrc ?? item.src : item.src;
        const picture = image.parentElement?.tagName === "PICTURE" ? image.parentElement : null;
        whenLoaded(src, () => {
          picture?.querySelectorAll("source").forEach((source) => { source.srcset = item.mobileSrc ?? item.src; source.removeAttribute("sizes"); });
          image.removeAttribute("srcset");
          image.removeAttribute("sizes");
          image.src = src;
          // A decorative picture keeps its empty description.
          if (item.alt !== undefined && image.alt !== "") image.alt = item.alt;
          image.setAttribute("data-preview-swapped", "");
        });
      }
    }
  }
}

/**
 * Shows the slide staff are editing and holds it in view (owner, 19 Nov 2026: each slide is edited where it can be seen), or
 * lets the slider run again (null). The slider reads `data-slider-pin` when it attaches and on `slider:pin`
 * (lib/slider-behaviour.ts), so a slider whose script has not loaded yet, or attaches again after a redraw, shows it too.
 */
export function pinSlide(slider: string, index: number | null, doc: Document = document) {
  const root = doc.querySelector<HTMLElement>(`[data-slider="${slider}"]`);
  if (!root) return;
  if (index === null) root.removeAttribute("data-slider-pin");
  else root.setAttribute("data-slider-pin", String(index));
  const View = doc.defaultView;
  if (View) root.dispatchEvent(new View.CustomEvent("slider:pin"));
}

/** Where the page was scrolled when it reloaded itself, so it opens there again (sessionStorage, this tab only). */
const reloadScrollKey = "shopmaple-preview-reload-scroll";

/** The App Router when the page has one (the frame always does; a bare test render does not). */
function useOptionalRouter() {
  try { return useRouter(); } catch { return null; }
}

/**
 * Inside the frame: announces the page and its sections to the embedding admin, and scrolls to
 * and highlights the section the admin asks for. When `selectable` (the draft view), hovering a
 * section outlines it and offers an Edit button that selects it in the editor, and click-to-edit
 * (on until the admin switches to Browse) turns any words on the page into a text box. Only
 * same-origin messages from the parent window are honoured; a top-level preview (no parent) stays silent.
 */
export function PreviewFrameBridge({ path, version, parentWindow, selectable = false, onToken, refreshTo }: {
  path: string; version: number; parentWindow?: Window | null; selectable?: boolean;
  /** The draft saved a change this page already shows: use this token and version from now on (no reload). */
  onToken?: (token: string, version: number) => void;
  /** Redraws this page from another address in place; the App Router's own (scroll kept) unless a test passes one. */
  refreshTo?: (url: string) => void;
}) {
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;
  const router = useOptionalRouter();
  const refreshRef = useRef(refreshTo);
  refreshRef.current = refreshTo ?? (router ? (url: string) => router.replace(url, { scroll: false }) : undefined);
  /**
   * Words were typed on this page since it loaded (click-to-edit). Typing into words React drew can leave it holding text
   * nodes the browser replaced, so a redraw in place could fail there; such a page reloads instead, and comes back where it was.
   */
  const typedHere = useRef(false);
  const [hover, setHover] = useState<{ section: string; top: number; left: number } | null>(null);
  // The parent exists only in the browser. Read after mounting, so the server's markup and the first render agree.
  const [parent, setParent] = useState<Window | null>(parentWindow ?? null);
  useEffect(() => { setParent(parentWindow === undefined ? embeddingParent() : parentWindow); }, [parentWindow]);
  /**
   * Edit until the admin says Browse. A page that reloads (or opens from a link followed in Browse) starts in the mode kept
   * for the tab, so it never edits for a moment while staff are browsing, or follows a link while they are editing.
   */
  const [editMode, setEditMode] = useState(() => readPreviewMode() === "edit");
  // The page says which mode it is in, for its cursors (styles/preview-edit.css) and the pill below.
  useEffect(() => {
    if (!parent || !selectable) return;
    document.documentElement.dataset.previewMode = editMode ? "edit" : "browse";
    return () => { delete document.documentElement.dataset.previewMode; };
  }, [parent, selectable, editMode]);
  /** A short reason shown in the hint when the editor could not take the words (a product name from Keeri, say). */
  const [note, setNote] = useState("");
  /** The words being typed over right now: a scroll request never pulls them out from under the caret. */
  const editingNow = useRef<HTMLElement | null>(null);
  /** Ends the edit in progress without keeping it (the editor has no field for those words). */
  const cancelEdit = useRef<() => void>(() => {});
  /** The words last handed to the editor, put back as they were if it could not take them. */
  const lastEdit = useRef<{ node: HTMLElement; html: string } | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(""), 5000);
    return () => window.clearTimeout(timer);
  }, [note]);
  useEffect(() => {
    if (!parent) return;
    const origin = window.location.origin;
    const sections = () => [...document.querySelectorAll<HTMLElement>("[data-home-section]")];
    parent.postMessage({ source: previewMessageSource, type: "ready", path, version, sections: sections().map((node) => node.dataset.homeSection ?? "").filter(Boolean) }, origin);
    function onMessage(event: MessageEvent) {
      const message = readPreviewMessage(event, origin, parent);
      if (!message) return;
      if (message.type === "mode") { setEditMode(message.mode === "edit"); keepPreviewMode(message.mode); return; }
      if (message.type === "token") {
        tokenRef.current?.(message.token, message.version);
        // A token handed over in place follows the save of words typed on this page. Say so where the eyes are: the save
        // happens by itself, and with Save draft greyed out the owner took it for "can't save" (16 Nov 2026).
        setNote(`Saved in draft version ${message.version}. It goes live when the draft is published.`);
        return;
      }
      if (message.type === "pictures") { swapPictures(message.items); return; }
      if (message.type === "refresh") {
        // The editor saved a change: redraw this very page (its own query and #anchor kept) from the new version, in place.
        // A client-side navigation keeps the page's scroll position and everything open on it; before, the whole frame
        // reloaded and opened at the top (owner, 17 Nov 2026: "I was at the hero section").
        tokenRef.current?.(message.token, message.version);
        const url = new URL(window.location.href);
        url.searchParams.set("token", message.token);
        const next = `${url.pathname}${url.search}${url.hash}`;
        const redraw = refreshRef.current;
        if (typedHere.current || !redraw) {
          try { window.sessionStorage.setItem(reloadScrollKey, JSON.stringify({ path: url.pathname, y: window.scrollY })); } catch { /* opens at the top */ }
          window.location.replace(next);
        } else redraw(next);
        return;
      }
      if (message.type === "scroll") {
        // Instant, never smooth: the page was reloaded under the staff member and should simply be where it was.
        (document.scrollingElement ?? document.documentElement).scrollTo?.({ top: message.y, behavior: "instant" });
        return;
      }
      if (message.type === "text-result") {
        if (message.phase === "select") { if (!message.ok) cancelEdit.current(); }
        else {
          if (!message.ok && lastEdit.current) lastEdit.current.node.innerHTML = lastEdit.current.html;
          lastEdit.current = null;
        }
        if (!message.ok && message.message) setNote(message.message);
        return;
      }
      if (message.type === "slide") { pinSlide(message.slider, message.index); return; }
      if (message.type !== "focus") return;
      for (const node of sections()) {
        if (message.section !== null && node.dataset.homeSection === message.section) {
          node.setAttribute("data-preview-highlight", "true");
          // Words being typed in this section stay where they are; the section is only marked.
          if (editingNow.current && node.contains(editingNow.current)) continue;
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
          sectionBox(node).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        } else node.removeAttribute("data-preview-highlight");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [path, version, parent]);
  // A newer version has been drawn: a picture laid over a campaign's sliced artwork has served its turn (the page now
  // draws the saved picture itself, or the slices again when the save kept the original).
  useEffect(() => {
    for (const cover of document.querySelectorAll("img[data-preview-overlay]")) cover.remove();
  }, [version]);
  // A page that reloaded itself (see `typed`) opens where it was, again once its pictures have taken their place.
  useEffect(() => {
    if (!parent) return;
    let saved: { path?: unknown; y?: unknown } | null = null;
    try {
      saved = JSON.parse(window.sessionStorage.getItem(reloadScrollKey) ?? "null");
      window.sessionStorage.removeItem(reloadScrollKey);
    } catch { saved = null; }
    if (!saved || saved.path !== window.location.pathname || typeof saved.y !== "number" || !Number.isFinite(saved.y)) return;
    const top = saved.y;
    const restore = () => (document.scrollingElement ?? document.documentElement).scrollTo?.({ top, behavior: "instant" });
    restore();
    window.addEventListener("load", restore, { once: true });
    return () => window.removeEventListener("load", restore);
  }, [parent]);
  // Hover outlines a section and places its Edit button at the section's top left, inside the viewport: in Edit only, as
  // Browse shows the page as visitors see it.
  useEffect(() => {
    if (!parent || !selectable || !editMode) { setHover(null); return; }
    let current: HTMLElement | null = null;
    const place = () => {
      if (!current) return;
      const rect = sectionBox(current).getBoundingClientRect();
      setHover({ section: current.dataset.homeSection ?? "", top: Math.max(8, rect.top + 8), left: Math.max(8, rect.left + 8) });
    };
    function onOver(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-preview-edit]")) return;
      const section = target?.closest<HTMLElement>("[data-home-section]") ?? null;
      if (section === current) return;
      current?.removeAttribute("data-preview-hover");
      current = section;
      current?.setAttribute("data-preview-hover", "true");
      if (current) place(); else setHover(null);
    }
    document.addEventListener("mouseover", onOver);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      document.removeEventListener("mouseover", onOver);
      window.removeEventListener("scroll", place);
      current?.removeAttribute("data-preview-hover");
    };
  }, [parent, selectable, editMode]);
  // Click-to-edit, as in a page builder: hovering words outlines them, clicking turns them into a text box right on the
  // page, and Enter (or clicking away) hands the new words to the editor, which types them into the field that holds
  // them. Esc puts them back. Links don't open while it is on; sliders, tabs and menus without words of their own still
  // work. Browse in the admin's toolbar turns it off.
  useEffect(() => {
    if (!parent || !selectable || !editMode) return;
    const origin = window.location.origin;
    const plainText = supportsPlainText();
    const layout = document.documentElement.getClientRects().length > 0;
    const visible = (node: Element) => !layout || node.getClientRects().length > 0;
    let editing: HTMLElement | null = null, hovered: HTMLElement | null = null, hoveredPicture: HTMLElement | null = null;
    let originalHtml = "", originalText = "", target: PreviewTextTarget | null = null;
    const post = (message: Record<string, unknown>) => parent!.postMessage({ source: previewMessageSource, ...message }, origin);
    /** Where the words sit and what surrounds them, so the editor can open the right screen and pick the right field. */
    function describe(node: HTMLElement): PreviewTextTarget {
      const words = squash(writtenText(node));
      const sectionNode = node.closest<HTMLElement>("[data-home-section]");
      const chrome = sectionNode ? undefined : chromeParts.find(([selector]) => node.closest(selector));
      const scope: Element = sectionNode ?? (chrome ? node.closest(chrome[0])! : document.body);
      const repeats = [...scope.querySelectorAll<HTMLElement>("*")].filter((leaf) => leaf === node || (editableWords(leaf) && visible(leaf) && squash(writtenText(leaf)) === words));
      let box: HTMLElement = node;
      for (let up = node.parentElement; up && scope.contains(up); up = up.parentElement) {
        if (repeats.some((other) => other !== node && up.contains(other))) break;
        box = up;
        if (up === scope) break;
      }
      return {
        path,
        section: sectionNode?.dataset.homeSection ?? null,
        area: sectionNode ? "section" : chrome ? chrome[1] : "page",
        context: squash(shownText(box)).slice(0, 3000),
        occurrence: Math.max(0, repeats.indexOf(node)),
        repeats: Math.min(1000, Math.max(1, repeats.length)),
        // The theme's own words carry their place (Site words); a form box carries its placeholder's.
        ...(siteWordOf(node) ? { word: siteWordOf(node) } : {}),
        // A slide's words name their own field, so the right slide's field is typed into (owner, 19 Nov 2026).
        ...(editFieldOf(node) ? { field: editFieldOf(node) } : {}),
      };
    }
    function onOver(event: MouseEvent) {
      const node = event.target instanceof Element ? event.target : null;
      // A picture staff chose is outlined as one to click; words drawn over it are outlined as words instead.
      const picture = node && !editableWords(node)
        ? node.closest<HTMLElement>("[data-media-slot], [data-picture-target]") ?? (isProductPhoto(node) ? null : node.closest<HTMLElement>("[data-media-slot-area]"))
        : null;
      if (picture !== hoveredPicture) {
        hoveredPicture?.removeAttribute("data-preview-media-hover");
        hoveredPicture = picture;
        hoveredPicture?.setAttribute("data-preview-media-hover", "true");
      }
      const next = !picture && node && editableWords(node) && !isProductPhoto(node) && node !== editing ? node : null;
      if (next === hovered) return;
      hovered?.removeAttribute("data-preview-text-hover");
      hovered = next;
      hovered?.setAttribute("data-preview-text-hover", "true");
    }
    function finish(keep: boolean) {
      const node = editing;
      if (!node) return;
      editing = null;
      editingNow.current = null;
      node.removeEventListener("keydown", onKey);
      node.removeEventListener("blur", onBlur);
      node.removeAttribute("contenteditable");
      node.removeAttribute("data-preview-editing");
      post({ type: "editing", active: false });
      const typed = keptText(writtenText(node));
      if (!keep || !typed || squash(typed) === squash(originalText) || !target) { node.innerHTML = originalHtml; return; }
      lastEdit.current = { node, html: originalHtml };
      typedHere.current = true;
      post({ type: "text-edit", before: squash(originalText).slice(0, 2000), after: typed.slice(0, 2000), ...target });
    }
    cancelEdit.current = () => finish(false);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finish(true); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
    }
    function onBlur() { finish(true); }
    function start(node: HTMLElement) {
      originalHtml = node.innerHTML;
      originalText = writtenText(node);
      target = describe(node);
      hovered?.removeAttribute("data-preview-text-hover");
      hovered = null;
      editing = node;
      editingNow.current = node;
      post({ type: "editing", active: true });
      post({ type: "text-select", text: squash(originalText).slice(0, 2000), ...target });
      node.setAttribute("contenteditable", plainText ? "plaintext-only" : "true");
      node.setAttribute("data-preview-editing", "true");
      node.addEventListener("keydown", onKey);
      node.addEventListener("blur", onBlur);
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    function onClick(event: MouseEvent) {
      const node = event.target instanceof Element ? event.target : null;
      if (!node || node.closest("[data-preview-edit]")) return;
      // Clicks inside the words being typed place the caret, as in any text box (the caret moves on mousedown). The click
      // itself goes no further: words inside a link used to open its page on the second click (owner, 16 Nov 2026).
      if (editing && editing.contains(node)) { event.preventDefault(); event.stopPropagation(); return; }
      // A form box whose grey words are the theme's (Site words): open their box in the editor; the form box still works.
      const box = node.closest<HTMLElement>("[data-site-word-placeholder]");
      if (box) {
        if (editing) finish(true);
        const placeholder = squash(box.getAttribute("placeholder") ?? "");
        if (placeholder) post({ type: "text-select", text: placeholder.slice(0, 2000), ...describe(box) });
        return;
      }
      // A picture staff chose (owner, 16 Nov 2026): an Artwork placement, a banner, a card, a slide, a post or a film opens
      // its picture chooser in the editor. Words drawn over a picture (a banner's headline) stay words to type over.
      const picture = editableWords(node) ? null : pictureOf(node);
      if (picture) {
        event.preventDefault();
        event.stopPropagation();
        if (editing) finish(true);
        post({ type: "media-select", ...picture, path });
        setNote("Choose the new picture in the library beside the preview.");
        return;
      }
      // A product's photo (a card on a collection page, the hero's featured piece, a product page): it comes from Keeri.
      // Say where it is changed, instead of a click that silently does nothing (owner, 19 Nov 2026).
      if (isProductPhoto(node)) {
        event.preventDefault();
        event.stopPropagation();
        if (editing) finish(true);
        setNote(productPhotoNote);
        return;
      }
      if (!editableWords(node)) {
        // A slider arrow, a tab or an accordion without words of its own keeps working, so every slide and panel can be
        // reached to edit. The header's search, account, wishlist and bag open nothing in Edit; neither does a link.
        if (node.closest("button, [role=button], [role=tab], summary, label") && !node.closest("a[href], .header-actions")) return;
        event.preventDefault();
        event.stopPropagation();
        if (editing) finish(true);
        // A picture or an empty area: open its section in the editor instead.
        const section = node.closest<HTMLElement>("[data-home-section]")?.dataset.homeSection;
        if (section) post({ type: "select", section });
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (editing) finish(true);
      start(node);
    }
    // In Edit a form never sends (a click on Send is words to edit; Enter in a box would still send) and a middle click
    // opens no link in a new tab: only Browse uses the page as a visitor would.
    function onSubmit(event: Event) {
      event.preventDefault();
      event.stopPropagation();
      setNote("Forms don't send in Edit. Choose Browse to try them.");
    }
    function onAuxClick(event: MouseEvent) {
      const node = event.target instanceof Element ? event.target : null;
      if (node?.closest("a[href]")) { event.preventDefault(); event.stopPropagation(); }
    }
    document.addEventListener("mouseover", onOver);
    // On the window, not the document: Next.js roots React at the document, so React's own capture listeners (the
    // preview's link capture among them) would run first there and follow the link before this could stop it.
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("auxclick", onAuxClick, true);
    return () => {
      document.removeEventListener("mouseover", onOver);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("auxclick", onAuxClick, true);
      hovered?.removeAttribute("data-preview-text-hover");
      hoveredPicture?.removeAttribute("data-preview-media-hover");
      // Switching to Browse keeps what was typed so far.
      finish(true);
      cancelEdit.current = () => {};
    };
  }, [parent, selectable, editMode, path]);
  if (!parent || !selectable) return null;
  return (
    <>
      {editMode ? (
        <p data-preview-hint="" data-preview-mode-pill="edit" aria-live="polite" className="pointer-events-none fixed right-3 bottom-8 z-[1001] m-0 inline-flex max-w-[min(520px,calc(100%-24px))] items-center gap-1.5 rounded-full bg-foreground/85 px-3 py-1.5 font-sans text-2xs font-semibold text-background shadow-md backdrop-blur">
          <Pencil aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
          {note || "Edit: click any text or picture to change it · Enter to keep · Esc to undo"}
        </p>
      ) : (
        // Browsing says so on the page too, so a click that opens a page is never a surprise.
        <p data-preview-mode-pill="browse" aria-live="polite" className="pointer-events-none fixed right-3 bottom-8 z-[1001] m-0 inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background/90 px-3 py-1.5 font-sans text-2xs font-semibold text-foreground shadow-md backdrop-blur">
          <MousePointer2 aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
          Browse: clicks open pages · choose Edit to change words and pictures
        </p>
      )}
      {hover?.section && (
        <button type="button" data-preview-edit="" style={{ top: hover.top, left: hover.left }}
          onClick={() => parent.postMessage({ source: previewMessageSource, type: "select", section: hover.section }, window.location.origin)}
          className="fixed z-[1001] inline-flex h-7 items-center gap-1.5 rounded-full bg-primary px-3 font-sans text-xs font-semibold text-primary-foreground shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">
          <Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Edit {sectionName(hover.section)}
        </button>
      )}
    </>
  );
}

/** The draft page with the draft's own navigation and footer, a slim ribbon, and in-frame links kept on the draft. */
export function PreviewFrameDocument({ token, version, path, siteChrome, menuArtwork, chromeArtwork, children, navigate, view = "draft" }: {
  token: string;
  version: number;
  path: string;
  siteChrome?: SiteChrome;
  menuArtwork?: MenuArtwork;
  chromeArtwork?: ChromeArtwork;
  children: ReactNode;
  navigate?: (url: string) => void;
  view?: "draft" | "published";
}) {
  // A click-to-edit save hands the page a newer token and version in place of a reload: links followed inside the
  // frame and the ribbon use them from then on.
  const [live, setLive] = useState({ token, version });
  useEffect(() => { setLive({ token, version }); }, [token, version]);
  return (
    // Storefront markup inside the frame is not the admin's to class, so the section highlight
    // reaches it with an arbitrary variant, on the section's own box (its wrapper is
    // display: contents); the ribbon sits in space reserved at the bottom.
    <div
      data-admin-tokens=""
      className="relative pb-[26px] [&_[data-home-section]>*]:scroll-mt-6 [&_[data-home-section][data-preview-highlight=true]>*]:shadow-[inset_0_0_0_9999px_var(--admin-accent-tint)] [&_[data-home-section][data-preview-highlight=true]>*]:outline-2 [&_[data-home-section][data-preview-highlight=true]>*]:-outline-offset-2 [&_[data-home-section][data-preview-highlight=true]>*]:outline-primary [&_[data-home-section][data-preview-highlight=true]>*]:outline-solid [&_[data-home-section][data-preview-hover=true]>*]:outline-1 [&_[data-home-section][data-preview-hover=true]>*]:-outline-offset-1 [&_[data-home-section][data-preview-hover=true]>*]:outline-primary/60 [&_[data-home-section][data-preview-hover=true]>*]:outline-dashed motion-safe:[&_[data-home-section]>*]:transition-shadow motion-safe:[&_[data-home-section]>*]:duration-500 [&_[data-preview-text-hover=true]]:cursor-text [&_[data-preview-text-hover=true]]:outline-1 [&_[data-preview-text-hover=true]]:outline-offset-2 [&_[data-preview-text-hover=true]]:outline-primary [&_[data-preview-text-hover=true]]:outline-dashed [&_[data-preview-editing=true]]:cursor-text [&_[data-preview-editing=true]]:rounded-[2px] [&_[data-preview-editing=true]]:outline-2 [&_[data-preview-editing=true]]:outline-offset-2 [&_[data-preview-editing=true]]:outline-primary [&_[data-preview-editing=true]]:outline-solid [&_[data-preview-media-hover=true]]:cursor-pointer [&_[data-preview-media-hover=true]]:outline-2 [&_[data-preview-media-hover=true]]:-outline-offset-2 [&_[data-preview-media-hover=true]]:outline-primary [&_[data-preview-media-hover=true]]:outline-dashed"
      data-preview-version={version}
      data-preview-path={path}
      data-preview-view={view}
    >
      <PreviewNavigation token={live.token} navigate={navigate} view={view}>
        <StoreChromeView path={path} siteChrome={siteChrome} menuArtwork={menuArtwork} chromeArtwork={chromeArtwork}>{children}</StoreChromeView>
        <p className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] m-0 bg-primary px-3 py-1 text-center font-sans text-2xs leading-[1.4] font-semibold tracking-[0.01em] text-primary-foreground" role="status">{view === "published" ? `Published storefront, version ${live.version}` : `Draft preview, not published. Version ${live.version}`}</p>
      </PreviewNavigation>
      <PreviewFrameBridge path={path} version={version} selectable={view === "draft"} onToken={(next, nextVersion) => setLive({ token: next, version: nextVersion })} />
    </div>
  );
}

/**
 * One homepage section on its own, for a section card's thumbnail. The address is served with a
 * policy that blocks the app bundles, so nothing here may depend on hydration: no ribbon, no link
 * capture, no bridge. It is inert: keyboard focus never enters a picture.
 */
export function SectionThumbnailDocument({ section, children }: { section: string; children: ReactNode }) {
  return <div data-section-thumbnail={section} inert className="pointer-events-none select-none">{children}</div>;
}
