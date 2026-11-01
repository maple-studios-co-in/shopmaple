# Homepage Instagram feed

The homepage Instagram row can show the latest posts from **@maplefurnishers** automatically, through Meta's Instagram Graph API ("Instagram API with Facebook Login"). Until the four private settings below are on the API host, nothing changes: the row shows the staff-edited posts from the admin's **Instagram** screen, exactly as before.

## How it works

- Every 15 minutes the API checks whether a refresh is due; it refreshes every three hours, on one API process at a time (a database lease).
- Each refresh checks the token with Meta's `debug_token`, then reads up to 24 recent posts (`GET /{ig-user-id}/media`, fields `id, caption, media_type, media_url, thumbnail_url, permalink, timestamp, children{…}`). Calls made with the access token carry `appsecret_proof`; `debug_token` uses the app token (`app-id|app-secret`) and the renewal call the app secret itself.
- The row's picture is the photo itself, a video's or reel's thumbnail, or an album's first item (its thumbnail when that item is a video). New pictures are downloaded once, only from Instagram's CDN (`*.cdninstagram.com`, `*.fbcdn.net`, https, at most 8 MB), resized to 960 px wide WebP and stored in the database. The homepage loads them from `/media/instagram-feed/<sha256>.webp` on our own domain, so Instagram's expiring CDN addresses never reach the page. These addresses are content-addressed and cached for a year; hiding a post takes it off the homepage but does not withdraw its image address, which shows the same picture that is public on Instagram.
- The web app reads the 12 newest posts that are not hidden through `homeInstagramPosts(staffPosts)` in `apps/web/lib/instagram-feed.ts`, a server-only function with a two-second limit that returns posts in the same shape as the staff-edited `instagramPosts`. The homepage's Instagram rail passes its staff list through it, so the row stays server-rendered and adds no script to the page.
- **When Meta fails** (bad token, missing permission, rate limit, outage, unreadable reply, empty account), or a refresh outlasts its lease and another worker takes over, the last good set stays on the homepage and the admin shows why. If no set was ever fetched, or the feed is turned off, the homepage uses the staff-edited posts.
- **Admin:** Shop admin → Instagram → *Automatic feed* shows whether the feed is on or refreshing, the last refresh and attempt, the token's expiry, when Meta's data access ends, and any problem, with every post in the latest set. Publishers can hide or show a post: it leaves or rejoins the homepage at once and stays hidden through later refreshes, even if it drops out of the newest 24 and comes back (a hidden post that has not reappeared for 180 days is forgotten). **Refresh now** starts a refresh in the background; *Reload status* shows the result. Editors can see the panel but not change it. The staff-edited list below stays as the fallback.

## Token lifetime

Use a **Page access token** (step 7). A Page token made from a long-lived user token has no expiry date: Meta invalidates it only if the person who made it changes their Facebook password, loses their role on the Page, or removes the app. The admin then shows "Meta no longer accepts the access token"; repeat steps 5–8.

If you set a long-lived **user** token instead (about 60 days), the API tries to renew it once it is within 10 days of expiring (`oauth/access_token?grant_type=fb_exchange_token`) and stores a renewed token encrypted (AES-256-GCM, key derived from the app secret). Meta documents this exchange for short-lived tokens; for an already long-lived token it may decline or return one that does not last longer. Either way the admin says the token could not be renewed and keeps showing the real expiry date, so a person can generate a new one in time. A Page token avoids all of this.

Meta also limits **data access**: about 90 days after a person last approved the app, Meta stops returning data until someone approves it again. When `debug_token` reports that date, the admin shows it; before it arrives, repeat steps 5–8 (it takes a few minutes). Putting a new token in the settings always replaces a renewed one.

## One-time Meta setup (done by the owner)

You need: the Instagram login for @maplefurnishers, and a Facebook account that is an admin of the Maple Facebook Page (with full control of the Page).

