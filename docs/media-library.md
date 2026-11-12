# Shop media library

Shop staff can upload JPEG, PNG, and WebP images through the authenticated admin media library. Files are normalized to WebP, stripped of metadata, and resized to fit within 2560 × 2560 pixels. Uploads are limited to 8 MiB and 24 million decoded pixels. SVG and animated images are rejected. Image bytes must match the declared MIME type.

Staff can also upload **films** (owner, 12 Nov 2026): MP4 or WebM, up to 80 MB (80 × 1024 × 1024 bytes) each. The server has no video encoder, so a film is stored and played exactly as uploaded; it must already be a web-ready file (see [Exporting a film](#exporting-a-film)). Films are used in four places:

1. **Homepage hero slides**: a video slide takes its film and its poster picture from the library (Homepage → Hero → Hero slides).
2. **Homepage testimonial**: plays muted and looping beside the words while on screen, with the testimonial poster as its still (Homepage → Testimonial → Media, or Artwork → Homepage).
3. **Nimbus page film** and 4. **Terra page film**: "Watch collection film" in the page's opening opens the film over the page, with sound and the browser's controls, and the opening photo as its poster (Artwork → Nimbus / Terra). Without a film the link is not shown.

Visitors who ask their device for reduced motion see posters only; ambient films (hero, testimonial) never start for them.

Configure `SHOP_MEDIA_ROOT` as an absolute directory outside the deployed release, for example `/srv/shopmaple/shared/media`. The API service account requires read/write access. Keep the directory private to that service account. Missing configuration disables uploads with a 503 response. Back up both this directory and the PostgreSQL database together; retain files across deployments and rollbacks. Never expose the directory through a generic static server, nginx alias, or public object listing: publication checks run in the API.

## HTTP contract

- `POST /api/admin/media`: raw image body, matching image `Content-Type`, session cookie, `Origin`, and `X-CSRF-Token`. Optional `X-Media-Label` is a URL-encoded label of up to 160 characters. Returns `{asset}` with status 201 for a new asset or 200 for a duplicate. Origin and session/CSRF checks precede body parsing and decoding.
- `POST /api/admin/media/films`: raw film body with `Content-Type: video/mp4` or `video/webm` and a `Content-Length` of at most 80 MiB (411 without one, 413 above it, before any of the body is read), plus the same session, `Origin`, CSRF and label headers. The body streams to a private temporary file in the media root while it is hashed; it must start with an MP4 `ftyp` box naming an ISO/MP4 brand (`isom`, `iso2`–`iso6`, `mp41`, `mp42`, `avc1`, `M4V `, `dash` …; QuickTime `qt  ` and 3GP are refused) or a WebM EBML header with doctype `webm` (other Matroska is refused), matching the declared type, and its boxes or segment must account for the whole file (a cut-off upload is refused). The file is then linked into place as `<sha256>.mp4` or `.webm` and deduplicated like images. The running time, frame size and (MP4) whether the index comes before the pictures ("fast start") are read from the file's headers when present.
- `GET /api/admin/media?limit=24&cursor=<asset-id>&kind=image|video`: authenticated metadata page `{assets,nextCursor}`; maximum 50 assets per page. `kind` narrows the page to images or films; pickers always pass it, so an image slot never lists films and a film slot never lists images.
- `GET /api/admin/media/:sha/preview`: authenticated image or film preview, always private/no-store. Films answer byte ranges here too.
- `GET /media/uploads/:sha.webp`, `/media/uploads/:sha.mp4`, `/media/uploads/:sha.webm`: only serve assets whose `publicAt` has been set by a successful content publication transaction, with the extension matching the stored file. Responses are immutable (`public, max-age=31536000, immutable`; names are content hashes) with `X-Content-Type-Options: nosniff`. Films stream from disk with `Accept-Ranges: bytes`, answer a single `Range` with 206 (Safari needs this to play at all), an unsatisfiable one with 416, honour `If-Range` against the ETag (the SHA-256) and answer `HEAD` without a body. Unknown or unpublished assets return 404.

Each serialized asset has `id`, `sha256`, `kind` (`image` or `video`), `label`, `width`, `height` (empty for a film whose file does not state them), `bytes`, `mimeType`, `durationMs` and `faststart` (films only), `createdAt`, `publicAt`, canonical `url`, and authenticated `previewUrl`. The admin uses ordinary image and video elements for previews so that the Next image optimizer cannot cache or fetch a private preview without the staff session.

### How the browser reaches the film upload

The admin's other requests go through the web app's `/api/*` rewrite. That path cannot carry a film: Next copies a rewritten request's body through a buffer capped by `experimental.proxyClientMaxBodySize` (10 MB by default) and silently forwards only that much, and the proxy in `apps/web/proxy.ts` buffers bodies the same way. Film uploads therefore go to the web app's own route handler, `apps/web/app/api/admin/media/films/route.ts`, which `proxy.ts` skips and which streams the body to the API as it arrives (`lib/film-upload-forward.ts`); nothing of the film is held in memory. The admin sends it with `XMLHttpRequest` to show progress and offer a cancel button.

Limits on the way: Cloudflare's free plan accepts request bodies up to 100 MB, so 80 MB films fit. Next's own server (the default Node.js `requestTimeout`) gives a request five minutes to arrive, so an 80 MB film needs an upload speed of about 2.2 Mbit/s or better; the API allows a film ten minutes.

Selecting an image or film updates draft content only. `prepareMediaForPublication(tx, content, mediaRoot)` checks managed references only in known image and film fields (the walker in `apps/api/src/admin/media.ts`); arbitrary prose never publishes a file. Film fields are a hero video slide's `src` and `templateFilms[].src`; they accept only `/media/uploads/<sha>.mp4|webm` of a film row, and image fields accept only `/media/uploads/<sha>.webp` of an image row (`MEDIA_REFERENCE_INVALID` otherwise). It verifies the persistent file exists, is readable, and matches the recorded size (images are also re-hashed; films are checked by size only, at most 80 MiB, so publishing never reads 80 MB inside its transaction), then marks the referenced assets public in the same transaction that publishes content. The staff draft preview rewrites the same fields to the private preview route, so unpublished films play there. Missing references or missing storage abort publication. A transaction rollback leaves private assets private. Once published, immutable image URLs remain public, including after content rollback, so previously cached pages retain their images. Removing an image from content does not delete it.

## Resource and storage limits

Uploads are limited to 10 attempts per minute per client IP and two active image uploads per API process, plus two active film uploads. A client disconnect does not release its slot until parsing, decoding, and database work settle; an abandoned film's temporary file is removed. The library has a hard quota of 500 images and 250 MiB stored image bytes, and separately 40 films and 3 GiB stored film bytes. A PostgreSQL transaction advisory lock serializes quota checks, digest deduplication, and writes across API workers using the same database. Files use SHA-256 names derived from normalized bytes. Temporary files use exclusive creation; final files are installed without overwriting existing paths. Failed temporary writes are removed by their owner. There is no remote URL import or delete endpoint.

The service owns this directory; do not manually add files or use the same root with a different database. A crash between filesystem persistence and database commit can leave an unreferenced immutable image. It remains inaccessible because serving requires a database row. Quota checks account for files on disk, including unreferenced files: `.mp4`/`.webm` files count against the film quota and everything else (except films still arriving, named `.film-*.part`) against the image quota. Operational reconciliation should compare hashes against database rows with a backup and explicit removal plan; automatic cleanup is intentionally absent.

## Exporting a film

The store plays the file as it is, in every browser, so export it for the web before uploading:

- **Format**: MP4 with **H.264** video (and AAC sound, if any). This plays everywhere, including Safari on iPhone. WebM (VP9) also plays in current browsers but is the less safe choice for older iPhones.
- **Fast start**: tick "Fast start" / "Web optimized" / "Optimize for web" when exporting (in ffmpeg, `-movflags +faststart`). It moves the film's index (`moov`) to the front so playback can begin before the whole file has downloaded. A film without it still plays but starts more slowly, especially on phones; the library marks such MP4s "Starts slowly".
- **Size**: keep films short and light: under 80 MB is the limit, but 1080p at 4–6 Mbit/s (about 30–45 MB a minute) is plenty for the hero and testimonial, which play muted. Smaller films start sooner for visitors.
- **Sound**: the hero and testimonial films always play muted; the collection films play with sound when a visitor opens them.

For example, with ffmpeg: `ffmpeg -i input.mov -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart film.mp4`. HandBrake's "Web" presets with "Web Optimized" ticked do the same.

## Verification

Focused API: from `apps/api`, using Node.js 22 and the dedicated `shopmaple_test` database:

```sh
npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-media.test.ts test/admin-media-films.test.ts test/film-inspect.test.ts
```

Focused admin UI: from `apps/web`:

```sh
npx tsx --tsconfig test/tsconfig.json --import ./test/support/dom-globals.ts --test test/admin-media.test.tsx test/film-upload-route.test.tsx test/films-storefront.test.tsx
```

Films (12 Nov 2026) add API tests for uploads (authentication, MP4/WebM recognition, refusal of other and cut-off files, the 80 MB limit before the body is read, abandoned uploads), byte-range serving, publication and the film quota; web tests for the film library, pickers, upload progress, the streaming upload route (a 12 MB body reaches a stand-in API whole) and the players. Their RED evidence was the missing film route (404 versus 401/201/400) and, in the admin, the missing film upload and film picker.

The focused media API suite has 14 passing tests, and the admin UI suite has 12 passing tests. Tests exercise real Express, Sharp, filesystem operations, PostgreSQL transactions, and React interactions. Only UI fetch transport is replaced. Initial API RED evidence was missing-route status assertions (404 versus required 401/201/503); initial UI RED evidence was missing authenticated previews, selection, upload controls, and pagination. Subsequent hardening regressions first failed for publication from prose (200 versus 404), publication with a missing file (no rejection), disconnected processing slots (400 versus 429), and unsafe or malformed UI response data. The same focused commands subsequently passed. API and web TypeScript checks passed. Scoped Semgrep scanned all three media implementation files with 74 rules and zero findings; a redacted Gitleaks filesystem scan of the media API found no leaks. The integrating agent runs the complete repository suite and security checks after all parallel changes land. Deployment verification must separately confirm the shared directory, proxy upload limit, `/media/uploads/` routing, authenticated previews, and private-versus-published behavior through the ordinary browser.
