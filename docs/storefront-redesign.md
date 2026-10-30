# Storefront redesign

Since 30 October 2026 the storefront follows the "Maple Website review" Figma file (`nTEPXzov9IuWraGF0Ace6V`) on the pages it designs and keeps its current look everywhere else until those pages are rebuilt. This replaces the earlier "re-skin without visual change" decision in the shadcn plan. Pages ship one at a time; this file grows with each.

| Design frame | Node | State |
|---|---|---|
| Product page ("1440w light") | `999:3` | Built: `/products/[handle]` (gallery, purchase card, "Precision in every detail", related) |
| Product card ("MF / product/243") | `1046:792` | Built: every grid and rail that shows products |

## Tokens

From the design, in `apps/web/styles/tailwind.css` (`@theme static`, so plain CSS can read them too): `brand` #741a14 / `brand-deep` #5c140f, `cream` #f0eae3, `linen` #faf8f4, `espresso` #29251f, `taupe` #746c62, `sand` #e1d9d0, `leaf` #428445; `font-body` Barlow (self-hosted through `@fontsource/barlow`), `font-serif` Newsreader; text sizes `text-label` 12 px to `text-h1` 42 px.

## How it is built

- One Tailwind build for the admin and the storefront (`styles/tailwind.css`, loaded last by the root layout). No preflight; only rebuilt sources (`components/ui`, `components/admin`, `components/store`, `app/admin`) are scanned. `test/tailwind-stylesheet.test.tsx` fails if a generated utility shares a class name the legacy storefront still uses, and keeps shadcn's `dark:` classes off.
- Rebuilt components live in `components/store`; the old top-level path re-exports them. Their roots carry `data-store`, and a scoped base (`:where([data-store]) ...`) neutralises the legacy global rules at the same weight, so any utility still wins.
- When a component moves, the legacy CSS that styled it is deleted.
- Tests reach rebuilt markup through `data-*` hooks (`data-product-card`, `data-card-price`, `data-gallery`, `data-variants` ...).

## Feeding the product page

- `ProductGallery` (`components/store/product-gallery.tsx`) takes `images: string[]` plus the selected index; it knows nothing about variants.
- The option tiles in `ProductDetail` (`components/store/product-detail.tsx`) take the product's variants; a variant's photo is found by `variantImage(id)`, today from the presentation data. Variant names, slugs and per-variant images can be fed through the same two seams.

## Content that the design shows but the shop does not have

Not invented; built only when the data exists: ratings and review counts, the deal countdown and coupon, "Buy it now" (checkout is still closed; the outlined button asks the team instead), the stock counter, store pickup, the FlexCore video banner, the FAQ and the free-shipping and secure-checkout trust strip. The page keeps its real equivalents: the enquiry link, the postcode enquiry, the accordions and the three promises the shop does make.
