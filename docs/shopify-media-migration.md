# Moving to shop.maplefurnishers.com and off Shopify's media

The store moves from `store.maplefurnishers.com` to `shop.maplefurnishers.com`, which today is the Shopify store. Once
that hostname points at this store, `shop.maplefurnishers.com/cdn/shop/...` no longer exists, and when the Shopify plan is
cancelled `cdn.shopify.com` files may disappear too. So before the switch every photo, artwork and film the store shows
from Shopify is copied onto the server and served as `/media/shopify/<name>`.

## How it works

**The store's address is a setting.** `SITE_URL` is the address (canonical links, sitemap, structured data).
`SITE_ALIASES` lists the store's other addresses, comma-separated. `WEB_ORIGIN` is also one of its addresses. A link to
any of them becomes a path on the store, and `/media/keeri` photos on any of them are allowed. The web build fixes these
into its image allowlist (`apps/web/next.config.ts` runs at build time), so a release must be rebuilt after they change;
`SITE_URL` itself is also read at request time for SEO. With no `SITE_URL`, the store falls back to `WEB_ORIGIN`, then
`http://localhost:3000`, never a hard-coded hostname. Whether a saved editorial link counts as a Maple page is fixed by
Maple's domain (`maplefurnishers.com` and its subdomains), so content that is valid on one server is never rejected on
another.

**Names.** Every Shopify media address maps to one fixed local name, without a shared list:

```
https://shop.maplefurnishers.com/cdn/shop/files/Chairs_1.png?v=1&width=600
  → https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png     canonical: Shopify's CDN, no query
  → /media/shopify/<first 32 hex of sha256(canonical)>.png
```

`shop.maplefurnishers.com/cdn/shop/<kind>/…` is the same file as `cdn.shopify.com/s/files/1/0691/8651/9229/<kind>/…`
(videos: `cdn.shopify.com/videos/…`), so the download always uses Shopify's CDN, which keeps working after the DNS
switch. The query is dropped: `?v=` only busts Shopify's cache, and `?width=`/`?height=` ask Shopify's resizer for a
smaller copy of the same original. The **original** is copied once at full quality, and the store's own image optimizer
(`/_next/image`) does the resizing, as it already does for every other photo. SVGs are served as they are, like before.
Code: `packages/contracts/src/shopify-media.ts`.

**The repository** names the copies directly: its data files and code constants were rewritten by
`scripts/rewrite-shopify-media.ts`, which also records every source in
`packages/contracts/data/shopify-media-sources.json` (local name → Shopify address). The binary files are never
committed. A test fails if any data or code names a Shopify media address again, or names a copy that is not recorded;
fix it with `npx tsx scripts/rewrite-shopify-media.ts`.

**Serving.** The API serves `/media/shopify/<name>` from `SHOPIFY_MEDIA_ROOT` (Next.js forwards the path, like
`/media/uploads`). Only `<32 hex>.<jpg|jpeg|png|webp|gif|avif|svg|mp4|webm>` names are served, from that one
directory, never through a link; the type comes from the file's own bytes, and a file whose bytes are not a picture or
film is refused. A copy is cached for a year (its name and bytes never change) and films answer byte ranges.

**Not copied yet.** A name that is in the repository's list or the server's manifest but has no file yet is fetched from
Shopify's CDN and passed on (pictures; cached for an hour, six at a time with the rest of a page's burst waiting its
turn, 25 MB each), so the image optimizer and pages never show a broken picture. A film is redirected to Shopify's CDN instead (browsers follow it and stream ranges).
A redirect is not used for pictures because the image optimizer does not follow redirects for its own addresses. Set
`SHOPIFY_MEDIA_FALLBACK=off` once Shopify is cancelled; a missing copy is then a 404. Nothing is fetched for an unknown
name.

**Content in the database and the catalogue snapshot are not rewritten.** Instead, public API answers (`/api/...`, not
`/api/admin/...`) name the local copy in place of any Shopify media address the server has a copy of. Products from the
pinned Shopify snapshot, published content and staff-pasted addresses are all covered, the database and snapshot stay
exactly as they are (no backup or rollback needed), and an address without a copy keeps working from Shopify until it is
copied. Staff screens keep showing the stored address, so the admin edits and saves exactly what is stored.

## Settings

| Key | Where | Value |
| --- | --- | --- |
| `SHOPIFY_MEDIA_ROOT` | API and the tool (`store.env`) | Absolute directory outside releases, e.g. `/home/deploy/shopmaple/shared/shopify-media` |
| `SHOPIFY_MEDIA_FALLBACK` | API | `on` (default) until Shopify is cancelled, then `off` |
| `SITE_URL` | web (build and runtime), API | The store's address |
| `SITE_ALIASES` | web (build), API | The store's other address(es) during the move |
| `WEB_ORIGIN` | web (build), API | The browser origin (unchanged meaning) |

## Runbook (owner, on the server)

Run each step on its own and read its output before the next. Paths follow `docs/store-deployment.md`; `<sha>` is the
reviewed release.

### 1. Prepare the release and settings

