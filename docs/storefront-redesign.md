# Storefront redesign

Since 30 October 2026 the storefront follows the "Maple Website review" Figma file (`nTEPXzov9IuWraGF0Ace6V`, page "Maple Website review") on the pages it designs, and keeps its current look everywhere else until those pages are rebuilt. This replaces the earlier "re-skin without visual change" decision in the shadcn plan.

| Design frame | Node | State |
|---|---|---|
| Product listing ("Maple / Product Listing") | `1049:45133` | Built: `/collections/[handle]` |
| Mega-menu ("Maple / Mega-menu open") | `1049:45634` | Built: the desktop menu panel |
| Product card ("MF / product/243") | `1046:792` | Built: every grid and rail that shows products |
| The Maple promise ("MF / The Maple promise") | `1046:505` | Built: listing and menu |
| Product page ("1440w light") | `999:3` | Next |
| Homepage ("Maple / Impact Layout") | `1049:27656` | Later |
| Our Story, Help Center, Bulk Enquiry, Wishlist and Account | review images in `251:455` | Later |

## Tokens

From the design, in `apps/web/styles/tailwind.css` (`@theme static`, so plain CSS can read them too):

| Token | Value | Use |
|---|---|---|
| `brand` / `brand-deep` | `#741a14` / `#5c140f` | buttons, prices, badges, eyebrows / hover |
| `cream` | `#f0eae3` | feature cards, promise strip, prompts |
| `linen` | `#faf8f4` | shopping area background |
| `espresso` | `#29251f` | text |
| `taupe` | `#746c62` | secondary text |
| `sand` | `#e1d9d0` | card and button borders |
| `font-body` / `font-serif` | Barlow (self-hosted through `@fontsource/barlow`, 400 to 700) / Newsreader | UI text / headings |
| `text-label` ... `text-h1` | 12 / 13 / 14 / 15 / 16 / 17 / 19 / 22 / 25 / 29 / 42 px | |

Radii: 6 px buttons (`rounded-sm`), 10 px cards (`rounded-lg`), 12 px images and panels (`rounded-xl`), 14 px the listing introduction (`rounded-2xl`).

## How it is built

- One Tailwind build for the admin and the storefront (`styles/tailwind.css`, loaded last by the root layout). No preflight; only `components/ui`, `components/admin`, `components/store`, `app/admin` and one admin helper are scanned, so legacy markup gets no utilities. `test/tailwind-stylesheet.test.tsx` fails if a generated utility shares a class name the legacy storefront still uses.
- Rebuilt components live in `components/store`; the old top-level path re-exports them. Their roots carry `data-store`, and a scoped base (`:where([data-store]) ...`) neutralises the legacy global rules (serif `h1`-`h3`, paragraph margins, underline on hover, 44 px padded inputs) at the same weight, so any utility still wins.
- When a component moves, the legacy CSS that styled it is deleted (the old card, listing and menu panel rules went in this step).
- Tests reach rebuilt markup through `data-*` hooks (`data-product-card`, `data-card-price`, `data-collection-products`, `data-mega` ...).

## Content that the design shows but the shop does not have

Not invented; built only when the data exists:

- Card subtitles ("Accent seating", "Cream fabric"): the catalogue card has no category or fabric field.
- Material, colour and size filters: the catalogue has no such facets. The listing keeps the real filters (search, availability, price, category on the all-furniture page).
- Ratings and review counts, a deal countdown, store pickup and delivery estimates (product page design): no data behind them.
