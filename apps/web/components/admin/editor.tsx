"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen, CircleCheck, Ellipsis, Eye, FileText, Files, History, House, Image as ImageIcon, Images, Inbox, Instagram,
  ExternalLink, LayoutDashboard, LayoutGrid, Megaphone, PanelsTopLeft, Save, Sparkles, Tags, TriangleAlert, Upload, X,
} from "lucide-react";
import {
  previewTokenPattern,
  homeSectionKeys,
  storefrontContentSchema,
  type StorefrontContent,
} from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { DisabledScope } from "@/components/ui/disabled-scope";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { CampaignFields, InstagramFields, PageFields } from "./forms";
import { SiteChromeFields } from "./site-chrome-fields";
import { CategoryFields } from "./category-fields";
import { StoryFields } from "./story-fields";
import { NimbusFields } from "./nimbus-fields";
import { ServicePageFields } from "./service-page-fields";
import { EditorialFields } from "./editorial-fields";
import { AuthoredArticleFields } from "./authored-article-fields";
import { HomeMerchandisingFields } from "./home-merchandising-fields";
import { ProductHighlightsFields, highlightsSaveMessage } from "./product-highlights-fields";
import { MediaLibrary } from "./media-library";
import { TemplateArtworkFields } from "./template-artwork-fields";
import { EnquiryInbox } from "./enquiry-inbox";
import { LivePreview } from "./live-preview";
import { usePreviewToken, type MintResult } from "./use-preview-token";
import { AdminSidebar, CommandPalette, SectionPicker, StaffMenu, StatusChip, SidebarTrigger } from "./admin-shell";
import { EmptyState, Notice, Skeleton } from "./crm-primitives";
import { HistoryPanel, type Revision } from "./history-panel";
import { HomepagePanel } from "./homepage-panel";
import type { HomeSectionKey } from "@/lib/section-thumbnails";
import { OverviewPanel } from "./overview-panel";
import { PanelHeader, SelectField } from "./kit";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";
export { titleCase } from "./homepage-panel";
type Document = {
  version: number;
  draft: StorefrontContent | null;
  publishedVersion: number | null;
  updatedAt: string | null;
};
const tabs = [
  "Overview", "Homepage", "Navigation & footer", "Merchandising", "Product highlights", "Artwork", "Campaigns", "Instagram",
  "Pages", "Existing pages", "Policies & blogs", "Category pages", "Media", "Enquiries", "History",
] as const;
type Tab = (typeof tabs)[number];
/** Sidebar structure: Overview on its own, then grouped sections. */
const navGroups: { label: string | null; items: Tab[] }[] = [
  { label: null, items: ["Overview"] },
  { label: "Storefront", items: ["Homepage", "Navigation & footer", "Merchandising", "Product highlights", "Artwork", "Campaigns", "Instagram"] },
  { label: "Pages", items: ["Pages", "Existing pages", "Policies & blogs", "Category pages"] },
  { label: "Library", items: ["Media"] },
  { label: "Customers", items: ["Enquiries"] },
  { label: "Publishing", items: ["History"] },
];
const icons: Record<Tab, typeof House> = {
  Overview: LayoutDashboard, Homepage: House, "Navigation & footer": PanelsTopLeft, Merchandising: LayoutGrid, "Product highlights": Sparkles, Artwork: ImageIcon,
  Campaigns: Megaphone, Instagram, Pages: FileText, "Existing pages": Files, "Policies & blogs": BookOpen, "Category pages": Tags,
  Media: Images, Enquiries: Inbox, History,
};
/** The theme's own pages on the Existing pages screen, with the storefront address each previews. */
const existingPages = [
  ["story", "Our Story", "pages/our-story"], ["nimbus", "The Nimbus Collection", "pages/nimbus-collection"], ["contact", "Contact", "pages/contact"],
  ["bulk", "Bulk Enquiry", "pages/bulk-enquiry"], ["returns", "Return & Exchange", "pages/returns"],
] as const;
type ExistingPage = (typeof existingPages)[number][0];
/** Sections whose edits show on a storefront page and can therefore use the live preview. */
const previewable = new Set<Tab>(["Overview", "Homepage", "Navigation & footer", "Merchandising", "Product highlights", "Artwork", "Campaigns", "Instagram", "Pages", "Existing pages", "Policies & blogs", "Category pages"]);
function parseDocument(value: unknown): Document {
  const document = value as Document;
  const validUpdatedAt = document?.updatedAt === null || (typeof document?.updatedAt === "string" && document.updatedAt.length <= 64 && Number.isFinite(Date.parse(document.updatedAt)));
  const validPublished = document?.publishedVersion === null || (Number.isSafeInteger(document?.publishedVersion) && document.publishedVersion! >= 0 && document.publishedVersion! <= document.version);
  if (!document || !Number.isSafeInteger(document.version) || document.version < 0 || !validUpdatedAt || !validPublished) throw new Error("Invalid response");
  return { ...document, draft: document.draft === null ? null : storefrontContentSchema.parse(document.draft) };
}
/** A request the hook aborted because the component went away; never worth reporting. */
const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";

