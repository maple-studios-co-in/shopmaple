# Homepage section builder

Phase 2 of the shadcn plan: the Homepage screen works like a website builder, with a real picture of every section.

## What staff see

- **Section rail.** Each homepage section is a card with a live thumbnail of that section, its name, a visibility switch, a drag handle and Move buttons. Hidden sections stay in the rail, dimmed, so their place in the order is kept.
- **Select.** Clicking a card selects it: the live preview scrolls to the section and outlines it, and the card shows where its content is edited (the section's panel on this screen, or the Campaigns, Merchandising or Instagram screen).
- **Select in the preview.** Hovering a section in the live preview outlines it and shows an "Edit <section>" button; pressing it selects the section in the rail.
- **Add section.** The homepage has 18 fixed section types, each used once, so adding a section means showing a hidden one. "Add section" opens a picker with the thumbnail of every hidden section; choosing one shows it and places it after the selected section (or at the end).

## How the thumbnails work

A thumbnail is the real section rendered by the real storefront components from the draft, not a stored image:

- The staff-only frame route takes `?section=<key>` on the home page and renders only that section, without the store's navigation, footer, ribbon or frame bridge, with reveal effects and autoplay off.
- The card embeds it in an iframe sandboxed **without scripts** (`sandbox="allow-same-origin"`): the server-rendered HTML and CSS draw the section, nothing hydrates, so eighteen thumbnails cost eighteen static documents, not eighteen running storefronts. The iframe is 1,280 px wide, scaled down to the card and cropped to the top of the section; it is hidden from assistive technology and takes no pointer or keyboard input.
- Preview links are bound to one draft version (the API rejects a stale one), so the rail and the live preview share one token from `usePreviewToken`, minted once per version.
- A thumbnail loads when its card scrolls into view and reloads only when the draft is saved with a change to that section's own content (`sectionSignature`). Reordering or hiding sections never reloads a thumbnail.

## Out of scope

Inline text editing in the preview, undo and redo, and a publish diff are later steps. Product rails (Bestsellers, Chairs) show the catalogue as it is when the thumbnail renders.
