# Admin redesign: audit, design system and live preview

The `/admin` dashboard was rebuilt to a premium standard with a builder-style live preview. This document records the audit of the previous admin, the design system every admin screen now shares, the font handling, and the live-preview model. It is a companion to [admin-preview-and-reordering.md](admin-preview-and-reordering.md) (preview token model, drag-and-drop) and [admin-crm.md](admin-crm.md) (CRM).

## 1. Audit of the previous admin (29 October 2026)

Reviewed in the running app at 1440 px and 375 px, signed in as a local publisher with enquiry access, on every screen: sign-in, overview, homepage, navigation and footer, merchandising, artwork, campaigns, Instagram, pages, existing pages, policies and blogs, category pages, media, enquiries (list, board, follow-ups, contacts), history and the standalone draft preview.

Design read: a dense content-management tool for a small team, rebuilt as a calm "workbench" that keeps the storefront's cream and burgundy identity but stops imitating the storefront's marketing typography. Dials: variance 4, motion 4, density 6.

Generic patterns removed:

- **No shell.** A page title, a thin toolbar and a loose column of tab buttons; nothing told staff where they were, whether the storefront was published, or who was signed in beyond a raw `email · role` string.
- **Storefront marketing type used for tool chrome.** Newsreader display headings at 36 px and a 72 ch paragraph of onboarding prose on the overview ("Your storefront, ready for its next chapter"). Admin screens now use one UI face for text and a display face only for page titles and large numerals.
- **Three accents and two gray families.** Burgundy, the CRM's green, slate and ochre were all used as accents; borders mixed `#d4d4ca`, `#dedbd5`, `#9e9e92` and `#dcd9d2`. One accent (burgundy) and one warm ink-tinted neutral ramp remain; green, ochre and slate are semantic state colours only (success, warning, info).
- **Square white buttons with a 1 px grey border everywhere, no hover or pressed feedback outside the CRM.** Replaced with one button family (primary, default, quiet, small, icon) with hover, active and disabled states and tinted shadows.
- **Unstyled native controls.** File inputs, checkboxes in bare labels, `<details>` disclosures with default markers, bare `<fieldset>`/`<legend>` groups and two different field styles (`.admin-field` vs `.crm-field`).
- **Lists built from hairlines.** Every ordered list (sections, posts, revisions, chrome items) was rows separated by top and bottom borders. They are now rows on a sunken shell with a raised card per row, which also gives drag-and-drop a visible lift.
- **Alerts as full-width coloured bars** pushed the whole page down on every save; notices now sit in a fixed stack at the top of the content area with the right tone and a dismiss control.
- **Loading and error states as plain sentences** ("Loading store content…", "We couldn't load your images. Please try again. Retry"). Every screen has a designed skeleton, empty, error and saving state.
- **First-load error on every page open.** In development, React StrictMode mounts the editor twice; the first request is aborted by the request hook's cleanup and the editor reported it as "We couldn't load your draft" even though the second request succeeded. Aborted requests are no longer reported.
- **Preview in a separate tab with a burgundy warning bar and a yellow rule**, mobile toggle only, and no link back to what was being edited. Replaced by an in-page live preview (section 3) and a restyled standalone preview.
- **Mobile layout**: 14 wrapped pill buttons for navigation, a toolbar that stacked three full-width buttons, and the account block wrapping the email mid-word.
- Em-dashes and middle dots used as separators in status text and the preview ribbon.

Patterns preserved: every route, API contract, form field name, `aria-label`, keyboard shortcut and announcement; the brand palette; the CRM screens' structure (restyled on the shared tokens; no CRM logic or routes changed).

## 2. Design system

All tokens live on `.shop-admin` in `apps/web/styles/admin.css` as `--admin-*` custom properties. The CRM's `--crm-*` names remain as aliases of the admin tokens.

Since 29 October 2026 the admin is built on **shadcn/ui** (`apps/web/components.json`, primitives in `apps/web/components/ui`) and **Tailwind 4**, and `admin.css` is the token file only: the tokens, the shadcn variable mapping (`--background`, `--primary`, `--border`, `--ring`, `--sidebar-*` ... all point at `--admin-*`), the `@theme inline` block that turns them into utilities (`bg-card`, `text-muted-foreground`, `text-faint`, `bg-success-bg`, `font-display`, `ease-admin` ...), and a scoped base. There is no component CSS: screens compose `components/ui` and the admin kit (`components/admin/kit.tsx`, `crm-primitives.tsx`, `data-table.tsx`, `field.tsx`, `sortable-list.tsx`) with utilities. AGENTS.md forbids new hand-written admin CSS.