export function ContentEditor({ session, initialContent, onExpired, account, livePreviewDebounceMs = 1200 }: {
  session: StaffSession;
  initialContent: StorefrontContent;
  onExpired: () => void;
  /** The signed-in staff member's controls in the top bar; omitted in isolated tests. */
  account?: { onSignOut: () => void; busy: boolean };
  livePreviewDebounceMs?: number;
}) {
  const adminRequest = useAdminRequest();
  const [tab, setTab] = useState<Tab>("Overview");
  const [existingPage, setExistingPage] = useState<ExistingPage>("story");
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
  /** The homepage section whose inspector fills the editor column, or null for the section list. */
  const [inspecting, setInspecting] = useState<HomeSectionKey | null>(null);
  /** A quiet (live preview) save in flight: shown in status, but never disables the form. */
  const [saving, setSaving] = useState(false);
  /** The last failed quiet save; auto-save pauses until a manual save succeeds. */
  const [autoSaveFailed, setAutoSaveFailed] = useState("");
  const inFlight = useRef(false);
  const loadSequence = useRef(0);
  /** The latest local content, so a finished quiet save can tell whether edits arrived meanwhile. */
  const latestContent = useRef<StorefrontContent | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function acceptDocument(value: unknown) {
    const next = parseDocument(value);
    setDocument(next);
    const draft = structuredClone(next.draft ?? initialContent);
    latestContent.current = draft;
    setContent(draft);
    setDirty(next.draft === null);
    setConflict(false);
  }
  /**
   * A quiet save accepts only the server's version and metadata, never its copy of the
   * content: anything typed while the save was in flight must survive. If edits arrived
   * meanwhile the draft stays dirty, so the next quiet save follows with the new version.
   */
  function acceptQuietSave(value: unknown, sent: StorefrontContent) {
    const next = parseDocument(value);
    setDocument(next);
    setConflict(false);
    setDirty(latestContent.current !== sent);
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
      const response = await adminRequest("/api/admin/content", { cache: "no-store", credentials: "same-origin" });
      if (!current()) return;
      if (response.status === 401) return onExpired();
      if (!response.ok) throw new Error("Read failed");
      acceptDocument(await response.json());
    } catch (error) {
      if (aborted(error) || !current()) return;
      setError(error instanceof AdminRequestTimeout ? "Loading your draft timed out. Please try again." : "We couldn't load your draft. Please try again.");
    } finally {
      if (current()) setBusy(false);
    }
  }
  useEffect(() => { void load(); }, [session.user.id]);
  useEffect(() => {
    if (!dirty && !scheduleEditing) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, scheduleEditing]);
  async function history() {
    setTab("History");
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/content/revisions", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) return onExpired();
      if (!response.ok) throw new Error("Read failed");
      const result = await response.json();
      if (!Array.isArray(result.revisions)) throw new Error("Invalid history");
      setRevisions(result.revisions);
    } catch (error) {
      if (aborted(error) || !alive.current) return;
      setError(error instanceof AdminRequestTimeout ? "Loading revision history timed out. Open History to try again." : "We couldn't load revision history. Open History to try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function edit(next: StorefrontContent) {
    latestContent.current = next;
    setContent(next);
    setDirty(true);
    setNotice("");
    setPreviewLink("");
  }
  /** Storefront address the preview opens on, chosen from what is being edited. */
  function previewPath() {
    if (tab === "Category pages") return "pages/sofas";
    if (tab === "Existing pages") return existingPages.find(([key]) => key === existingPage)![2];
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
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ expectedVersion: version }),
      });
      if (response.status === 401) { onExpired(); return null; }
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
      return { ok: false, code: "unavailable", message: error instanceof AdminRequestTimeout ? "Opening the preview timed out. Please try again." : "We couldn't open the preview. Please try again." };
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
      if (!saved) return popup?.close();
      version = saved.version;
    }
    setBusy(true);
    setError("");
    const minted = await mintPreviewToken(version);
    if (alive.current) setBusy(false);
    if (!minted || !minted.ok) {
      popup?.close();
      if (minted) setError(minted.message);
      return;
    }
    const url = `/admin/preview/${previewPath()}?token=${encodeURIComponent(minted.token)}`;
    if (popup) popup.location.href = url;
    else setPreviewLink(url);
  }
  async function write(action: "save" | "publish" | "restore", revisionId?: string, options: { quiet?: boolean } = {}): Promise<Document | null> {
    if (!document || !content || busy || inFlight.current || conflict || scheduleEditing) return null;
    if (action === "save") {
      const validation = storefrontContentSchema.safeParse(content);
      if (!validation.success) {
        const issue = validation.error.issues[0];
        const message = issue?.path[0] === "productHighlights" ? highlightsSaveMessage
          : `Check ${issue?.path.join(" > ") || "the content fields"}: ${issue?.message || "Some values are invalid."}`;
        if (options.quiet) setLiveBlocked(message);
        else setError(message);
        return null;
      }
    }
    // A quiet save (live preview) must never disable the form or move focus: it is shown in
    // the status chip only. Explicit saves, publishes and restores take the busy state.
    const quiet = options.quiet === true;
    const sent = content;
    inFlight.current = true;
    setLiveBlocked("");
    if (quiet) setSaving(true); else setBusy(true);
    if (!quiet) { setError(""); setNotice(""); }
    const fail = (message: string) => { if (quiet) setAutoSaveFailed(message); else setError(message); };
    try {
      const response = await adminRequest(`/api/admin/content${action === "save" ? "" : action === "publish" ? "/publish" : "/rollback"}`, {
        method: action === "save" ? "PUT" : "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ expectedVersion: document.version, ...(action === "save" ? { content } : action === "restore" ? { revisionId } : {}) }),
      });
      if (response.status === 401) { onExpired(); return null; }
      if (response.status === 409) {
        setConflict(true);
        setError("Another editor saved a newer version. Your changes are still here. Reload the latest draft before editing again; reloading discards these local changes.");
        return null;
      }
      if (!response.ok) {
        fail(response.status === 403 ? "Your permission or session has changed. Sign out and sign in again before continuing."
          : response.status === 400 ? "Some content is invalid. Check your links and fields, then save again."
          : "We couldn't complete that change. Your local edits are still here. Please try again.");
        return null;
      }
      const raw: unknown = await response.json();
      const accepted = parseDocument(raw);
      if (quiet && action === "save") acceptQuietSave(raw, sent!);
      else acceptDocument(raw);
      setAutoSaveFailed("");
      if (!quiet) setNotice(action === "save" ? "Draft saved. The published storefront has not changed."
        : action === "publish" ? "Draft published. The storefront now uses this version." : "Restored as a draft. Review it, then publish when ready.");
      return accepted;
    } catch (error) {
      if (aborted(error) || !alive.current) return null;
      fail(error instanceof AdminRequestTimeout ? "The request timed out. Your local edits are still here. Please try again."
        : "We couldn't complete that change. Check your connection and try again. Your local edits are still here.");
      return null;
    } finally {
      inFlight.current = false;
      if (alive.current) { if (quiet) setSaving(false); else setBusy(false); }
    }
  }
  // Live preview: save quietly after a pause in editing so the frame can show the edit.
  const liveActive = liveOpen && previewable.has(tab);
  /** Visible section thumbnails need the preview token too; the rail reports when one is on screen. */
  const [thumbnailsWanted, setThumbnailsWanted] = useState(false);
  const wantThumbnails = useCallback(() => setThumbnailsWanted(true), []);
  const previewToken = usePreviewToken({
    version: document?.version ?? null,
    draftRequired: document?.draft === null,
    active: liveActive || (tab === "Homepage" && thumbnailsWanted),
    mint: mintPreviewToken,
  });
  // After a failed quiet save, auto-save stays paused (one persistent notice with a retry)
  // until a manual save succeeds, so an outage never becomes a stream of retries.
  useEffect(() => {
    // Version 0 (no draft ever saved) is never saved silently: the pane offers that first save explicitly.
    if (!liveActive || !liveAuto || !dirty || autoSaveFailed || busy || saving || conflict || scheduleEditing || !document || document.draft === null || !content) return;
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
    setInspecting(null);
    setTab(name);
  }
  const navDisabled = (name: Tab) => scheduleEditing || (!content && name !== "Enquiries" && name !== "Overview");
  const roleLabel = session.user.role === "publisher" ? "Publisher" : "Editor";
  const unavailableDraft = busy ? (
    <div aria-busy="true">
      <p role="status" className="sr-only">Loading store content</p>
      <Skeleton rows={4} />
    </div>
  ) : (
    <EmptyState title="Your draft is unavailable" icon={<TriangleAlert strokeWidth={1.5} />} action={<Button type="button" variant="outline" onClick={() => void load()}>Retry loading draft</Button>}>
      The draft could not be loaded. Check your connection, then try again.
    </EmptyState>
  );
  const saveDisabled = !content || !dirty || busy || saving || conflict || scheduleEditing;
  const previewDisabled = !document || !content || busy || saving || conflict || scheduleEditing;
  const publishDisabled = !document?.version || dirty || busy || saving || conflict || scheduleEditing;
  const draftTone = conflict ? "conflict" : busy || saving ? "saving" : dirty ? "unsaved" : "accent";
  const draftScreen = previewable.has(tab);
  const liveDisabled = !document || !content || !draftScreen;
  const publisher = session.user.role === "publisher";
  /** After the palette navigates, the new screen's heading takes focus (never the page body). */
  const focusPanelHeading = () => requestAnimationFrame(() => {
    const heading = window.document.querySelector<HTMLElement>("[data-admin-panel] h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  });
  // One width rule for every screen: full width up to 1180 px; beside the live preview, the split decides.
  const panelClass = cn("min-w-0 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-7", !liveActive && "max-w-[1180px]");

  /** The draft editor for the current screen (Enquiries renders outside the draft). */
  function screen() {
    if (!content) return null;
    const set = <K extends keyof StorefrontContent>(key: K) => (value: StorefrontContent[K]) => edit({ ...content, [key]: value });
    switch (tab) {
      case "Overview": return <OverviewPanel content={content} session={session} onExpired={onExpired} version={document?.version ?? null} publishedVersion={document?.publishedVersion ?? null} dirty={dirty} />;
      case "Homepage": return <HomepagePanel content={content} edit={edit} focusedSection={focusedSection} onSelectSection={setFocusedSection}
        inspecting={inspecting} onInspect={setInspecting} session={session} onExpired={onExpired} onScheduleEditingChange={setScheduleEditing} thumbnails={{ token: previewToken.token, dirty, unavailable: document?.draft === null || previewToken.error !== null, onWanted: wantThumbnails }} />;
      case "Navigation & footer": return <SiteChromeFields value={content.siteChrome} onChange={(siteChrome) => {
        const next = { ...content };
        if (siteChrome === undefined) delete next.siteChrome; else next.siteChrome = siteChrome;
        edit(next);
      }} />;
      case "Merchandising": return <HomeMerchandisingFields value={content.homeMerchandising} onChange={set("homeMerchandising")} session={session} onExpired={onExpired} />;
      case "Product highlights": return <ProductHighlightsFields value={content.productHighlights} onChange={set("productHighlights")} onExpired={onExpired} />;
      case "Artwork": return <TemplateArtworkFields value={content.templateMedia} onChange={set("templateMedia")} session={session} onExpired={onExpired} />;
      case "Campaigns": return <CampaignFields content={content} onChange={edit} session={session} onExpired={onExpired} onScheduleEditingChange={setScheduleEditing} />;
      case "Instagram": return <InstagramFields content={content} onChange={edit} session={session} onExpired={onExpired} />;
      case "Pages": return <PageFields content={content} onChange={edit} session={session} onExpired={onExpired} onSelectedPageChange={setSelectedPage} />;
      case "Category pages": return <CategoryFields value={content.landingPages} onChange={set("landingPages")} />;
      case "Media": return <MediaLibrary session={session} onExpired={onExpired} heading="h2" />;
      case "History": return <HistoryPanel revisions={revisions} loading={busy} canRestore={publisher} dirty={dirty} current={content} onRestore={(id) => void write("restore", id)} onExpired={onExpired} />;
      case "Policies & blogs": return <>
        <PanelHeader title="Policies & blogs" description="Policies, blog indexes and authored articles share the storefront's editorial layout." />
        <EditorialFields value={content.editorialContent} onChange={set("editorialContent")} />
        <AuthoredArticleFields value={content.authoredArticles} onChange={set("authoredArticles")} session={session} onExpired={onExpired} />
      </>;
      case "Existing pages": return <>
        <PanelHeader title="Existing pages" description="Edit the storefront pages that ship with the theme. Changes stay in your draft until published." />
        <SelectField label="Existing page" className="mb-6 max-w-sm" value={existingPage} onChange={(event) => setExistingPage(event.target.value as ExistingPage)}>
          {existingPages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        {existingPage === "story" ? <StoryFields value={content.storyPage} onChange={set("storyPage")} />
          : existingPage === "nimbus" ? <NimbusFields value={content.nimbusPage} onChange={set("nimbusPage")} />
          : <ServicePageFields key={existingPage} page={existingPage} value={content.servicePages} onChange={set("servicePages")} />}
      </>;
      default: return null;
    }
  }

  return (
    <SidebarProvider className="min-h-dvh bg-background" style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
      <AdminSidebar
        groups={visibleGroups}
        current={tab}
        icons={icons}
        disabled={navDisabled}
        onSelect={selectTab}
        publishedVersion={document?.publishedVersion ?? null}
      />
      <SidebarInset className="min-w-0 bg-background">
        <header data-admin-topbar className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center lg:flex-nowrap gap-x-3 gap-y-2 border-b border-line-soft bg-background/85 px-4 py-2.5 backdrop-blur-md backdrop-saturate-150 sm:px-6">
          <SidebarTrigger className="-ml-1 hidden text-muted-foreground md:inline-flex" />
          <Separator orientation="vertical" className="hidden h-5 md:block" />
          <SectionPicker groups={visibleGroups} current={tab} disabled={navDisabled} onSelect={selectTab} />
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 max-md:order-last max-md:basis-full">
            <StatusChip tone={draftTone} data-draft-status="">
              {document ? `Draft version ${document.version}` : "Loading draft"}
              {conflict ? ", conflict" : busy || saving ? ", saving" : dirty ? ", unsaved changes" : ""}
            </StatusChip>
            <StatusChip tone={document?.publishedVersion ? "published" : "unpublished"} data-publish-status="">
              {document?.publishedVersion ? `Published version ${document.publishedVersion}` : "Not published yet"}
            </StatusChip>
          </div>
          <div className="flex-1 max-md:hidden" aria-hidden="true" />
          <CommandPalette
            groups={visibleGroups}
            icons={icons}
            disabled={navDisabled}
            onSelect={selectTab}
            afterSelect={focusPanelHeading}
            actions={draftScreen ? [
              { label: "Save draft", run: () => void write("save"), disabled: saveDisabled },
              { label: "Preview draft", run: () => void preview(), disabled: previewDisabled },
              ...(publisher ? [{ label: "Publish draft", run: () => void write("publish"), disabled: publishDisabled }] : []),
              { label: liveOpen ? "Close live preview" : "Open live preview", run: () => setLiveOpen((value) => !value), disabled: liveDisabled },
            ] : []}
          />
          {draftScreen && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" aria-pressed={liveOpen} disabled={liveDisabled} onClick={() => setLiveOpen((value) => !value)}
                className="hidden text-muted-foreground aria-pressed:bg-accent-tint aria-pressed:text-primary xl:inline-flex">
                <Eye aria-hidden="true" strokeWidth={1.5} />Live preview
              </Button>
              <Button type="button" variant="outline" size="sm" data-action="save" disabled={saveDisabled} onClick={() => void write("save")}>
                <Save aria-hidden="true" strokeWidth={1.5} className="sm:hidden" /><span className="max-sm:sr-only">Save draft</span>
              </Button>
              <Button type="button" variant="outline" size="sm" data-action="preview" disabled={previewDisabled} onClick={() => void preview()} className="hidden xl:inline-flex">
                Preview draft
              </Button>
              {publisher && (
                <Button type="button" size="sm" disabled={publishDisabled} onClick={() => void write("publish")}>
                  <Upload aria-hidden="true" strokeWidth={1.5} className="sm:hidden" /><span className="max-sm:sr-only">Publish draft</span>
                </Button>
              )}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="More draft actions" className="xl:hidden"><Ellipsis aria-hidden="true" strokeWidth={1.5} /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={liveDisabled} onSelect={() => setLiveOpen((value) => !value)}><Eye aria-hidden="true" strokeWidth={1.5} />{liveOpen ? "Close live preview" : "Open live preview"}</DropdownMenuItem>
                  <DropdownMenuItem disabled={previewDisabled} onSelect={() => void preview()}><ExternalLink aria-hidden="true" strokeWidth={1.5} />Preview draft in a new tab</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {account && (
            <>
              <Separator orientation="vertical" className="hidden h-6 sm:block" />
              <StaffMenu email={session.user.email} role={roleLabel} busy={account.busy} onSignOut={account.onSignOut} />
            </>
          )}
        </header>
        {(error || autoSaveFailed || notice || previewLink) && (
          <div className="grid gap-2 px-4 pt-4 sm:px-6">
            {error && (
              <Notice tone="error"><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{error}</span>
                {conflict
                  ? <Button type="button" size="xs" variant="outline" className="self-center" onClick={() => void load()} disabled={busy}>Reload latest draft</Button>
                  : <Button type="button" size="icon-xs" variant="ghost" className="self-center" aria-label="Dismiss message" onClick={() => setError("")}><X aria-hidden="true" strokeWidth={1.5} /></Button>}
              </Notice>
            )}
            {autoSaveFailed && (
              <Notice tone="error" data-autosave-failed><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" />
                <span className="flex-1">Live updates are paused: the last save failed. {autoSaveFailed}</span>
                <Button type="button" size="xs" variant="outline" className="self-center" onClick={() => void write("save")} disabled={busy || saving || conflict || !dirty}>Retry save</Button>
              </Notice>
            )}
            {notice && (
              <Notice tone="status"><CircleCheck aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span>
                <Button type="button" size="icon-xs" variant="ghost" className="self-center" aria-label="Dismiss message" onClick={() => setNotice("")}><X aria-hidden="true" strokeWidth={1.5} /></Button>
              </Notice>
            )}
            {previewLink && <Notice tone="status"><span>Your browser blocked the preview tab. <a href={previewLink} target="_blank" rel="noopener noreferrer">Open draft preview</a></span></Notice>}
          </div>
        )}
        {!content && !canManageEnquiries ? (
          <div className="p-4 sm:p-6"><section className={panelClass} data-admin-panel>{unavailableDraft}</section></div>
        ) : (
          <div
            data-split={liveActive ? "true" : "false"}
            data-mobile-pane={liveActive ? mobilePane : undefined}
            className={cn(
              "grid flex-1 items-start gap-5 p-4 sm:p-6",
              liveActive && "xl:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]",
              liveActive && mobilePane === "preview" && "max-md:[&>[data-admin-panel]]:hidden",
              liveActive && mobilePane === "editor" && "max-md:[&>[data-live-preview]]:hidden",
            )}
          >
            {liveActive && (
              <div className="inline-flex w-fit rounded-lg bg-sunken p-1 md:hidden" role="group" aria-label="Show editor or preview">
                {(["editor", "preview"] as const).map((pane) => (
                  <button
                    key={pane}
                    type="button"
                    aria-pressed={mobilePane === pane}
                    onClick={() => setMobilePane(pane)}
                    className="h-8 rounded-md px-3 text-xs font-semibold text-muted-foreground focus-visible:outline-none transition-colors duration-150 ease-admin focus-visible:ring-[3px] focus-visible:ring-ring/60 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs"
                  >
                    {pane === "editor" ? "Editor" : "Preview"}
                  </button>
                ))}
              </div>
            )}
            <section
              className={panelClass}
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
              <DisabledScope disabled={busy || conflict} notice={conflict ? "Another editor saved a newer version. Reload the latest draft before editing again." : undefined}>
              <fieldset disabled={busy || conflict} data-admin-panel-body className="m-0 min-w-0 border-0 p-0">
                <legend className="sr-only">{tab} editor</legend>
                {screen()}
              </fieldset>
              </DisabledScope>
              )}
            </section>
            {liveActive && (
              <LivePreview path={previewPath()} title={previewTitle} version={document?.version ?? null} publishedVersion={document?.publishedVersion ?? null}
                draftRequired={document?.draft === null} onSaveFirst={() => void write("save")} paused={autoSaveFailed !== ""} dirty={dirty} busy={busy || saving}
                blocked={liveBlocked} auto={liveAuto} onAutoChange={setLiveAuto} onUpdateNow={() => void write("save", undefined, { quiet: true })}
                onClose={() => setLiveOpen(false)} previewToken={previewToken} focusedSection={focusedSection}
                onSelectSection={(section) => {
                  if (tab !== "Homepage") selectTab("Homepage");
                  setFocusedSection(section);
                  // Edit in the preview opens the same inspector as the section's card.
                  if ((homeSectionKeys as readonly string[]).includes(section)) setInspecting(section as HomeSectionKey);
                }} />
            )}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
