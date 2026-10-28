# Admin draft preview and drag-and-drop reordering

This release adds two editing aids to the `/admin` dashboard. Neither changes what visitors see: publishing is still a separate, explicit step, and checkout stays disabled.

## Draft preview

**Preview draft** sits next to **Save draft**. It saves unsaved changes first using the same version check as saving, so a stale editor still gets the 409 conflict message and nothing is previewed until the latest draft is reloaded. Once the draft is current the editor asks the API for a preview token and opens `/admin/preview/<page>?token=…` in a new tab. If the browser blocks the tab, the editor shows an **Open draft preview** link instead.

The preview tab shows a fixed banner, **Draft preview — not published**, the draft and published version numbers, a page switcher covering the homepage, category landing pages, Our Story, Nimbus, contact, bulk enquiry, returns, informational pages, policies and blogs, and a **Desktop / Mobile** width toggle. The page itself renders inside an iframe at `/admin/preview-frame/<page>?token=…` so the mobile toggle exercises the real responsive layout. Links inside the frame reopen within the preview with the same token.

Previews use the same components as the public routes. The public routes keep calling those components with the published snapshot; the preview calls them with the draft. A markup test (`apps/web/test/home-markup-snapshot.test.tsx`) pins the public homepage output for the default content.

### Token model

- `POST /api/admin/content/preview` with `{ expectedVersion }` requires a staff session, the CSRF header and the web origin, like saving. It returns `{ token, version, expiresAt }`. A missing draft is a 409 (`CONTENT_DRAFT_REQUIRED`); a stale `expectedVersion` is the usual 409 conflict.
- The token is `base64url(payload).base64url(HMAC-SHA256)` where the payload holds the staff id, the draft version and a Unix expiry at most **15 minutes** ahead. The secret is `ADMIN_PREVIEW_SECRET` (32–256 characters) when set; otherwise each API process generates a random key at start, so tokens only outlive a restart when the variable is configured. One API process is deployed today, so the variable is optional; set it before running several API workers.
- `GET /api/admin/content/preview?token=…` requires the staff session cookie *and* a token signed for that same staff id (403 `PREVIEW_TOKEN_INVALID` otherwise, 403 `PREVIEW_TOKEN_EXPIRED` after expiry) and for the current draft version (409 `PREVIEW_VERSION_STALE` after any later save). Anonymous requests get 401. Responses carry `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`, and the preview never writes a revision or touches the published snapshot.
- The web app forwards only the `shop_admin` / `__Host-shop_admin` cookie to the API when it renders a preview. Preview pages are dynamic, so Next serves them `no-store` (the config also requests `private, no-store` for `/admin/*`); only `/admin/preview-frame/*` may be framed, and only by the same origin (`X-Frame-Options: SAMEORIGIN`, `DENY` everywhere else).

### Private media

Library uploads that are not yet public are rewritten in the preview from `/media/uploads/<sha>.webp` to the existing staff-only `/api/admin/media/<sha>/preview` route. Those images render with the Next image optimizer bypassed, because the optimizer would neither send the staff cookie nor respect `no-store`. Nothing becomes public until the draft is published, which is when media is marked public today.

## Drag-and-drop reordering

Every ordered list in the editor uses one shared `SortableList` component (`apps/web/components/admin/sortable-list.tsx`, built on `@dnd-kit/core`, `@dnd-kit/sortable` and `@dnd-kit/utilities`, pinned exactly). Lists covered: homepage sections, city artwork, merchandising product rails and collection tiles, category page sections, Our Story and Nimbus sections, contact and bulk enquiry sections, navigation items, submenu columns and links, footer columns, footer links, and authored article or page blocks.

Each row has a grip button labelled **Drag <item>**. Dropping an item produces exactly the array that repeated **Move up** / **Move down** presses would produce, so saved drafts validate against the unchanged content contracts. The Move buttons stay as the fallback.

### Keyboard controls

| Key | Effect |
| --- | --- |
| Tab to a grip, then **Space** or **Enter** | Lift the item. The live region announces its current position. |
| **↑** / **↓** | Move the lifted item one position; each move is announced. |
| **Space** or **Enter** | Drop the item in the announced position. |
| **Escape** | Cancel and return the item to where it was. |

Pointer users drag the grip; a coloured edge on the row under the pointer shows where the item will land, and a short press without movement does nothing. Touch dragging is enabled on the grip (`touch-action: none`), while the rest of the row still scrolls.