How it stays off the storefront: Tailwind's theme variables load in a cascade layer, there is no global preflight, only admin sources are scanned, and utilities are `important` so they beat the storefront's global element rules (which the root layout loads on every route) without any storefront stylesheet changing. The scoped base lives under `.shop-admin`; overlays (dialog, sheet, menus, popovers, tooltips, select) portal into the `.shop-admin` element through `AdminRoot`. Markup the admin draws inside the storefront preview frame (the ribbon, the section highlight) reads the tokens through `[data-admin-tokens]` without the base.

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `--admin-canvas` | `#edebe4` | Workbench background behind panels |
| `--admin-surface` | `#fbfaf6` | Panels, cards, fields |
| `--admin-surface-raised` | `#ffffff` | Hovered or lifted cards, popovers |
| `--admin-surface-sunken` | `#e4e2d9` | Shells that hold cards, segmented controls, skeletons |
| `--admin-ink` / `-muted` / `-faint` | `#23261f` / `#5b5e57` / `#62655f` | Text hierarchy. Contrast on the surface `#fbfaf6`: 15.0:1, 7.1:1 and 5.7:1; faint on the sunken surface `#e4e2d9` is 4.7:1, so the 11 to 12.5 px labels (nav groups, roles, CRM meta, eyebrows) clear AA |
| `--admin-accent` / `-strong` / `-tint` | `#741a14` / `#57140f` / `rgba(116,26,20,.07)` | The single accent: primary actions, current state, focus |
| `--admin-line-soft` / `-line` / `-line-strong` | ink at 8 % / 50 % / 62 % | Decorative dividers only (soft); control boundaries at 3.1:1 on the surface (line); field borders at 4.5:1 on white (line-strong), meeting the 3:1 non-text minimum |
| `--admin-success`, `--admin-warning`, `--admin-info`, `--admin-danger` | green, ochre, slate, burgundy (+ `-bg` tints) | Semantic state only: notices, chips, due badges. Warning is `#71530f` so the unsaved chip clears 4.5:1 on its tint over the canvas (5.2:1) and the sunken surface (4.8:1) |

Shadows are tinted with the ink colour, never pure black: `--admin-shadow-s` (hairline lift), `--admin-shadow-m` (hover), `--admin-shadow-lift` (dragging, dialogs, the preview device frame).

### Type

- **Display**: `--admin-font-display: "TAN Pearl", "Newsreader", Georgia, serif`. Words only: page titles, the sign-in title and empty-state titles. TAN Pearl's zero reads as parentheses, so it is never used for numbers. The fallback is the storefront serif, so the admin reads correctly when the licensed file is absent.
- **Text**: `--admin-font-text: "Geist Variable", "Manrope", system-ui, sans-serif`, self-hosted from `@fontsource-variable/geist` (OFL); no font CDN is called. Every number (overview and CRM tiles, versions, history badges, dates) uses this face with tabular figures (`--admin-tnum`).
- Scale (`--admin-type-*`): 11 / 12.5 / 13.5 / 15 / 18 / 22 / 28 / 36 / 44 px. Line heights 1.2 for display, 1.5 for UI text, 1.6 for prose. Tracking: -0.01 em on titles, +0.06 em on the few uppercase labels.

### Space, shape, elevation, density

- Spacing scale `--admin-space-1..8`: 4, 8, 12, 16, 24, 32, 48, 64 px.
- One radius scale: `--admin-radius-s` 6 px (controls), `-m` 10 px (cards, fields), `-l` 16 px (shells). Nested surfaces use `calc(outer - padding)` so curves stay concentric.
- Density: 36 px sidebar rows, 40 px fields, 38 px buttons (32 px small), 14 px body text, 2-column field grids above 720 px.
- Z scale: `--admin-z-sticky` 10, `-drag` 20, `-overlay` 40, `-dialog` 50.

### Motion

