"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen, ChevronDown, ChevronUp, CircleCheck, Eye, ExternalLink, FileText, Files, History, House, Image as ImageIcon, Images, Inbox, Instagram,
  LayoutDashboard, LayoutGrid, LogOut, Megaphone, PanelsTopLeft, Tags, TriangleAlert, X,
} from "lucide-react";
import {
  previewTokenPattern,
  storefrontContentSchema,
  type StorefrontContent,
} from "@shopmaple/contracts";
import { Field, CampaignFields, InstagramFields, PageFields } from "./forms";
import { SiteChromeFields } from "./site-chrome-fields";
import { CategoryFields } from "./category-fields";
import { StoryFields } from "./story-fields";
import { NimbusFields } from "./nimbus-fields";
import { ServicePageFields } from "./service-page-fields";
import { EditorialFields } from "./editorial-fields";
import { AuthoredArticleFields } from "./authored-article-fields";
import { HomeDetailsFields } from "./home-details-fields";
import { HomeCitiesLayoutFields } from "./home-cities-layout-fields";
import { HomeMerchandisingFields } from "./home-merchandising-fields";
import { MediaLibrary } from "./media-library";
import { TemplateArtworkFields } from "./template-artwork-fields";
import { EnquiryInbox } from "./enquiry-inbox";
import { CrmSummary } from "./crm-summary";
import { SortableList } from "./sortable-list";
import { LivePreview, type MintResult } from "./live-preview";
import { EmptyState, Skeleton, initials } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";
type Document = {
  version: number;
  draft: StorefrontContent | null;
  publishedVersion: number | null;
  updatedAt: string | null;
};
type Revision = {
  id: string;
  version: number;
  action: string;
  actorEmail: string;
  createdAt: string;
};
const tabs = [
  "Overview",
  "Homepage",
  "Navigation & footer",
  "Merchandising",
  "Artwork",
  "Campaigns",
  "Instagram",
  "Pages",
  "Existing pages",
  "Policies & blogs",
  "Category pages",
  "Media",
  "Enquiries",
  "History",
] as const;
type Tab = (typeof tabs)[number];
/** Sidebar structure: Overview on its own, then grouped sections. */
const navGroups: { label: string | null; items: Tab[] }[] = [
  { label: null, items: ["Overview"] },
  { label: "Storefront", items: ["Homepage", "Navigation & footer", "Merchandising", "Artwork", "Campaigns", "Instagram"] },
  { label: "Pages", items: ["Pages", "Existing pages", "Policies & blogs", "Category pages"] },
  { label: "Library", items: ["Media"] },
  { label: "Customers", items: ["Enquiries"] },
  { label: "Publishing", items: ["History"] },
];
const icons: Record<Tab, typeof House> = {
  Overview: LayoutDashboard,
  Homepage: House,
  "Navigation & footer": PanelsTopLeft,
  Merchandising: LayoutGrid,
  Artwork: ImageIcon,
  Campaigns: Megaphone,
  Instagram,
  Pages: FileText,
  "Existing pages": Files,
  "Policies & blogs": BookOpen,
  "Category pages": Tags,
  Media: Images,
  Enquiries: Inbox,
  History,
};
/** Sections whose edits show on a storefront page and can therefore use the live preview. */
const previewable = new Set<Tab>(["Overview", "Homepage", "Navigation & footer", "Merchandising", "Artwork", "Campaigns", "Instagram", "Pages", "Existing pages", "Policies & blogs", "Category pages"]);
const copyLabels: Record<keyof StorefrontContent["homeCopy"], string> = {
  categoryHeading: "Category heading",
  bestsellersHeading: "Bestsellers heading",
  chairsHeading: "Chairs heading",
  socialHeading: "Social heading",
  ticker: "Brand ticker",
  testimonialHeading: "Testimonial heading",
  testimonialSubheading: "Testimonial subheading",
};
export const titleCase = (value: string) =>
  value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
function parseDocument(value: unknown): Document {
  const document = value as Document;
  if (
    !document ||
    !Number.isSafeInteger(document.version) ||
    document.version < 0 ||
    !(
      document.updatedAt === null ||
      (typeof document.updatedAt === "string" &&
        document.updatedAt.length <= 64 &&
        Number.isFinite(Date.parse(document.updatedAt)))
    ) ||
    !(
      document.publishedVersion === null ||
      (Number.isSafeInteger(document.publishedVersion) &&
        document.publishedVersion >= 0 &&
        document.publishedVersion <= document.version)
    )
  )
    throw new Error("Invalid response");
  return {
    ...document,
    draft:
      document.draft === null
        ? null
        : storefrontContentSchema.parse(document.draft),
  };
}
/** A request the hook aborted because the component went away; never worth reporting. */
const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";

