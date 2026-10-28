"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const current = segments.join("/");
  const query = `?token=${encodeURIComponent(token)}`;
  const expires = new Date(expiresAt);
  return (
    <div className="admin-preview-shell">
      <header className="admin-preview-bar">
        <strong>Draft preview — not published</strong>
        <span>
          Draft version {version} · {publishedVersion ? `Published version ${publishedVersion}` : "Nothing published yet"} · Link expires at{" "}
          {Number.isFinite(expires.getTime()) ? expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "an unknown time"}
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
          <button type="button" aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>Desktop</button>
          <button type="button" aria-pressed={width === "mobile"} onClick={() => setWidth("mobile")}>Mobile</button>
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

/** Keeps in-preview navigation on draft content: same-origin storefront links reopen inside the frame with the same token. */
export function PreviewNavigation({ token }: { token: string }) {
  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/admin")) return;
    event.preventDefault();
    const path = url.pathname === "/" ? "/home" : url.pathname;
    window.location.assign(`/admin/preview-frame${path}?token=${encodeURIComponent(token)}`);
  }
  return <div onClickCapture={onClick} className="admin-preview-navigation" />;
}
