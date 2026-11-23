# Shop media library

Shop staff can upload JPEG, PNG, and WebP images through the authenticated admin media library. Files are normalized to WebP, stripped of metadata, and resized to fit within 2560 × 2560 pixels. Uploads are limited to 8 MiB and 24 million decoded pixels. SVG and animated images are rejected. Image bytes must match the declared MIME type.

Staff can also upload **films** (owner, 12 Nov 2026): MP4 or WebM, up to 80 MB (80 × 1024 × 1024 bytes) each. The server has no video encoder, so a film is stored and played exactly as uploaded; it must already be a web-ready file (see [Exporting a film](#exporting-a-film)). Films are used in four places:

1. **Homepage hero slides**: a video slide takes its film and its poster picture from the library (Homepage → Hero → Hero slides).
2. **Homepage testimonial**: plays muted and looping beside the words while on screen, with the testimonial poster as its still (Homepage → Testimonial → Media, or Artwork → Homepage).
3. **Nimbus page film** and 4. **Terra page film**: "Watch collection film" in the page's opening opens the film over the page, with sound and the browser's controls, and the opening photo as its poster (Artwork → Nimbus / Terra). Without a film the link is not shown.

Visitors who ask their device for reduced motion see posters only; ambient films (hero, testimonial) never start for them.

### Phone films

Every film slot (a hero video slide, the testimonial, the Nimbus and Terra films) can also take an optional **phone film** (owner, 12 Nov 2026): a second cut of the same film made for phones, for example a 9:16 version of a square or wide film. Screens up to 749 px wide play the phone film; wider screens play the main film. Without a phone film every screen plays the main film, as before. The phone film follows the same rules as any film: MP4 or WebM (chosen by extension), up to 80 MB, private until the content that uses it is published, then public (`publicAt`) from that publication on.

To attach one:

1. Upload both cuts in the media library (**Upload film**), for example `maple-diwali-desktop.mp4` (960 × 960) and `maple-diwali-mobile.mp4` (720 × 1280).
2. Open the slot: Homepage → Hero → Hero slides (a slide of kind **Video**), Homepage → Testimonial, or Artwork → Homepage / Nimbus / Terra.
3. Choose the main film with **Choose film**. For a testimonial or collection film the phone picker appears once the slot has a film; a hero video slide shows it beside its film and poster.
4. Under the phone film (“… for phones” / “Hero slide N phone film”), choose the phone cut with **Choose film**, then save and publish. Publishing makes both films public.

**Clear film** on the phone film removes only the phone cut. Clearing a testimonial or collection film removes its phone film too, and turning a hero slide back into an image drops its phone film.

On the storefront, a film with a phone cut is drawn without an address in `src`: the main and phone films wait in `data-film-src` and `data-film-mobile-src`, and the cut for the screen is set when the film's script attaches (`chooseFilmSource` in `apps/web/lib/film-source.ts`, called by the hero slider and by `mountAmbientFilm`, both in chunks loaded after hydration), so a phone never starts loading the wide film. The poster shows until then, and without script. The collection films' dialog picks the cut when the visitor opens it, as the Nimbus and Terra opening clips do. The choice is made once per page view; turning a phone or resizing a window afterwards does not swap the film. A film without a phone cut keeps its address in `src`, unchanged.

Configure `SHOP_MEDIA_ROOT` as an absolute directory outside the deployed release, for example `/srv/shopmaple/shared/media`. The API service account requires read/write access. Keep the directory private to that service account. Missing configuration disables uploads with a 503 response. Back up both this directory and the PostgreSQL database together; retain files across deployments and rollbacks. Never expose the directory through a generic static server, nginx alias, or public object listing: publication checks run in the API.

## Uploading many files at once

The library's **Upload images** and **Upload films** take one file or many (owner, 23 Nov 2026): choose several in the file picker, or drop them on the upload area. Each file is listed with how it ended: uploaded, not allowed (its type, its 8 MiB / 80 MB size, or a banner size Settings does not allow), or failed with the server's reason. Images go two at a time, matching the API's two decoding slots; films go one at a time, each with its progress and **Cancel upload**. When the library answers 429 (busy, or the minute's uploads used up) the file waits for the `Retry-After` and is sent again, up to six tries. When every file went in, the dialog closes and the library says how many; otherwise it stays open with the reasons and **Try the failed ones again** (refused files are never sent again).

## Banner sizes (Settings)

**Settings, Banner sizes** in the admin's sidebar (owner, 23 Nov 2026) holds the only picture sizes uploads may have. A publisher keeps the list (up to 40 sizes, each exact width × height in pixels with an optional description, at most 24 million pixels) and turns **Only allow the sizes below** on or off; editors and viewers see the rules read-only. The rules take effect as soon as they are saved: they are settings, not draft content, and need no publishing. The screen offers the sizes the storefront's own placements ask for (2784 × 400 and 1000 × 1000 for category and collection banners, 1900 × 350 and 500 × 500 for campaign banners, 1920 × 640 for policy and returns banners).

While the rule is on, every image upload must be exactly one of the sizes: the library's uploads, the hero slide editor's, and the cover pictures made from films. The size checked is the picture's own size as uploaded, turned upright by its EXIF orientation, before the library fits it within 2560 px (a 2784 × 400 banner is kept at 2560 × 368). The admin measures each picture before sending it and refuses one of another size with an alert naming the allowed sizes; the API checks again after reading the image's header and before re-encoding it (`422 MEDIA_SIZE_NOT_ALLOWED`), so the rule holds for every client. Films are not checked. With the rule off, or before any rules are saved, every size is taken as before.

The same screen sets the **largest picture file** (owner, 23 Nov 2026): 1, 2, 5 or 8 MB, 5 MB until a publisher chooses another (rules saved before this existed read as 5 MB). 8 MB is the most the API takes, and every picture must arrive within 15 seconds, so the screen shows the upload speed each choice needs (5 MB: about 2.8 Mbit/s). The admin refuses a larger picture before sending it, and the API refuses it after reading the body and before decoding it (`413 MEDIA_TOO_LARGE`, "This file is 6.2 MB. The largest picture file allowed is 5 MB. …"). Films keep their 80 MB.

## Managing the library

The Media screen (not the pickers inside other screens) manages its files (owner, 23 Nov 2026). Every card has **Edit** and **Remove**. Removed files are listed on a screen of their own, **Removed media** (Library, in the left menu), with **Restore** and, for a publisher only, **Delete permanently** (owner, 23 Nov 2026: permanent delete is never on the library's cards).

- **Edit** renames a file (its label, up to 160 characters), lists where it is used (the draft and the live storefront, in the words of the screens that hold it, from `walkMediaFields`), and for a picture offers **Crop, turn or flip**: an editor in the browser that turns in quarter turns, flips as seen, and crops freely, to the picture's own shape, or to a banner size (Settings' list, or this website's own sizes when none is saved), which makes the copy exactly that many pixels. The result is uploaded as a new picture (`<name> (edited).webp`, through the same rules as any upload); the original is never changed, because pages name a file by its contents. When the draft uses the original, **Use the copy there instead** swaps the address everywhere in the draft (`lib/media-references.ts`), to be saved and published as usual.
- **Remove** (editors and publishers) hides the file from the library and every picker. Its row and its file stay, so pages that already use it, draft or live, keep showing it, and publishing still accepts it. It is listed under **Removed media** with **Restore**; uploading the same file again also brings it back. Removed files still count against the library's quota.
- **Delete permanently** (publishers only, on Removed media, after ticking "I understand this cannot be undone"; other staff are not shown the button) deletes the row and the file. The API refuses a file that the draft or the live storefront still uses (`409 MEDIA_IN_USE`, naming the places), under the same advisory lock as uploads and publishing. Older saved versions in History that used it would need another file to be restored. A file that cannot be unlinked after the row is gone stays unreachable, as an interrupted upload's does.

Migration `20261123110000_media_removed` (additive) adds `removedAt` and `removedById` to `ShopMediaAsset`.

The rules live in the `ShopSetting` table (migration `20261123100000_shop_settings`, additive) under the key `media-uploads`, checked by `mediaUploadRulesSchema` from `@shopmaple/contracts/media-upload-rules` (an admin-only import, kept out of the storefront bundle).

## HTTP contract

- `POST /api/admin/media`: raw image body, matching image `Content-Type`, session cookie, `Origin`, and `X-CSRF-Token`. Optional `X-Media-Label` is a URL-encoded label of up to 160 characters. Returns `{asset}` with status 201 for a new asset or 200 for a duplicate. Origin and session/CSRF checks precede body parsing and decoding.
- `POST /api/admin/media/films`: raw film body with `Content-Type: video/mp4` or `video/webm`, plus the same session, `Origin`, CSRF and label headers. A declared `Content-Length` above 80 MiB is refused with 413 before any of the body is read. A chunked body with no length (`Transfer-Encoding: chunked`; Cloudflare's tunnel re-sends uploads that way) is accepted and counted as it arrives: it is stopped with 413 as soon as it passes 80 MiB, and its temporary file is removed. Only a request with neither a length nor a chunked body, or with a zero or malformed length, is answered 411. The body streams to a private temporary file in the media root while it is hashed; it must start with an MP4 `ftyp` box naming an ISO/MP4 brand (`isom`, `iso2`–`iso6`, `mp41`, `mp42`, `avc1`, `M4V `, `dash` …; QuickTime `qt  ` and 3GP are refused) or a WebM EBML header with doctype `webm` (other Matroska is refused), matching the declared type, and its boxes or segment must account for the whole file (a cut-off upload is refused). The file is then linked into place as `<sha256>.mp4` or `.webm` and deduplicated like images. The running time, frame size and (MP4) whether the index comes before the pictures ("fast start") are read from the file's headers when present.
- `GET /api/admin/media?limit=24&cursor=<asset-id>&kind=image|video`: authenticated metadata page `{assets,nextCursor}`; maximum 50 assets per page. `kind` narrows the page to images or films; pickers always pass it, so an image slot never lists films and a film slot never lists images.
- `GET /api/admin/settings/media-uploads`: any staff session with the website's content; `{rules: {restrictSizes, sizes: [{width, height, label}]}, updatedAt, updatedBy}`, private and no-store. `PUT` the same path with `{rules}`, the session cookie, `Origin` and `X-CSRF-Token`: publishers only (403 "A publisher must approve this change." otherwise); invalid rules answer `400 SETTINGS_INVALID` with the reason.
- `PATCH /api/admin/media/:id` with `{label}` renames; `POST /api/admin/media/:id/remove` and `/restore` remove and restore; `GET /api/admin/media/:id/usage` answers `{draft: [places], published: [places]}`; `DELETE /api/admin/media/:id` deletes permanently (publishers). Changes need the session, `Origin` and `X-CSRF-Token`. `GET /api/admin/media?removed=1` lists removed files; without it the library lists only what is in it.
- `GET /api/admin/media/:sha/preview`: authenticated image or film preview, always private/no-store. Films answer byte ranges here too.
- `GET /media/uploads/:sha.webp`, `/media/uploads/:sha.mp4`, `/media/uploads/:sha.webm`: only serve assets whose `publicAt` has been set by a successful content publication transaction, with the extension matching the stored file. Responses are immutable (`public, max-age=31536000, immutable`; names are content hashes) with `X-Content-Type-Options: nosniff`. Films stream from disk with `Accept-Ranges: bytes`, answer a single `Range` with 206 (Safari needs this to play at all), an unsatisfiable one with 416, honour `If-Range` against the ETag (the SHA-256) and answer `HEAD` without a body. Unknown or unpublished assets return 404.

Each serialized asset has `id`, `sha256`, `kind` (`image` or `video`), `label`, `width`, `height` (empty for a film whose file does not state them), `bytes`, `mimeType`, `durationMs` and `faststart` (films only), `createdAt`, `publicAt`, canonical `url`, and authenticated `previewUrl`. The admin uses ordinary image and video elements for previews so that the Next image optimizer cannot cache or fetch a private preview without the staff session.

### How the browser reaches the film upload

The admin's other requests go through the web app's `/api/*` rewrite. That path cannot carry a film: Next copies a rewritten request's body through a buffer capped by `experimental.proxyClientMaxBodySize` (10 MB by default) and silently forwards only that much, and the proxy in `apps/web/proxy.ts` buffers bodies the same way. Film uploads therefore go to the web app's own route handler, `apps/web/app/api/admin/media/films/route.ts`, which `proxy.ts` skips and which streams the body to the API as it arrives (`lib/film-upload-forward.ts`); nothing of the film is held in memory. The admin sends it with `XMLHttpRequest` to show progress and offer a cancel button.

Limits on the way: Cloudflare's free plan accepts request bodies up to 100 MB, so 80 MB films fit. Next's own server (the default Node.js `requestTimeout`) gives a request five minutes to arrive, so an 80 MB film needs an upload speed of about 2.2 Mbit/s or better; the API allows a film ten minutes.

Selecting an image or film updates draft content only. `prepareMediaForPublication(tx, content, mediaRoot)` checks managed references only in known image and film fields (the walker in `apps/api/src/admin/media.ts`); arbitrary prose never publishes a file. Film fields are a hero video slide's `src` and `mobileSrc` (its phone film) and `templateFilms[].src` and `templateFilms[].mobileSrc`; they accept only `/media/uploads/<sha>.mp4|webm` of a film row, and image fields accept only `/media/uploads/<sha>.webp` of an image row (`MEDIA_REFERENCE_INVALID` otherwise). It verifies the persistent file exists, is readable, and matches the recorded size (images are also re-hashed; films are checked by size only, at most 80 MiB, so publishing never reads 80 MB inside its transaction), then marks the referenced assets public in the same transaction that publishes content. The staff draft preview rewrites the same fields to the private preview route, so unpublished films play there. Missing references or missing storage abort publication. A transaction rollback leaves private assets private. Once published, immutable image URLs remain public, including after content rollback, so previously cached pages retain their images. Removing an image from content does not delete it.

## Resource and storage limits

Image uploads are limited to 60 attempts per minute per client IP (raised from 10 for bulk upload, 23 Nov 2026) and film uploads to 10, with two active image uploads per API process, plus two active film uploads. A client disconnect does not release its slot until parsing, decoding, and database work settle; an abandoned film's temporary file is removed. The library has a hard quota of 500 images and 250 MiB stored image bytes, and separately 40 films and 3 GiB stored film bytes. A PostgreSQL transaction advisory lock serializes quota checks, digest deduplication, and writes across API workers using the same database. Files use SHA-256 names derived from normalized bytes. Temporary files use exclusive creation; final files are installed without overwriting existing paths. Failed temporary writes are removed by their owner. There is no remote URL import; files are deleted only by a publisher's Delete permanently (see Managing the library).

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
npx tsx --tsconfig test/tsconfig.json --import ./test/support/dom-globals.ts --test test/admin-media.test.tsx test/film-upload-route.test.tsx test/films-storefront.test.tsx test/phone-films.test.tsx test/admin-home-slides.test.tsx test/admin-template-artwork.test.tsx
```

Phone films (12 Nov 2026) add an API test that a phone film is checked as a film (a picture or a film missing from the library is refused, and nothing is published) and is published with its hero slide or template film; web tests for the contract (library films only, only on video slides), the markup (unchanged without a phone film; no `src` with one), the cut chosen on a phone and on a wider screen for the hero, testimonial and collection films, reduced motion, the staff preview, and the admin pickers (shown with the film, films only, cleared with the film, dropped when a slide becomes an image).

Films (12 Nov 2026) add API tests for uploads (authentication, MP4/WebM recognition, refusal of other and cut-off files, the 80 MB limit before the body is read, abandoned uploads), byte-range serving, publication and the film quota; web tests for the film library, pickers, upload progress, the streaming upload route (a 12 MB body reaches a stand-in API whole) and the players. Their RED evidence was the missing film route (404 versus 401/201/400) and, in the admin, the missing film upload and film picker.

The focused media API suite has 14 passing tests, and the admin UI suite has 12 passing tests. Tests exercise real Express, Sharp, filesystem operations, PostgreSQL transactions, and React interactions. Only UI fetch transport is replaced. Initial API RED evidence was missing-route status assertions (404 versus required 401/201/503); initial UI RED evidence was missing authenticated previews, selection, upload controls, and pagination. Subsequent hardening regressions first failed for publication from prose (200 versus 404), publication with a missing file (no rejection), disconnected processing slots (400 versus 429), and unsafe or malformed UI response data. The same focused commands subsequently passed. API and web TypeScript checks passed. Scoped Semgrep scanned all three media implementation files with 74 rules and zero findings; a redacted Gitleaks filesystem scan of the media API found no leaks. The integrating agent runs the complete repository suite and security checks after all parallel changes land. Deployment verification must separately confirm the shared directory, proxy upload limit, `/media/uploads/` routing, authenticated previews, and private-versus-published behavior through the ordinary browser.