1. **Make @maplefurnishers a professional account.** In the Instagram app: Profile → ☰ → *Settings and activity* → *Account type and tools* → *Switch to professional account* → choose **Business** (or Creator). Skip if it already is one.
2. **Link it to the Maple Facebook Page.** In Facebook, open the Page → *Settings* → *Linked accounts* → *Instagram* → *Connect account*, and sign in to @maplefurnishers. (Or in Meta Business Suite: *Settings* → *Instagram accounts* → *Connect*.)
3. **Create a Meta developer account.** Go to <https://developers.facebook.com>, sign in with the Facebook account that manages the Page, choose *Get started* and verify it.
4. **Create the app.** *My Apps* → *Create app*. Name it "Maple Store Instagram feed", choose the use case **Other**, then the app type **Business**, and attach your business portfolio if asked. In the app, open *App settings* → *Basic*: note the **App ID** and click *Show* to copy the **App secret**. Keep both private. The app can stay in development mode: only people with a role on the app use it, so no App Review is needed.
5. **Generate a user token with the right permissions.** Open the Graph API Explorer: <https://developers.facebook.com/tools/explorer/>. Pick your app under *Meta App*, choose *User Token*, and add these permissions:
   - `instagram_basic`
   - `pages_show_list`
   - `pages_read_engagement`
   - `ads_read` (only if your Facebook account has a Business Manager role on the Page; Meta's IG Media reference requires it or `ads_management` then)
   - `business_management` (only if the Page belongs to a business portfolio and does not appear in step 7 without it)

   Click **Generate Access Token**. In the Facebook dialog, select the Maple Page and the @maplefurnishers account and approve.
6. **Make it long-lived.** Click the ⓘ next to the token → *Open in Access Token Tool* → **Extend Access Token** (at the bottom), and copy the new token. It is valid for about 60 days.
7. **Get the Page token and the Instagram account ID.** Back in the Explorer, paste the long-lived token into *Access Token*, set the request to `GET`, enter

   ```
   me/accounts?fields=name,access_token,instagram_business_account
   ```

   and click *Submit*. In the reply, find the Maple Page:
   - its `access_token` is the **Page token**: this is `INSTAGRAM_ACCESS_TOKEN`;
   - `instagram_business_account.id` (a long number starting `1784…`) is `INSTAGRAM_USER_ID`.

   If `instagram_business_account` is missing, step 2 is not finished.
8. **Check the token.** Paste the Page token into the Access Token Debugger (<https://developers.facebook.com/tools/debug/accesstoken/>). It should show *Type: Page*, *Expires: Never*, and the permissions from step 5.
9. **Hand the four values over privately** (a password manager share, not email or chat) to whoever runs the server.

## Server settings (done by the operator)

Add to the API's private environment, `/home/deploy/shopmaple/shared/store.env` (mode 0600), never to git:

| Setting | Value |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | The Page token from step 7 |
| `INSTAGRAM_USER_ID` | `instagram_business_account.id` from step 7 (digits only) |
| `META_APP_ID` | App ID from step 4 (digits only) |
| `META_APP_SECRET` | App secret from step 4 |
| `META_GRAPH_VERSION` | Optional; defaults to `v26.0` |

All four (the first four rows) are required; with any one missing the feed stays off. Restart the API. The first refresh runs within 15 minutes, or a publisher can press **Refresh now** in the admin. The settings are read only by the API and never sent to the browser, logged or returned by any endpoint.

**To turn the feed off,** remove `INSTAGRAM_ACCESS_TOKEN` and restart the API: the homepage goes back to the staff-edited posts at once (the cached posts stay in the database but are not served).

Web and API deploy together for this change: the web app adds the `/media/instagram-feed/*` rewrite and the admin panel, and its homepage reads `GET /api/instagram/feed` through `homeInstagramPosts`; the API adds the feed tables (migration `20261101010000_instagram_feed`).
