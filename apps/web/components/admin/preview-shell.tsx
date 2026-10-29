"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SiteChrome } from "@shopmaple/contracts";
import { StoreChromeView } from "@/components/admin/store-chrome";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { AdminRoot } from "./admin-root";
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
    <AdminRoot aria-label="Draft preview" className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line-soft bg-surface/90 px-[clamp(16px,3vw,28px)] py-2.5 backdrop-blur-md backdrop-saturate-150">
        <strong className="inline-flex items-center gap-2 text-[13px] font-semibold text-primary"><span aria-hidden="true" className="size-[7px] rounded-full bg-primary" />Draft preview, not published</strong>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          Draft version {version}. {publishedVersion ? `Published version ${publishedVersion}.` : "Nothing published yet."} Link expires at{" "}
          {Number.isFinite(expires.getTime()) ? expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "an unknown time"}.
        </span>
        <label className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
          <span>Page</span>
          <NativeSelect size="sm" aria-label="Preview page" className="max-w-[260px] bg-card" value={current} onChange={(event) => router.push(`/admin/preview/${event.target.value}${query}`)}>
            {pages.map((page) => (
              <NativeSelectOption key={page.segments.join("/")} value={page.segments.join("/")}>{page.label}</NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div role="group" aria-label="Preview width" className="inline-flex gap-0.5 rounded-full bg-black/[0.07] p-[3px]">
          {previewDevices.map((device) => (
            <button key={device.key} type="button" aria-pressed={width === device.key} onClick={() => setWidth(device.key)} className="h-7 rounded-full px-3 text-[12.5px] font-semibold text-muted-foreground outline-none transition-colors duration-150 ease-admin hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs">{device.label}</button>
          ))}
        </div>
        <a href="/admin" className="ml-auto rounded-sm text-[12.5px] font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60">Back to editor</a>
      </header>
      <div className="flex flex-1 justify-center p-4">
        <iframe
          className={cn("h-[calc(100dvh-84px)] min-h-[480px] w-full max-w-full rounded-xl border-0 bg-white shadow-lg motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-admin", width === "tablet" && "w-[820px]", width === "phone" && "w-[390px]")}
          title={`Draft preview of ${title}`}
          src={`/admin/preview-frame/${current}${query}`}
          referrerPolicy="same-origin"
        />
      </div>
    </AdminRoot>
  );
}

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
  const query = `?token=${encodeURIComponent(token)}${view === "published" ? "&view=published" : ""}`;
  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/admin")) return;
    event.preventDefault();
    const path = url.pathname === "/" ? "/home" : url.pathname;
    // Tell the embedding admin where the preview is going, so its toolbar can follow.
    embeddingParent()?.postMessage({ source: previewMessageSource, type: "navigate", path: url.pathname }, window.location.origin);
    navigate(`/admin/preview-frame${path}${query}`);
  }
  // display: contents, so the wrapper changes no layout; it only has to be an ancestor of every link.
  return <div onClickCapture={onClick} className="contents" data-preview-navigation="">{children}</div>;
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
    // Storefront markup inside the frame is not the admin's to class, so the section highlight
    // reaches it with an arbitrary variant; the ribbon sits in space reserved at the bottom.
    <div
      data-admin-tokens=""
      className="relative pb-[26px] [&_[data-home-section][data-preview-highlight=true]]:scroll-mt-6 [&_[data-home-section][data-preview-highlight=true]]:shadow-[inset_0_0_0_9999px_var(--admin-accent-tint)] [&_[data-home-section][data-preview-highlight=true]]:outline-2 [&_[data-home-section][data-preview-highlight=true]]:-outline-offset-2 [&_[data-home-section][data-preview-highlight=true]]:outline-primary [&_[data-home-section][data-preview-highlight=true]]:outline-solid motion-safe:[&_[data-home-section]]:transition-shadow motion-safe:[&_[data-home-section]]:duration-500"
      data-preview-version={version}
      data-preview-path={path}
      data-preview-view={view}
    >
      <PreviewNavigation token={token} navigate={navigate} view={view}>
        <StoreChromeView path={path} siteChrome={siteChrome}>{children}</StoreChromeView>
        <p className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] m-0 bg-primary px-3 py-1 text-center font-sans text-[11.5px] leading-[1.4] font-semibold tracking-[0.01em] text-primary-foreground" role="status">{view === "published" ? `Published storefront, version ${version}` : `Draft preview, not published. Version ${version}`}</p>
      </PreviewNavigation>
      <PreviewFrameBridge path={path} version={version} />
    </div>
  );
}