export function ContentEditor({
  session,
  initialContent,
  onExpired,
  account,
  livePreviewDebounceMs = 1200,
}: {
  session: StaffSession;
  initialContent: StorefrontContent;
  onExpired: () => void;
  /** The signed-in staff member's controls in the top bar; omitted in isolated tests. */
  account?: { onSignOut: () => void; busy: boolean };
  livePreviewDebounceMs?: number;
}) {
  const adminRequest = useAdminRequest();
  const [tab, setTab] = useState<Tab>("Overview");
  const [existingPage, setExistingPage] = useState<"story" | "nimbus" | "contact" | "bulk" | "returns">("story");
  const [document, setDocument] = useState<Document | null>(null);
  const [content, setContent] = useState<StorefrontContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewLink, setPreviewLink] = useState("");
  // PageFields starts on its first page each time the tab opens and reports later selections.
  const [selectedPage, setSelectedPage] = useState(0);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveAuto, setLiveAuto] = useState(true);
  const [liveBlocked, setLiveBlocked] = useState("");
  /** Phone width shows either the editor or the preview; wider screens show both. */
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [focusedSection, setFocusedSection] = useState<string | null>(null);
  /** A quiet (live preview) save in flight: shown in status, but never disables the form. */
  const [saving, setSaving] = useState(false);
  /** The last failed quiet save; auto-save pauses until a manual save succeeds. */
  const [autoSaveFailed, setAutoSaveFailed] = useState("");
  const inFlight = useRef(false);
  const loadSequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function acceptDocument(value: unknown) {
    const next = parseDocument(value);
    setDocument(next);
    setContent(structuredClone(next.draft ?? initialContent));
    setDirty(next.draft === null);
    setConflict(false);
  }
  async function load() {
    // Only the newest read may change state: an older read that was aborted (StrictMode's
    // first mount, a reload) must neither report nor clear the busy state of the one running.
    const sequence = ++loadSequence.current;
    const current = () => alive.current && sequence === loadSequence.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await adminRequest("/api/admin/content", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!current()) return;
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) throw new Error("Read failed");
      acceptDocument(await response.json());
    } catch (error) {
      if (aborted(error) || !current()) return;
      setError(
        error instanceof AdminRequestTimeout
          ? "Loading your draft timed out. Please try again."
          : "We couldn't load your draft. Please try again.",
      );
    } finally {
      if (current()) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [session.user.id]);
  useEffect(() => {
    if (!dirty && !scheduleEditing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, scheduleEditing]);
  async function history() {
    setTab("History");
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/content/revisions", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) throw new Error("Read failed");
      const result = await response.json();
      if (!Array.isArray(result.revisions)) throw new Error("Invalid history");
      setRevisions(result.revisions);
    } catch (error) {
      if (aborted(error) || !alive.current) return;
      setError(
        error instanceof AdminRequestTimeout
          ? "Loading revision history timed out. Open History to try again."
          : "We couldn't load revision history. Open History to try again.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function edit(next: StorefrontContent) {
    setContent(next);
    setDirty(true);
    setNotice("");
    setPreviewLink("");
  }
  /** Storefront address the preview opens on, chosen from what is being edited. */
  function previewPath() {
    if (tab === "Category pages") return "pages/sofas";
    if (tab === "Existing pages")
      return existingPage === "story" ? "pages/our-story"
        : existingPage === "nimbus" ? "pages/nimbus-collection"
        : existingPage === "contact" ? "pages/contact"
        : existingPage === "bulk" ? "pages/bulk-enquiry"
        : "pages/returns";
    if (tab === "Pages") {
      const page = [content?.pages[selectedPage], ...(content?.pages ?? [])].find((item) => item?.slug);
      if (page) return `pages/${encodeURIComponent(page.slug)}`;
    }
    return "home";
  }
  const previewTitle = tab === "Category pages" ? "Sofas" : tab === "Existing pages" ? "the selected page" : tab === "Pages" ? "the selected page" : "Home";
  /**
   * Mints a preview token for a draft version. Only an expired session is handled here (null);
   * every other outcome is returned so the caller can show it where it belongs. A 409 from
   * minting is never an editor conflict: either no draft exists yet (version 0) or the draft
   * moved on, and neither changes the local edits.
   */
  const mintPreviewToken = useCallback(async (version: number): Promise<MintResult | null> => {
    try {
      const response = await adminRequest("/api/admin/content/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ expectedVersion: version }),
      });
      if (response.status === 401) {
        onExpired();
        return null;
      }
      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
        return code === "CONTENT_DRAFT_REQUIRED"
          ? { ok: false, code: "draft-required", message: "Save the draft once to start the live preview." }
          : { ok: false, code: "conflict", message: "The draft changed since it was loaded. Reload the latest draft to preview it." };
      }
      if (response.status === 429) return { ok: false, code: "rate-limited", message: "Too many preview requests. Wait a minute, then retry." };
      if (!response.ok) throw new Error("Preview failed");
      const result: unknown = await response.json();
      const record = result && typeof result === "object" ? (result as { token?: unknown; expiresAt?: unknown }) : {};
      if (typeof record.token !== "string" || !previewTokenPattern.test(record.token)) throw new Error("Invalid preview token");
      return { ok: true, token: record.token, expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : "" };
    } catch (error) {
      if (aborted(error) || !alive.current) return null;
      return {
        ok: false,
        code: "unavailable",
        message: error instanceof AdminRequestTimeout
          ? "Opening the preview timed out. Please try again."
          : "We couldn't open the preview. Please try again.",
      };
    }
  }, [adminRequest, session.csrfToken, onExpired]);
  async function preview() {
    if (!document || !content || busy || conflict || scheduleEditing) return;
    setPreviewLink("");
    // Open the tab inside the click so pop-up blockers allow it; it navigates once the token exists.
    const popup = window.open("about:blank", "_blank");
    let version = document.version;
    if (dirty || document.draft === null) {
      const saved = await write("save");
      if (!saved) {
        popup?.close();
        return;
      }
      version = saved.version;
    }
    setBusy(true);
    setError("");
    const minted = await mintPreviewToken(version);
    if (alive.current) setBusy(false);
    if (!minted) {
      popup?.close();
      return;
    }
    if (!minted.ok) {
      popup?.close();
      setError(minted.message);
      return;
    }
    const url = `/admin/preview/${previewPath()}?token=${encodeURIComponent(minted.token)}`;
    if (popup) popup.location.href = url;
    else setPreviewLink(url);
  }
  async function write(
    action: "save" | "publish" | "restore",
    revisionId?: string,
    options: { quiet?: boolean } = {},
  ): Promise<Document | null> {
    if (!document || !content || busy || inFlight.current || conflict || scheduleEditing) return null;
    if (action === "save") {
      const validation = storefrontContentSchema.safeParse(content);
      if (!validation.success) {
        const issue = validation.error.issues[0];
        const message = `Check ${issue?.path.join(" > ") || "the content fields"}: ${issue?.message || "Some values are invalid."}`;
        if (options.quiet) setLiveBlocked(message);
        else setError(message);
        return null;
      }
    }
    // A quiet save (live preview) must never disable the form or move focus: it is shown in
    // the status chip only. Explicit saves, publishes and restores take the busy state.
    const quiet = options.quiet === true;
    inFlight.current = true;
    setLiveBlocked("");
    if (quiet) setSaving(true); else setBusy(true);
    if (!quiet) { setError(""); setNotice(""); }
    const fail = (message: string) => { if (quiet) setAutoSaveFailed(message); else setError(message); };
    try {
      const response = await adminRequest(
        `/api/admin/content${action === "save" ? "" : action === "publish" ? "/publish" : "/rollback"}`,
        {
          method: action === "save" ? "PUT" : "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrfToken,
          },
          body: JSON.stringify({
            expectedVersion: document.version,
            ...(action === "save"
              ? { content }
              : action === "restore"
                ? { revisionId }
                : {}),
          }),
        },
      );
      if (response.status === 401) {
        onExpired();
        return null;
      }
      if (response.status === 409) {
        setConflict(true);
        setError(
          "Another editor saved a newer version. Your changes are still here. Reload the latest draft before editing again; reloading discards these local changes.",
        );
        return null;
      }
      if (response.status === 403) {
        fail("Your permission or session has changed. Sign out and sign in again before continuing.");
        return null;
      }
      if (!response.ok) {
        fail(
          response.status === 400
            ? "Some content is invalid. Check your links and fields, then save again."
            : "We couldn't complete that change. Your local edits are still here. Please try again.",
        );
        return null;
      }
      const accepted = parseDocument(await response.json());
      acceptDocument(accepted);
      setAutoSaveFailed("");
      if (!quiet) setNotice(
        action === "save"
          ? "Draft saved. The published storefront has not changed."
          : action === "publish"
            ? "Draft published. The storefront now uses this version."
            : "Restored as a draft. Review it, then publish when ready.",
      );
      return accepted;
    } catch (error) {
      if (aborted(error) || !alive.current) return null;
      fail(
        error instanceof AdminRequestTimeout
          ? "The request timed out. Your local edits are still here. Please try again."
          : "We couldn't complete that change. Check your connection and try again. Your local edits are still here.",
      );
      return null;
    } finally {
      inFlight.current = false;
      if (alive.current) { if (quiet) setSaving(false); else setBusy(false); }
    }
  }
  // Live preview: save quietly after a pause in editing so the frame can show the edit.
  const liveActive = liveOpen && previewable.has(tab);
  // After a failed quiet save, auto-save stays paused (one persistent notice with a retry)
  // until a manual save succeeds, so an outage never becomes a stream of retries.
  useEffect(() => {
    if (!liveActive || !liveAuto || !dirty || autoSaveFailed || busy || saving || conflict || scheduleEditing || !document || !content) return;
    const timer = setTimeout(() => { void write("save", undefined, { quiet: true }); }, livePreviewDebounceMs);
    return () => clearTimeout(timer);
  }, [liveActive, liveAuto, dirty, autoSaveFailed, busy, saving, conflict, scheduleEditing, content, document, livePreviewDebounceMs]);
  useEffect(() => { if (!dirty) setLiveBlocked(""); }, [dirty]);

  const canManageEnquiries = session.user.canManageEnquiries === true;
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((name) => name !== "Enquiries" || canManageEnquiries) }))
    .filter((group) => group.items.length > 0);
  function selectTab(name: Tab) {
    if (name === "History") { void history(); return; }
    if (name === tab) return;
    setSelectedPage(0);
    setFocusedSection(null);
    setTab(name);
  }
  const navDisabled = (name: Tab) => scheduleEditing || (!content && name !== "Enquiries" && name !== "Overview");
  const roleLabel = session.user.role === "publisher" ? "Publisher" : "Editor";
  const unavailableDraft = busy ? (
    <div className="admin-empty" aria-busy="true">
      <p role="status" className="admin-sr-only">Loading store content</p>
      <Skeleton rows={4} />
    </div>
  ) : (
    <EmptyState title="Your draft is unavailable" action={<button type="button" onClick={() => void load()}>Retry loading draft</button>}>
      The draft could not be loaded. Check your connection, then try again.
    </EmptyState>
  );
  const navButton = (name: Tab) => {
    const Icon = icons[name];
    return (
      <button
        key={name}
        type="button"
        aria-current={tab === name ? "page" : undefined}
        disabled={navDisabled(name)}
        onClick={() => selectTab(name)}
      >
        <Icon aria-hidden="true" strokeWidth={1.5} />
        {name}
      </button>
    );
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <strong>Maple Furnishers</strong>
          <span>Shop admin</span>
        </a>
        <nav className="admin-nav" aria-label="Admin sections">
          {visibleGroups.map((group) =>
            group.label === null ? (
              <div className="admin-nav-group" key="top">{group.items.map(navButton)}</div>
            ) : (
              <div className="admin-nav-group" key={group.label} data-nav-group={group.label}>
                <p className="admin-nav-group-label">{group.label}</p>
                {group.items.map(navButton)}
              </div>
            ),
          )}
        </nav>
        <div className="admin-sidebar-foot">
          <span>{document?.publishedVersion ? `Live storefront on version ${document.publishedVersion}` : "Storefront not published yet"}</span>
          <a href="/" target="_blank" rel="noopener noreferrer">Open storefront <ExternalLink aria-hidden="true" strokeWidth={1.5} /></a>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar" data-admin-topbar>
          <div className="admin-topbar-context">
            <label className="admin-section-picker">
              <span className="admin-sr-only">Admin section</span>
              <select aria-label="Admin section" value={tab} onChange={(event) => selectTab(event.target.value as Tab)}>
                {visibleGroups.map((group) =>
                  group.label === null
                    ? group.items.map((name) => <option key={name} value={name} disabled={navDisabled(name)}>{name}</option>)
                    : (
                      <optgroup key={group.label} label={group.label}>
                        {group.items.map((name) => <option key={name} value={name} disabled={navDisabled(name)}>{name}</option>)}
                      </optgroup>
                    ),
                )}
              </select>
            </label>
            <div className="admin-status-group">
              <span className="admin-chip" data-draft-status data-tone={conflict ? "conflict" : busy || saving ? "saving" : dirty ? "unsaved" : "accent"}>
                {document ? `Draft version ${document.version}` : "Loading draft"}
                {conflict ? ", conflict" : busy || saving ? ", saving" : dirty ? ", unsaved changes" : ""}
              </span>
              <span className="admin-chip" data-publish-status data-tone={document?.publishedVersion ? "published" : "unpublished"}>
                {document?.publishedVersion ? `Published version ${document.publishedVersion}` : "Not published yet"}
              </span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <button
              type="button"
              className="admin-quiet"
              aria-pressed={liveOpen}
              disabled={!document || !content || !previewable.has(tab)}
              onClick={() => setLiveOpen((value) => !value)}
            >
              <Eye aria-hidden="true" strokeWidth={1.5} />
              Live preview
            </button>
            <button
              data-action="save"
              disabled={!content || !dirty || busy || saving || conflict || scheduleEditing}
              onClick={() => void write("save")}
            >
              Save draft
            </button>
            <button
              data-action="preview"
              disabled={!document || !content || busy || saving || conflict || scheduleEditing}
              onClick={() => void preview()}
            >
              Preview draft
            </button>
            {session.user.role === "publisher" && (
              <button
                className="admin-primary"
                disabled={!document?.version || dirty || busy || saving || conflict || scheduleEditing}
                onClick={() => void write("publish")}
              >
                Publish draft
              </button>
            )}
          </div>
          {account && (
            <div className="admin-account" data-staff-account>
              <span className="admin-avatar" data-avatar aria-hidden="true">{initials(session.user.email)}</span>
              <span className="admin-account-text">
                <strong>{session.user.email}</strong>
                <span>{roleLabel}</span>
              </span>
              <button type="button" className="admin-quiet admin-small" disabled={account.busy} onClick={account.onSignOut}>
                <LogOut aria-hidden="true" strokeWidth={1.5} />
                Sign out
              </button>
            </div>
          )}
        </header>
        <div className="admin-notices">
          {error && (
            <p role="alert" className="admin-alert">
              <TriangleAlert aria-hidden="true" strokeWidth={1.5} />
              <span>{error}</span>
              {conflict ? (
                <button type="button" className="admin-small admin-notice-action" onClick={() => void load()} disabled={busy}>Reload latest draft</button>
              ) : (
                <button type="button" className="admin-icon-button admin-notice-action" aria-label="Dismiss message" onClick={() => setError("")}><X aria-hidden="true" strokeWidth={1.5} /></button>
              )}
            </p>
          )}
          {autoSaveFailed && (
            <p role="alert" className="admin-alert" data-autosave-failed>
              <TriangleAlert aria-hidden="true" strokeWidth={1.5} />
              <span>Live updates are paused: the last save failed. {autoSaveFailed}</span>
              <button type="button" className="admin-small admin-notice-action" onClick={() => void write("save")} disabled={busy || saving || conflict || !dirty}>Retry save</button>
            </p>
          )}
          {notice && (
            <p role="status" className="admin-notice">
              <CircleCheck aria-hidden="true" strokeWidth={1.5} />
              <span>{notice}</span>
              <button type="button" className="admin-icon-button admin-notice-action" aria-label="Dismiss message" onClick={() => setNotice("")}><X aria-hidden="true" strokeWidth={1.5} /></button>
            </p>
          )}
          {previewLink && (
            <p role="status" className="admin-notice" data-tone="info">
              <span>
                Your browser blocked the preview tab.{" "}
                <a href={previewLink} target="_blank" rel="noopener noreferrer">
                  Open draft preview
                </a>
              </span>
            </p>
          )}
        </div>
        {!content && !canManageEnquiries ? (
          <div className="admin-workspace"><section className="admin-panel" data-admin-panel>{unavailableDraft}</section></div>
        ) : (
          <div className="admin-workspace" data-split={liveActive ? "true" : "false"} data-mobile-pane={liveActive ? mobilePane : undefined}>
            {liveActive && (
              <div className="admin-segmented admin-mobile-pane-toggle" role="group" aria-label="Show editor or preview">
                <button type="button" aria-pressed={mobilePane === "editor"} onClick={() => setMobilePane("editor")}>Editor</button>
                <button type="button" aria-pressed={mobilePane === "preview"} onClick={() => setMobilePane("preview")}>Preview</button>
              </div>
            )}
            <section
              className="admin-panel"
              data-admin-panel
              data-wide={tab === "Enquiries" ? "true" : undefined}
              aria-label={`${tab} editor`}
              onFocusCapture={(event) => {
                const row = (event.target as HTMLElement).closest?.("[data-preview-section]");
                if (row instanceof HTMLElement) setFocusedSection(row.dataset.previewSection ?? null);
              }}
            >
              {tab === "Enquiries" && canManageEnquiries ? (
                <EnquiryInbox session={session} onExpired={onExpired} />
              ) : !content ? unavailableDraft : (
              <fieldset disabled={busy || conflict}>
                <legend className="admin-sr-only">{tab} editor</legend>
                {tab === "Overview" && (
                  <OverviewPanel content={content} session={session} onExpired={onExpired} document={document} dirty={dirty} />
                )}
                {tab === "Navigation & footer" && <SiteChromeFields value={content.siteChrome} onChange={siteChrome => {
                  const next = {...content};
                  if (siteChrome === undefined) delete next.siteChrome;
                  else next.siteChrome = siteChrome;
                  edit(next);
                }} />}
                {tab === "Homepage" && (
                  <>
                    <div className="admin-panel-head">
                      <div>
                        <h2>Homepage</h2>
                        <p>Drag sections into order, or use the Move buttons, and choose what visitors see. Focus a section to find it in the live preview.</p>
                      </div>
                    </div>
                    <SortableList
                      items={content.homeSections}
                      getId={(section) => section.key}
                      getLabel={(section) => titleCase(section.key)}
                      className="admin-section-list"
                      onReorder={(homeSections) => edit({ ...content, homeSections })}
                      rowProps={(section) => ({ "data-preview-section": section.key, "data-preview-focused": focusedSection === section.key ? "true" : undefined })}
                      renderItem={(section, index, handle) => (
                        <>
                          {handle}
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Show ${titleCase(section.key)}`}
                              checked={section.enabled}
                              onChange={(e) =>
                                edit({
                                  ...content,
                                  homeSections: content.homeSections.map((s) =>
                                    s.key === section.key
                                      ? { ...s, enabled: e.target.checked }
                                      : s,
                                  ),
                                })
                              }
                            />
                            <span>{titleCase(section.key)}</span>
                          </label>
                          <div className="admin-row-actions">
                            {([-1, 1] as const).map((direction) => (
                              <button
                                key={direction}
                                type="button"
                                aria-label={`Move ${titleCase(section.key)} ${direction === -1 ? "up" : "down"}`}
                                title={direction === -1 ? "Move up" : "Move down"}
                                disabled={
                                  index + direction < 0 ||
                                  index + direction >= content.homeSections.length
                                }
                                onClick={() => {
                                  const sections = [...content.homeSections];
                                  [sections[index], sections[index + direction]] =
                                    [
                                      sections[index + direction]!,
                                      sections[index]!,
                                    ];
                                  edit({ ...content, homeSections: sections });
                                }}
                              >
                                {direction === -1 ? <ChevronUp aria-hidden="true" strokeWidth={1.5} /> : <ChevronDown aria-hidden="true" strokeWidth={1.5} />}
                                <span className="admin-sr-only">{direction === -1 ? "Move up" : "Move down"}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    />
                    <h3>Homepage copy</h3>
                    <div className="admin-fields">
                      {(
                        Object.keys(
                          copyLabels,
                        ) as (keyof StorefrontContent["homeCopy"])[]
                      ).map((key) => (
                        <Field
                          key={key}
                          label={copyLabels[key]}
                          value={content.homeCopy[key] ?? "Chairs"}
                          multiline={key === "ticker"}
                          maxLength={
                            key === "ticker"
                              ? 600
                              : key === "testimonialSubheading"
                                ? 300
                                : 160
                          }
                          onChange={(value) =>
                            edit({
                              ...content,
                              homeCopy: { ...content.homeCopy, [key]: value },
                            })
                          }
                        />
                      ))}
                    </div>
                    <HomeDetailsFields value={content.homeDetails} onChange={homeDetails => edit({ ...content, homeDetails })} />
                    <HomeCitiesLayoutFields value={content.homeCitiesLayout} onChange={homeCitiesLayout => edit({ ...content, homeCitiesLayout })} />
                    <h3>Motion</h3>
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={content.motion.autoplayTicker ?? true}
                        onChange={(event) => edit({ ...content, motion: {
                          ...content.motion, autoplayTicker: event.target.checked,
                        } })}
                      />
                      Automatically move the homepage ticker
                    </label>
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={content.motion.autoplaySocial}
                        onChange={(e) =>
                          edit({
                            ...content,
                            motion: {
                              ...content.motion,
                              autoplaySocial: e.target.checked,
                            },
                          })
                        }
                      />
                      Automatically move Instagram posts
                    </label>
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={content.motion.autoplayCities}
                        onChange={(e) =>
                          edit({
                            ...content,
                            motion: {
                              ...content.motion,
                              autoplayCities: e.target.checked,
                            },
                          })
                        }
                      />
                      Automatically move city illustrations
                    </label>
                    <p>
                      Visitors can pause motion. Their reduced-motion preference
                      takes priority.
                    </p>
                    <label className="admin-check">
                      <input type="checkbox" checked={content.motion.revealSections}
                        onChange={(event) => edit({ ...content, motion: {
                          ...content.motion, revealSections: event.target.checked,
                        } })} />
                      Section reveal effects
                    </label>
                  </>
                )}
                {tab === "Merchandising" && (
                  <HomeMerchandisingFields value={content.homeMerchandising} onChange={homeMerchandising => edit({ ...content, homeMerchandising })} session={session} onExpired={onExpired} />
                )}
                {tab === "Campaigns" && (
                  <CampaignFields
                    content={content}
                    onChange={edit}
                    session={session}
                    onExpired={onExpired}
                    onScheduleEditingChange={setScheduleEditing}
                  />
                )}
                {tab === "Instagram" && (
                  <InstagramFields
                    content={content}
                    onChange={edit}
                    session={session}
                    onExpired={onExpired}
                  />
                )}
                {tab === "Pages" && (
                  <PageFields
                    content={content}
                    onChange={edit}
                    session={session}
                    onExpired={onExpired}
                    onSelectedPageChange={setSelectedPage}
                  />
                )}
                {tab === "Category pages" && (
                  <CategoryFields
                    value={content.landingPages}
                    onChange={(landingPages) =>
                      edit({ ...content, landingPages })
                    }
                  />
                )}
                {tab === "Existing pages" && (
                  <>
                    <div className="admin-panel-head">
                      <div>
                        <h2>Existing pages</h2>
                        <p>Edit the storefront pages that ship with the theme. Changes stay in your draft until published.</p>
                      </div>
                    </div>
                    <label className="admin-field">
                      <span>Existing page</span>
                      <select aria-label="Existing page" value={existingPage} onChange={event => {
                        const value = event.target.value;
                        setExistingPage(value === "nimbus" || value === "contact" || value === "bulk" || value === "returns" ? value : "story");
                      }}>
                        <option value="story">Our Story</option>
                        <option value="nimbus">The Nimbus Collection</option>
                        <option value="contact">Contact</option>
                        <option value="bulk">Bulk Enquiry</option>
                        <option value="returns">Return &amp; Exchange</option>
                      </select>
                    </label>
                    {existingPage === "story"
                      ? <StoryFields value={content.storyPage} onChange={storyPage => edit({ ...content, storyPage })} />
                      : existingPage === "nimbus"
                        ? <NimbusFields value={content.nimbusPage} onChange={nimbusPage => edit({ ...content, nimbusPage })} />
                        : <ServicePageFields key={existingPage} page={existingPage} value={content.servicePages} onChange={servicePages => edit({ ...content, servicePages })} />}
                  </>
                )}
                {tab === "Artwork" && (
                  <TemplateArtworkFields value={content.templateMedia} onChange={templateMedia => edit({ ...content, templateMedia })} session={session} onExpired={onExpired} />
                )}
                {tab === "Media" && (
                  <MediaLibrary session={session} onExpired={onExpired} heading="h2" />
                )}
                {tab === "Policies & blogs" && (
                  <>
                    <div className="admin-panel-head">
                      <div>
                        <h2>Policies &amp; blogs</h2>
                        <p>Policies, blog indexes and authored articles share the storefront's editorial layout.</p>
                      </div>
                    </div>
                    <EditorialFields value={content.editorialContent} onChange={editorialContent => edit({ ...content, editorialContent })} />
                    <AuthoredArticleFields value={content.authoredArticles} onChange={authoredArticles => edit({ ...content, authoredArticles })} session={session} onExpired={onExpired} />
                  </>
                )}
                {tab === "History" && (
                  <>
                    <div className="admin-panel-head">
                      <div>
                        <h2>Revision history</h2>
                        <p>
                          Restore saved content as a new draft. Save local changes
                          before restoring.
                        </p>
                      </div>
                    </div>
                    {busy && revisions.length === 0 ? (
                      <Skeleton rows={3} />
                    ) : revisions.length === 0 ? (
                      <EmptyState title="No revisions yet">Save a draft to start its history.</EmptyState>
                    ) : (
                      <ul className="admin-history">
                        {revisions.map((revision) => (
                          <li key={revision.id}>
                            <span className="admin-history-version" aria-hidden="true">{revision.version}</span>
                            <div>
                              <strong>
                                Version {revision.version}, {titleCase(revision.action)}
                              </strong>
                              <span>
                                {revision.actorEmail}, {new Date(revision.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {session.user.role === "publisher" && (
                              <button
                                className="admin-small"
                                disabled={dirty}
                                onClick={() => void write("restore", revision.id)}
                              >
                                Restore version {revision.version}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </fieldset>
              )}
            </section>
            {liveActive && (
              <LivePreview
                path={previewPath()}
                title={previewTitle}
                version={document?.version ?? null}
                publishedVersion={document?.publishedVersion ?? null}
                draftRequired={document?.draft === null}
                dirty={dirty}
                busy={busy || saving}
                blocked={liveBlocked}
                auto={liveAuto}
                onAutoChange={setLiveAuto}
                onUpdateNow={() => void write("save", undefined, { quiet: true })}
                onClose={() => setLiveOpen(false)}
                mint={mintPreviewToken}
                focusedSection={focusedSection}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewPanel({ content, session, onExpired, document, dirty }: {
  content: StorefrontContent;
  session: StaffSession;
  onExpired: () => void;
  document: Document | null;
  dirty: boolean;
}) {
  const visible = content.homeSections.filter((s) => s.enabled).length;
  const stat = (label: string, value: ReactNode, note: string) => (
    <div className="admin-stat">
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{value}<small>{note}</small></span>
    </div>
  );
  return (
    <>
      <div className="admin-panel-head">
        <div>
          <h2>Overview</h2>
          <p>What is in the draft right now, and where the storefront stands.</p>
        </div>
      </div>
      <div className="admin-overview-grid" role="group" aria-label="Draft summary">
        {stat("Homepage sections", visible, `visible of ${content.homeSections.length}`)}
        {stat("Campaigns", content.campaigns.length, "editable")}
        {stat("Informational pages", content.pages.length, content.pages.length === 1 ? "page" : "pages")}
      </div>
      {session.user.canManageEnquiries === true && <CrmSummary session={session} onExpired={onExpired} />}
      <div className="admin-overview-cols">
        <div className="admin-overview-card">
          <h3>Publishing</h3>
          <p>
            {session.user.role === "publisher"
              ? "You can edit and publish. Save any unsaved changes before publishing."
              : "You can edit and save drafts. A publisher must publish your changes."}
          </p>
          <p>
            Restoring a revision creates a draft. It does not change the
            live storefront until published.
          </p>
          <p>
            {document?.publishedVersion
              ? `The storefront is on version ${document.publishedVersion}; the draft is version ${document.version}${dirty ? " with unsaved changes" : ""}.`
              : "Nothing is published yet. Visitors see the bundled storefront content until the first publish."}
          </p>
        </div>
        <div className="admin-overview-card">
          <h3>Storefront</h3>
          <p>Open the live storefront in a new tab, or use Live preview in the top bar to see the draft beside the editor.</p>
          <div className="admin-actions">
            <a href="/" target="_blank" rel="noopener noreferrer">
              Open storefront
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
