# Storefront redesign

Since 30 October 2026 the storefront follows the "Maple Website review" Figma file (`nTEPXzov9IuWraGF0Ace6V`, page "Maple Website review") on the pages it designs, and keeps its current look everywhere else until those pages are rebuilt. This replaces the earlier "re-skin without visual change" decision in the shadcn plan.

| Design frame | Node | State |
|---|---|---|
| Product listing ("Maple / Product Listing") | `1049:45133` | Built: `/collections/[handle]` |
| Mega-menu ("Maple / Mega-menu open") | `1049:45634` | Built: the desktop menu panel |
| Product card ("MF / product/243") | `1046:792` | Built: every grid and rail that shows products |
| The Maple promise ("MF / The Maple promise") | `1046:505` | Built: listing and menu |
| Product page ("1440w light") | `999:3` | Built: `/products/[handle]` (gallery, purchase card, "Precision in every detail", related) |
| Homepage ("Maple / Impact Layout") | `1049:27656` | Later |
| Our Story, Help Center, Bulk Enquiry, Wishlist and Account | review images in `251:455` | Later |

### "Maple / PDF Review" (31 October 2026)

A newer set of frames in the same file. The shared pieces come first; each page follows from them.

| Design frame | Node | State |
|---|---|---|
| UI Components ("Maple / PDF Review / UI Components") | `1046:3` | Built: announcement and main navigation (`site-header.tsx`, `site-navigation.tsx`), footer (`site-footer.tsx`), `SectionHeading`, `PromiseSection`, the card's `outlined` (243 px) and `plain` (246 px) surfaces |
| Home, Help Center, Our Story, Chairs, Product Listing, Wishlist and Account, Mega-menu | `1042:2`, `1044:2`, `1044:114`, `1044:236`, `1044:433`, `1045:85`/`1045:129`/`1045:185`, `1045:2` | Later, one page at a time |
| Product Detail | `1044:638` | Later, after catalogue work |

The header is one linen row (logo, menu, search field, account, saved, bag; the menu wraps onto its own row from 750 to 1023 px and the drawer takes over below 750 px). The design has no utility links, so the header no longer shows them; the admin's utility links stay saved but unused. The footer keeps the editors' columns and order; its burgundy band shows the closing line and, when the bulk contact column is on, the bulk phone and email. The customer-service and marketplace contact columns, the find-us heading and the bulk and service headings are not shown.

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
| `text-band` / `text-display` | 26 px / 40 px, line height 1.1 | the footer band's closing line / section titles (Newsreader bold) |

Radii: 6 px buttons (`rounded-sm`), 10 px cards (`rounded-lg`), 12 px images and panels (`rounded-xl`), 14 px the listing introduction (`rounded-2xl`).

## How it is built

- One stylesheet: `apps/web/styles/tailwind.css`, loaded last by the root layout, for the admin and the storefront. Beside it the root layout loads only the font faces (`styles/shopify-fonts.css`, the Shopify storefront's Manrope, Newsreader and Red Hat Display files; Barlow comes from `@fontsource/barlow`) and `styles/checkout.css`. There is no other storefront CSS: since 31 October 2026 every storefront component is on utilities and the legacy sheets (`storefront.css`, the `*-parity.css` files, `campaign-banners.css`, `legacy-chairs.css` and the rest) are deleted.
- `tailwind.css`, in order: the theme tokens; a small global base (box-sizing, the body's paper, ink and 14 px / 1.6 Manrope, scroll padding, link, button and image resets, focus rings, selection, thin scrollbars, the hidden scrollbars of public routes and the reduced-motion stop), every rule wrapped in `:where()` so it weighs nothing; checkout's rules (below); the `[data-store]` base; then the utilities. No preflight. The admin's own scoped base lives in `admin.css` inside `.shop-admin` and restates what it needs.
- Rebuilt components live in `components/store`; the old top-level paths only re-export them and carry no class names (a test checks). Their roots carry `data-store`, and the scoped base (`:where([data-store]) ...`) resets heading sizes and margins, paragraph and list spacing, underline on hover and padded inputs at an element's weight, so a utility always wins. Components re-skinned in the current look restate what the old global element rules gave them (serif headings, paragraph margins, hover underlines) as utilities; shared strings are in `components/store/current-look.ts`, `carousel-styles.ts` and `category-rails.tsx`.
- Checkout is frozen until it is rebuilt: `app/checkout` and `checkout.css` are unchanged, so its legacy class rules (`.button`, `.empty-state`, `.muted`, `.page-section` ...) and the old element rules it relies on (serif `h1`-`h3`, paragraph margins, 44 px inputs) stay in `tailwind.css`, the element rules scoped to the checkout roots (`:where(.checkout-page, .checkout-state)`). The `--paper`, `--ink`, `--burgundy`, `--muted` and `--line` variables checkout.css reads are defined from the tokens.
- The whole app is scanned for utilities; JavaScript negations that read as important utilities (`!visible`, `!paused`) are excluded. `test/tailwind-stylesheet.test.tsx` fails if a generated utility shares a class name checkout still uses, if a base rule outside checkout adds weight, if a top-level component still has class names, or if the root layout loads any stylesheet beyond the three above.
- Tests reach rebuilt markup through `data-*` hooks (`data-product-card`, `data-card-price`, `data-collection-products`, `data-mega`, `data-carousel`, `data-home-cities`, `data-campaign-cta`, `data-chairs-faq` ...).

## Content that the design shows but the shop does not have

Not invented; built only when the data exists:

- Card subtitles ("Accent seating", "Cream fabric"): the catalogue card has no category or fabric field.
- Material, colour and size filters: the catalogue has no such facets. The listing keeps the real filters (search, availability, price, category on the all-furniture page).
- Product page: ratings and review counts, the deal countdown and coupon, "Buy it now" (checkout is still closed; the outlined button asks the team instead), the stock counter, store pickup, the FlexCore video banner, the FAQ and the free-shipping and secure-checkout trust strip. The page keeps its real equivalents: the enquiry link, the postcode enquiry, the accordions and the three promises the shop does make.
