"use client";
import { useEffect, useRef, useState } from "react";
import { instagramFeedStatusSchema, type InstagramFeedStatus } from "@shopmaple/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StaffSession } from "./dashboard";
import { Notice, Skeleton, readJson } from "./crm-primitives";
import { Subsection } from "./kit";
import { useAdminRequest } from "./use-admin-request";

const problems: Record<NonNullable<InstagramFeedStatus["errorCode"]>, string> = {
  token_invalid: "Meta no longer accepts the access token. Generate a new token (docs/instagram-feed.md) and update the API's private settings.",
  permission_denied: "The Meta app is missing a permission or no longer has access to the Instagram account.",
  rate_limited: "Meta asked us to slow down. The next scheduled refresh will try again.",
  meta_unavailable: "Instagram could not be reached. The next scheduled refresh will try again.",
  invalid_response: "Instagram sent something we could not read. The next scheduled refresh will try again.",
  empty_feed: "Instagram returned no posts we could show.",
  token_refresh_failed: "Posts were refreshed, but the access token could not be renewed. Renew it before it expires.",
};
const at = (value: string) => <time dateTime={value}>{new Date(value).toLocaleString()}</time>;

/** Status of the automatic Instagram feed, with per-post hiding for publishers. Shown above the staff-edited posts. */
export function InstagramFeedPanel({ session, onExpired }: { session: StaffSession; onExpired: () => void }) {
  const request = useAdminRequest();
  const [feed, setFeed] = useState<InstagramFeedStatus | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const active = useRef(true);
  const publisher = session.user.role === "publisher";
  async function run(path = "/api/admin/instagram-feed", body?: object) {
    setBusy(true); setError("");
    const result = await readJson(request, path, instagramFeedStatusSchema, "Instagram feed status", body, body ? session.csrfToken : undefined);
    if (!active.current) return;
    setBusy(false);
    if (result.ok) setFeed(result.value);
    else if (result.denied === 401) onExpired();
    else setError(result.denied ? "You don't have permission to change the Instagram feed." : result.message);
  }
  useEffect(() => {
    active.current = true;
    void run();
    return () => { active.current = false; };
  }, [request]);
  return <Subsection title="Automatic feed" aria-label="Automatic Instagram feed" aria-busy={busy} className="mb-6"
    description="Recent posts from @maplefurnishers, refreshed every three hours. While the feed has posts the homepage shows them instead of the staff-edited posts below."
    actions={feed?.configured && <>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run()}>Reload status</Button>
      {publisher && <Button type="button" size="sm" variant="outline" disabled={busy || feed.status === "refreshing"} onClick={() => void run("/api/admin/instagram-feed/refresh", {})}>Refresh now</Button>}
    </>}>
    {busy && !feed && !error && <Skeleton rows={1} />}
    {feed && <div className="grid gap-1 rounded-lg border border-line-soft bg-surface px-3.5 py-3 text-xs text-muted-foreground">
      {!feed.configured ? <p className="text-sm text-foreground">The automatic feed is off, so the homepage uses the staff-edited posts below. It turns on once the Meta settings in docs/instagram-feed.md are added to the API.</p>
        : feed.status === "waiting" ? <p className="text-sm text-foreground">Waiting for the first refresh. Until then the homepage uses the staff-edited posts below.</p>
        : <>
          {feed.status === "refreshing" && <p className="text-sm font-semibold text-foreground">Refreshing now. Reload the status in a minute to see new posts.</p>}
          {feed.lastSuccessAt && <p className="text-sm font-semibold text-foreground">Last refreshed {at(feed.lastSuccessAt)}.</p>}
          {feed.lastAttemptAt && feed.lastAttemptAt !== feed.lastSuccessAt && <p>Last attempt: {at(feed.lastAttemptAt)}.</p>}
          {feed.tokenExpiresAt && <p>Access token expires: {at(feed.tokenExpiresAt)}.</p>}
          {feed.dataAccessExpiresAt && <p>Meta data access ends: {at(feed.dataAccessExpiresAt)}. Before then, repeat steps 5 to 8 in docs/instagram-feed.md.</p>}
        </>}
      {feed.errorCode && <p className="text-sm text-destructive">{problems[feed.errorCode]} {feed.posts.length > 0 && "The homepage keeps showing the last good posts."}</p>}
    </div>}
    {error && <Notice tone="error">{error}</Notice>}
    {feed && feed.posts.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {feed.posts.map((post, index) => (
        <li key={post.id} data-instagram-feed-post className="grid content-start gap-2 rounded-lg border border-border bg-card p-2 shadow-xs">
          <a href={post.href} target="_blank" rel="noopener noreferrer" className="relative block aspect-[4/5] overflow-hidden rounded-md bg-muted">
            {/* Our own cached copy, already resized; the image optimizer adds nothing here. */}
            <img src={post.src} alt={post.caption || `Instagram post ${index + 1}`} loading="lazy" className={`size-full object-cover ${post.hidden ? "opacity-40" : ""}`} />
          </a>
          <p className="line-clamp-2 text-xs text-muted-foreground">{post.caption || "No caption"}</p>
          <div className="flex items-center justify-between gap-2">
            {post.hidden ? <Badge variant="secondary">Hidden</Badge> : <span className="text-xs text-muted-foreground">On the homepage</span>}
            {publisher && <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`${post.hidden ? "Show" : "Hide"} post ${index + 1}`}
              onClick={() => void run(`/api/admin/instagram-feed/posts/${encodeURIComponent(post.id)}/visibility`, { hidden: !post.hidden })}>{post.hidden ? "Show" : "Hide"}</Button>}
          </div>
        </li>
      ))}
    </ul>}
  </Subsection>;
}