1. Export and install the release as in `docs/store-deployment.md` (release sequence steps 1–2). Don't activate it yet.
2. Add to `/home/deploy/shopmaple/shared/store.env` (before the switch, `store.` is still the address):

   ```sh
   SHOPIFY_MEDIA_ROOT=/home/deploy/shopmaple/shared/shopify-media
   SHOPIFY_MEDIA_FALLBACK=on
   SITE_URL=https://store.maplefurnishers.com
   SITE_ALIASES=https://shop.maplefurnishers.com
   ```

3. Check free space where the copies go: `df -h /home/deploy/shopmaple/shared`. The repository's files are about
   1.2 GB (measured with HEAD requests on 11 Nov 2026); the database and snapshot add some more. The tool stops by itself
   below 2 GB free.

### 2. Dry run

```sh
cd /home/deploy/shopmaple/releases/<sha>
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/migrate-shopify-media.ts --dry-run
```

It reads the repository's list, the database (`DATABASE_URL`) and the snapshot (`SHOPIFY_CATALOGUE_FILE`), and prints the
number of files by source, kind and host, how many are already copied, and an estimate of the download from 60 HEAD
requests (`--sample=all` sends one per file). It writes nothing. Any "failed" line names a file Shopify did not answer
for; investigate before step 3.

### 3. Download

```sh
cd /home/deploy/shopmaple/releases/<sha>
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/migrate-shopify-media.ts
```

Four at a time, three retries, a 60 s timeout per picture (5 min per film), 60 MB per picture and 600 MB per film, only
from `cdn.shopify.com` and only picture or film types whose bytes match. Each file is written under a temporary name and
linked into place when complete; `manifest.json` in the same directory records each copy's Shopify address, size and
sha256. Rerun it as often as needed (an interrupted run, or new content later): copied files are skipped, and nothing is
ever deleted or replaced. Exit code 1 means some files failed; they are listed at the end.

### 4. Verify

```sh
cd /home/deploy/shopmaple/releases/<sha>
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/migrate-shopify-media.ts --verify
```

It re-hashes every copy against the manifest and lists any file still missing with its source. It must end with
"0 damaged or gone" and "0 named by this release's data or code"; it exits 1 otherwise. A missing file that only the
database or the snapshot names is still shown from Shopify until it is copied; rerun step 3 for it.

### 5. Deploy the release

Build and activate the release as in `docs/store-deployment.md` (release sequence steps 3–5), so the API starts with
`SHOPIFY_MEDIA_ROOT` and the web build has the store's addresses. Then warm the image optimizer:
`node deploy/warm-image-cache.mjs https://store.maplefurnishers.com`.

### 6. Check

- A copy is served: `curl -sI https://store.maplefurnishers.com/media/shopify/$(ls /home/deploy/shopmaple/shared/shopify-media | grep -m1 png)`
  shows `200`, `content-type: image/png` and `cache-control: public, max-age=31536000, immutable`.
- The API names copies: `curl -s 'http://127.0.0.1:4110/api/products?limit=50' | grep -c -E 'cdn\.shopify\.com|maplefurnishers\.com/cdn/shop'`
  prints `0` (any match is a file not copied yet; rerun steps 3–4).
- The pages name no Shopify media: for `/`, `/sofas`, `/nimbus-collection`, `/our-story` and a product page,
  `curl -s https://store.maplefurnishers.com<page> | grep -c -E 'cdn\.shopify\.com|maplefurnishers\.com/cdn/shop'` prints `0`.
- In a browser, open the homepage, a room page, Nimbus, Our Story, a blog article and a product page with the network
  panel filtered by `shopify`: no requests. The hero film plays, the testimonial film plays when started, pictures look
  as before.

### 7. Switch the hostname (after step 6 passes)

1. In `store.env`: `SITE_URL=https://shop.maplefurnishers.com`, `SITE_ALIASES=https://store.maplefurnishers.com`,
   `WEB_ORIGIN=https://shop.maplefurnishers.com`. Rebuild and activate the release (the web build fixes the addresses).
   The API accepts changes (cart, enquiries, admin) only from `WEB_ORIGIN`, so visitors must be on `shop.` from now on.
2. Cloudflare (owner): route `shop.maplefurnishers.com` to the store's Tunnel, and redirect `store.maplefurnishers.com`
   to `shop.` (301, path and query kept), so old links and carts land on the new address.
3. Keeri: if it names photos as `https://store.maplefurnishers.com/media/keeri/...`, they keep working while `store.` is
   an alias; move its store address to `shop.` when convenient. Razorpay's webhook moves to the `shop.` host
   (`docs/store-deployment.md`).
4. Rerun steps 2–4 now and after any staff edit that pastes a Shopify address, until `--dry-run` shows nothing left.

### 8. After Shopify is cancelled

Set `SHOPIFY_MEDIA_FALLBACK=off` and restart `shopmaple-api`. Keep a copy of `SHOPIFY_MEDIA_ROOT` off the server: the
files then exist nowhere else, and the nightly backup covers the database and the media library, not this directory.
For example: `tar -C /home/deploy/shopmaple/shared -czf /home/deploy/shopmaple/backups/shopify-media-$(date +%F).tgz shopify-media`,
then copy the archive off the server.

## Rollback

Point `current` back to the previous release and restart the two application processes, as in
`docs/store-deployment.md`. The copies and the manifest stay where they are and are harmless to the old release; the
database and snapshot were never changed.
