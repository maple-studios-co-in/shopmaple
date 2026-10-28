# Admin draft preview and drag-and-drop reordering

Two admin improvements requested by the owner after the 27 October 2026 review: a visual preview of the draft before publishing, and drag-and-drop instead of Move up/Move down buttons. Neither changes what visitors see, the content contracts in `packages/contracts`, checkout, or the `CHECKOUT_ENABLED` semantics.

## Draft preview

### What staff see

The editor toolbar has a **Preview draft** button next to **Save draft**. Pressing it saves any unsaved changes first (the usual `expectedVersion` check applies, so a 409 shows the existing "another editor saved a newer version" guidance and nothing opens), then opens `/admin/preview/<page>?token=…` in a new tab. The page that opens matches the editor tab: the homepage for homepage, merchandising, artwork, campaign and Instagram tabs; the selected existing page; the Sofas page for category pages; the first custom page; the first policy for policies and blogs. A link stays in the notice in case the browser blocked the new tab.

The preview shell shows a fixed banner, "Draft preview — not published", with the draft version, a page switcher covering the homepage, the three category pages, Our Story, Nimbus, Contact, Bulk Enquiry, Return & Exchange, custom pages, policies, blog indexes and authored articles (including ones not yet published), and a **Desktop** / **Mobile** width toggle. The storefront page is rendered inside a same-origin frame so the mobile toggle exercises the real responsive layout. Links inside the frame lead to the live storefront, not to other draft pages; use the page switcher to move between draft pages.

The frame renders the draft's header, footer and page through the same components the public routes use. Private media library images that have not been published yet load through the existing staff-only `/api/admin/media/<sha>/preview` path, with image optimization disabled for those sources so the optimizer never fetches or caches them; they do not become public.

### Token model

`POST /api/admin/content/preview` with `{ expectedVersion }` (staff session cookie plus `X-CSRF-Token`, like every other admin write) returns `{ token, version, expiresAt }`. `GET /api/admin/content/preview?token=…` returns `{ version, content }` for the current draft. Both responses are `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`; anonymous callers get 401.

A token is `base64url(payload).base64url(signature)`:

- The payload names the staff id, the draft version it was minted for and an expiry fifteen minutes after minting.
- The signature is an HMAC-SHA256 over the payload with a key derived from the SHA-256 hash of the staff session cookie that minted it (the same hash the session table stores). There is no separate preview secret to configure or rotate.
- The API verifies the token against the hash of the session cookie presented with the request, so a token only works together with the browser session that minted it. Another staff account, another session of the same account, a logged-out session or a tampered token gets 403 `PREVIEW_TOKEN_INVALID`; an old token gets 403 `PREVIEW_TOKEN_EXPIRED`.
- If the draft version no longer matches, the API returns 409 `PREVIEW_STALE` and the preview page asks for a fresh preview.

The web preview routes (`/admin/preview/…` and `/admin/preview-frame/…`) forward the browser's staff cookie to the API, are `private, no-store`, carry `noindex`, and never fall back to published or bundled content when the draft cannot be read: they show a sign-in, expired or changed message instead. The frame route answers `X-Frame-Options: SAMEORIGIN` (all other pages stay `DENY`).

### Shared renderer

`apps/web/components/storefront/storefront-page.tsx` resolves a storefront path and renders the page from a `StorefrontContent` object. Public routes call the same components with `getPublishedContent()`; the preview passes the draft. `test/public-homepage-snapshot.test.tsx` holds the public homepage markup for the default content and must stay unchanged by renderer work (regenerate deliberately with `UPDATE_HOMEPAGE_SNAPSHOT=1` only when the homepage itself is meant to change).

## Drag-and-drop reordering

Every ordered admin list (homepage sections, city artwork, merchandising rails and tiles, category page sections, Nimbus and Our Story sections, Contact and Bulk Enquiry sections, navigation and footer rows, article and page blocks) uses the shared `SortableList` in `apps/web/components/admin/sortable-list.tsx`, built on `@dnd-kit/core`, `@dnd-kit/sortable` and `@dnd-kit/utilities` (pinned exact versions).

Each row has a drag handle labelled "Reorder <item>". Dragging with a mouse, pen or touch lifts the row, the row under the pointer shows the drop indicator, and releasing drops it. The **Move up** / **Move down** buttons remain as the accessible fallback and share the same `moveItem` helper, so a drop produces exactly the array a sequence of neighbour swaps would.

Keyboard controls on a handle:

| Key | Action |
| --- | --- |
| Tab | Reach a handle; the handle names the item it moves. |
| Space or Enter | Lift the item. |
| Up / Down arrow | Move the lifted item one position. |
| Space or Enter | Drop it in the new position. |
| Escape | Cancel and restore the original order. |

A live region announces the lift with the current position, each move with the new position, the drop, and a cancellation. Nothing is saved until **Save draft**, exactly as with the buttons.

## Verification

- `apps/web/test/sortable-list.test.tsx`: keyboard and pointer paths, cancel, announcements, button equivalence.
- `apps/web/test/admin-drag-reordering.test.tsx`: one saved-draft-order test per adopting form.
- `apps/api/test/admin-content-preview.test.ts`: auth, CSRF, expiry, staff and session binding, version binding, headers.
- `apps/web/test/storefront-preview-render.test.tsx`, `admin-preview-page.test.tsx`, `admin-preview-button.test.tsx`: renderer, preview pages and the editor flow including the 409 path.
