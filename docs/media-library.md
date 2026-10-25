# Shop media library

Shop staff can upload JPEG, PNG, and WebP images through the authenticated admin media library. Files are normalized to WebP, stripped of metadata, and resized to fit within 2560 × 2560 pixels. Uploads are limited to 8 MiB and 24 million decoded pixels. SVG and animated images are rejected. Image bytes must match the declared MIME type.

Configure `SHOP_MEDIA_ROOT` as an absolute directory outside the deployed release, for example `/srv/shopmaple/shared/media`. The API service account requires read/write access. Keep the directory private to that service account. Missing configuration disables uploads with a 503 response. Back up both this directory and the PostgreSQL database together; retain files across deployments and rollbacks. Never expose the directory through a generic static server, nginx alias, or public object listing: publication checks run in the API.

## HTTP contract

- `POST /api/admin/media`: raw image body, matching image `Content-Type`, session cookie, `Origin`, and `X-CSRF-Token`. Optional `X-Media-Label` is a URL-encoded label of up to 160 characters. Returns `{asset}` with status 201 for a new asset or 200 for a duplicate. Origin and session/CSRF checks precede body parsing and decoding.
- `GET /api/admin/media?limit=24&cursor=<asset-id>`: authenticated metadata page `{assets,nextCursor}`; maximum 50 assets per page.
- `GET /api/admin/media/:sha/preview`: authenticated image preview, always private/no-store.
- `GET /media/uploads/:sha.webp`: only serves assets whose `publicAt` has been set by a successful content publication transaction. Responses are immutable WebP. Unknown or unpublished assets return 404.

Each serialized asset has `id`, `sha256`, `label`, `width`, `height`, `bytes`, `mimeType`, `createdAt`, `publicAt`, canonical `url`, and authenticated `previewUrl`. The admin uses ordinary image elements for previews so that the Next image optimizer cannot cache or fetch a private preview without the staff session.

Selecting an image updates draft content only. `prepareMediaForPublication(tx, content, mediaRoot)` checks managed references only in Instagram `src`, campaign artwork, and page banner image fields; arbitrary prose never publishes an image. It verifies the persistent file exists, is readable, and matches the recorded size, then marks the referenced assets public in the same transaction that publishes content. Missing references or missing storage abort publication. A transaction rollback leaves private assets private. Once published, immutable image URLs remain public, including after content rollback, so previously cached pages retain their images. Removing an image from content does not delete it.

## Resource and storage limits

Uploads are limited to 10 attempts per minute per client IP and two active uploads per API process. A client disconnect does not release its slot until parsing, decoding, and database work settle. The library has a hard quota of 500 assets and 250 MiB stored image bytes. A PostgreSQL transaction advisory lock serializes quota checks, digest deduplication, and writes across API workers using the same database. Files use SHA-256 names derived from normalized bytes. Temporary files use exclusive creation; final files are installed without overwriting existing paths. Failed temporary writes are removed by their owner. There is no remote URL import or delete endpoint.

The service owns this directory; do not manually add files or use the same root with a different database. A crash between filesystem persistence and database commit can leave an unreferenced immutable image. It remains inaccessible because serving requires a database row. Quota checks account for image files on disk, including unreferenced files. Operational reconciliation should compare hashes against database rows with a backup and explicit removal plan; automatic cleanup is intentionally absent.

## Verification

Focused API: from `apps/api`, using Node.js 22 and the dedicated `shopmaple_test` database:

```sh
npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-media.test.ts
```

Focused admin UI: from `apps/web`:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/admin-media.test.tsx
```

The focused media API suite has 14 passing tests, and the admin UI suite has 12 passing tests. Tests exercise real Express, Sharp, filesystem operations, PostgreSQL transactions, and React interactions. Only UI fetch transport is replaced. Initial API RED evidence was missing-route status assertions (404 versus required 401/201/503); initial UI RED evidence was missing authenticated previews, selection, upload controls, and pagination. Subsequent hardening regressions first failed for publication from prose (200 versus 404), publication with a missing file (no rejection), disconnected processing slots (400 versus 429), and unsafe or malformed UI response data. The same focused commands subsequently passed. API and web TypeScript checks passed. Scoped Semgrep scanned all three media implementation files with 74 rules and zero findings; a redacted Gitleaks filesystem scan of the media API found no leaks. The integrating agent runs the complete repository suite and security checks after all parallel changes land. Deployment verification must separately confirm the shared directory, proxy upload limit, `/media/uploads/` routing, authenticated previews, and private-versus-published behavior through the ordinary browser.
