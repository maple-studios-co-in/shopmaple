"use client";
import { useState } from "react";

/** Banner, page switcher and viewport toggle around the draft preview frame. */
export function PreviewShell({ token, path, version, pages }: {
  token: string;
  path: string;
  version: number;
  pages: { path: string; label: string }[];
}) {
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [current, setCurrent] = useState(path);
  const frameSrc = `/admin/preview-frame${current === "/" ? "" : current}?token=${encodeURIComponent(token)}`;
  return (
    <div className="admin-preview-shell" data-width={width}>
      <div className="admin-preview-banner" role="region" aria-label="Draft preview controls">
        <p><strong>Draft preview — not published.</strong> Showing draft version {version}. Visitors still see the published storefront.</p>
        <div className="admin-preview-controls">
          <label>
            <span>Page</span>
            <select aria-label="Preview page" value={current} onChange={(event) => setCurrent(event.target.value)}>
              {pages.map((page) => <option key={page.path} value={page.path}>{page.label}</option>)}
            </select>
          </label>
          <div className="admin-preview-widths" role="group" aria-label="Preview width">
            <button type="button" aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>Desktop</button>
            <button type="button" aria-pressed={width === "mobile"} onClick={() => setWidth("mobile")}>Mobile</button>
          </div>
          <a href="/admin">Back to admin</a>
        </div>
      </div>
      <div className="admin-preview-stage">
        <iframe title={`Draft preview of ${current}`} src={frameSrc} data-width={width}
          style={{ width: width === "mobile" ? "390px" : "100%" }} />
      </div>
    </div>
  );
}