`--admin-ease: cubic-bezier(.32,.72,0,1)`, durations 140 / 260 / 420 ms. Only `transform`, `opacity`, colour and shadow animate. Under `prefers-reduced-motion: reduce` every transition, skeleton shimmer and lift transform is disabled, and the preview frame changes width instantly.

### Focus and accessibility

`:focus-visible` draws a 2 px accent ring with 2 px offset; fields add a 3 px accent-tint halo. Navigation uses `aria-current="page"`, the device toggle uses `aria-pressed`, the published/draft switch is a labelled radio group, notices use `role="alert"` or `role="status"`, and the preview frame has a descriptive title. The sidebar collapses to a labelled `<select>` at phone width so every section stays reachable with one control.

## 3. Builder-style live preview

Every content editor that has a storefront page (homepage, navigation and footer, merchandising, artwork, campaigns, Instagram, pages, existing pages, policies and blogs, category pages) can open **Live preview** from the top bar. The workspace splits into the editor and a preview pane that embeds the existing staff-only frame route, `/admin/preview-frame/<page>?token=…`.

- **Tokens.** The pane mints a token with `POST /api/admin/content/preview { expectedVersion }` for the loaded draft version, and mints again whenever the draft version changes, because tokens are bound to the staff id and version. It also re-mints shortly before the 15-minute expiry. Nothing about the token model, the `X-Frame-Options` headers or the API changed.
- **Updating as you edit.** The frame renders the saved draft, so the pane saves the draft after a 1.2 s pause in editing (the same `PUT` with the same version check as **Save draft**), then re-mints and reloads the frame. Each save is a revision, exactly as a manual save is. Live updates can be paused; **Update preview** then saves and refreshes on demand. While a field is invalid the pane keeps the last good preview and says so instead of raising an alert on every keystroke. A version conflict stops live updates and shows the usual reload prompt.
- **Published vs draft.** The switch loads `…&view=published`, which the frame route renders from the published snapshot (still behind the staff session and token; the public storefront is never framed, since it keeps `X-Frame-Options: DENY`).
- **Device widths.** Desktop (fills the pane), tablet (820 px) and phone (390 px) resize the frame itself so the real responsive layout runs.
- **Section focus.** When a homepage section row gains focus in the editor, the pane posts `{ source: "shopmaple-preview", type: "focus", section }` to the frame; the frame scrolls that `data-home-section` into view and highlights it. The frame posts `{ type: "ready", sections, path, version }` after load and `{ type: "navigate", path }` when a link inside it is followed. Both sides ignore any message whose `origin` is not `window.location.origin`, and the frame ignores messages that do not come from its parent window.
- **Full screen.** The pane can take the whole viewport; Escape or the close button returns to the split view. Links inside the frame keep navigating within the preview with the same token and the same view, as before.
- **Failure handling.** A token is minted once per draft version and attempt. If minting fails (no draft saved yet, the draft moved on, a 429 rate limit, a 5xx or a timeout) the pane shows the reason with a manual **Retry preview** and never retries on its own; a 409 from minting never marks the editor as conflicted. Quiet saves never take the busy state, so fields stay enabled and focus stays put; if a quiet save fails, live updates pause behind one persistent notice with **Retry save** and resume only after a manual save succeeds.
- **Layout.** The pane is sticky beside the editor and fills the viewport below the top bar, so the storefront stays in view while the editor scrolls. At phone width an **Editor / Preview** toggle shows one or the other, and the full-screen controls stay on the first toolbar row.

The orchestration lives in `apps/web/lib/live-preview.ts` (pure helpers: frame URL, message parsing, trusted-origin check, debounce) and `apps/web/components/admin/live-preview.tsx` (the pane). Tests: `apps/web/test/admin-live-preview.test.tsx`, `admin-shell.test.tsx` and `admin-screens-smoke.test.tsx`.

## 4. Fonts and the server symlink

`apps/web/public/fonts/licensed/` holds the commercially licensed TAN Pearl files (`tan-pearl.woff2`, `tan-pearl.woff`, Regular only). The folder is listed in `.gitignore` and must never be committed. On the server it is a symlink to a private shared directory, so the `@font-face` source paths are exactly `/fonts/licensed/tan-pearl.woff2` and `/fonts/licensed/tan-pearl.woff`, declared with `font-display: swap`. When the files are absent the display face falls back to Newsreader, then Georgia; nothing else in the admin depends on it.
