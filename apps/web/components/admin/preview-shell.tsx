"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SiteChrome } from "@shopmaple/contracts";
import { StoreChromeView } from "@/components/admin/store-chrome";
import { previewDevices, previewMessageSource, readPreviewMessage, type PreviewDevice } from "@/lib/live-preview";

export type PreviewPageOption = { label: string; segments: string[] };

/** Fixed banner, page switcher and width toggle around the draft preview frame. */
export function PreviewShell({ token, segments, pages, version, publishedVersion, expiresAt, title }: {
  token: string;
  segments: string[];
  pages: PreviewPageOption[];
  version: number;
  publishedVersion: number | null;
  expiresAt: string;
  title: string;
}) {
  const router = useRouter();
  const [width, setWidth] = useState<PreviewDevice>("desktop");
  const current = segments.join("/");
  const query = `?token=${encodeURIComponent(token)}`;
  const expires = new Date(expiresAt);
  return (
    <div className="admin-preview-shell">
      <header className="admin-preview-bar">
        <strong>Draft preview, not published</strong>
        <span>
          Draft version {version}. {publishedVersion ? `Published version ${publishedVersion}.` : "Nothing published yet."} Link expires at{" "}
          {Number.isFinite(expires.getTime()) ? expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "an unknown time"}.
        </span>
        <label>
          <span>Page</span>
          <select aria-label="Preview page" value={current} onChange={(event) => router.push(`/admin/preview/${event.target.value}${query}`)}>
            {pages.map((page) => (
              <option key={page.segments.join("/")} value={page.segments.join("/")}>{page.label}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Preview width" className="admin-preview-widths">
          {previewDevices.map((device) => (
            <button key={device.key} type="button" aria-pressed={width === device.key} onClick={() => setWidth(device.key)}>{device.label}</button>
          ))}
        </div>
        <a href="/admin">Back to editor</a>
      </header>
      <div className={`admin-preview-frame-wrap is-${width}`}>
        <iframe
          className="admin-preview-frame"
          title={`Draft preview of ${title}`}
          src={`/admin/preview-frame/${current}${query}`}
          referrerPolicy="same-origin"
        />
      </div>
    </div>
  );
}

/** The parent window when this document is embedded by the same-origin admin, else null. */
function embeddingParent(): Window | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  return window.parent;
}

/** Keeps in-preview navigation on draft content: same-origin storefront links reopen inside the frame with the same token. */
export function PreviewNavigation({ token, children, navigate = (url) => window.location.assign(url) }: {
  token: string;
  children: ReactNode;
  /** Replaced in tests; the browser's own navigation otherwise. */
  navigate?: (url: string) => void;
}) {
  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/admin")) return;
    event.preventDefault();
    const path = url.pathname === "/" ? "/home" : url.pathname;
    // Tell the embedding admin where the preview is going, so its toolbar can follow.
    embeddingParent()?.postMessage({ source: previewMessageSource, type: "navigate", path: url.pathname }, window.location.origin);
    navigate(`/admin/preview-frame${path}?token=${encodeURIComponent(token)}`);
  }
  // display: contents, so the wrapper changes no layout; it only has to be an ancestor of every link.
  return <div onClickCapture={onClick} className="admin-preview-navigation" data-preview-navigation="">{children}</div>;
}

/**
 * Inside the frame: announces the page and its sections to the embedding admin, and scrolls to
 * and highlights the section the admin asks for. Only same-origin messages from the parent window
 * are honoured; a top-level preview (no parent) stays silent.
 */
export function PreviewFrameBridge({ path, version, parentWindow }: { path: string; version: number; parentWindow?: Window | null }) {
  useEffect(() => {
    const parent = parentWindow === undefined ? embeddingParent() : parentWindow;
    if (!parent) return;
    const origin = window.location.origin;
    const sections = () => [...document.querySelectorAll<HTMLElement>("[data-home-section]")];
    parent.postMessage({ source: previewMessageSource, type: "ready", path, version, sections: sections().map((node) => node.dataset.homeSection ?? "").filter(Boolean) }, origin);
    function onMessage(event: MessageEvent) {
      const message = readPreviewMessage(event, origin, parent);
      if (!message || message.type !== "focus") return;
      for (const node of sections()) {
        if (message.section !== null && node.dataset.homeSection === message.section) {
          node.setAttribute("data-preview-highlight", "true");
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
          node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        } else node.removeAttribute("data-preview-highlight");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [path, version, parentWindow]);
  return null;
}

/** The draft page with the draft's own navigation and footer, a slim ribbon, and in-frame links kept on the draft. */
export function PreviewFrameDocument({ token, version, path, siteChrome, children, navigate, view = "draft" }: {
  token: string;
  version: number;
  path: string;
  siteChrome?: SiteChrome;
  children: ReactNode;
  navigate?: (url: string) => void;
  view?: "draft" | "published";
}) {
  return (
    <div className="admin-preview-document" data-preview-version={version} data-preview-path={path} data-preview-view={view}>
      <PreviewNavigation token={token} navigate={navigate}>
        <StoreChromeView path={path} siteChrome={siteChrome}>{children}</StoreChromeView>
        <p className="admin-preview-ribbon" role="status">{view === "published" ? `Published storefront, version ${version}` : `Draft preview, not published. Version ${version}`}</p>
      </PreviewNavigation>
      <PreviewFrameBridge path={path} version={version} />
    </div>
  );
}
