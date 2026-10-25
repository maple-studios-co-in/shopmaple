---
name: Maple Furnishers storefront
description: Implemented preview preserving the existing Maple Shopify visual identity.
colors:
  paper: "#f4f2ec"
  ink: "#292d28"
  burgundy: "#741a14"
  muted: "#5d605a"
  line: "#dfded7"
  white: "#fff"
  green: "#294a34"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "48px"
    fontWeight: 500
    lineHeight: 1.13
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.13
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  navigation:
    fontFamily: "Manrope, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  category-title:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.13
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    letterSpacing: "0.12em"
rounded:
  square: "0"
  cart-image: "6px"
  mobile-image: "8px"
  product-image: "12px"
  hero-image: "16px"
  circular: "50%"
spacing:
  gap-small: "12px"
  gap-medium: "16px"
  inset: "20px"
  section-gap: "24px"
  page-gutter: "40px"
  section-block: "48px"
components:
  button-primary:
    backgroundColor: "{colors.burgundy}"
    textColor: "{colors.white}"
    rounded: "{rounded.square}"
    padding: "13px 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.burgundy}"
    rounded: "{rounded.square}"
    padding: "13px 24px"
  button-light:
    backgroundColor: "{colors.white}"
    textColor: "{colors.burgundy}"
    rounded: "{rounded.square}"
    padding: "13px 24px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "10px 14px"
  navigation:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.navigation}"
    height: "39px"
  category-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "6px 16px"
  category-tab-selected:
    backgroundColor: "{colors.burgundy}"
    textColor: "{colors.white}"
    padding: "6px 16px"
  category-tile:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    rounded: "{rounded.hero-image}"
  product-card-image:
    rounded: "{rounded.product-image}"
---

# Design System: Maple Furnishers storefront

## Overview

The visual authority is the owner's existing [Shopify storefront](https://shop.maplefurnishers.com), inspected on 25 October 2026. This is source-preservation work for an initial custom storefront, not an approved new visual concept. The cream canvas, burgundy identity, original Maple logo, workshop footage and green furniture category imagery carry that authority forward.

The frontmatter and measurements below preserve the earlier implementation snapshot from `apps/web/styles/storefront.css`, `apps/web/components/` and `apps/web/app/page.tsx`. They are not a complete inventory of later page-specific overrides; the Phase 3 extension does not replace these historical token values or regenerate `.impeccable/design.json`. A first-viewport desktop comparison supports the preserved header and hero composition; it does not establish full template parity. The mobile layout is an implemented adaptation whose exact equivalence to Shopify remains unproven. The initial full-page captures are `.impeccable/review/desktop.png` and `.impeccable/review/mobile.png`; they are historical review evidence, not a parity certification. Phase 3 adds the Sofas, Tables, Chairs, Nimbus and Our Story pages using the original theme settings, published content and media recorded in `apps/web/data/landing-PROVENANCE.md`. The newer screenshots and bounded first-viewport review are recorded in `docs/ui-parity-progress.md` and `.impeccable/review/phase3/packet.md`; they do not establish full template or mobile parity.

**Key Characteristics:**
- Cream surfaces with burgundy identity and actions.
- Serif headings paired with restrained sans-serif interface text.
- Original furniture media with generous image areas and minimal card chrome.
- Rounded imagery paired with square buttons, fields and category tabs.

**The Incumbent Authority Rule.** Resolve visual questions against the existing Shopify site and its original assets; do not treat this initial recreation as permission to redesign it.

The product remains a development preview. Catalogue data is a dated Shopify snapshot, live Keeri publication is pending, and checkout is unavailable. Keep visible preview disclosures accurate. Full template fidelity, payment integration and Keeri handoff are not complete; see `PRODUCT.md` and `README.md` for scope.

## Colors

Primary: burgundy provides the announcement bar, headings, prices, primary buttons, selected controls and contact band. Green supports the original category imagery and tile fallback.

Neutral: paper is the continuous canvas; ink provides readable body text; muted supports secondary explanations; line separates navigation, lists and forms; white provides reverse text and light actions. The frontmatter preserves the exact CSS custom-property values without renaming the implementation's vocabulary.

**The Media Color Rule.** Preserve the original media's colors. Do not recolor product photographs or replace source art with generated substitutes to match a token palette.

The sidecar's tonal ramps are explicitly generated panel previews, not implemented or approved additional colors. One-off hover colors, borders and translucent overlays remain documented in component snippets rather than becoming a new global palette.

## Typography

Manrope supplies body copy, utility links, prices and controls. Newsreader supplies headings. The layout self-hosts weights 400, 500 and 600 for both families, and Red Hat Display weights 400, 500, 600 and 800. Red Hat Display is assigned to source-derived accents in the home, contact and landing parity stylesheets. This corrects the earlier claim that it was not loaded; page-specific assignments do not replace the preserved frontmatter typography roles. The original text-footer description and the sidecar component/narrative samples predate the current source-image footer and later template overrides; see the drift record in `docs/ui-parity-progress.md`.

The default heading and body roles are in the frontmatter. Section titles use 44px on desktop and 34px on mobile; product titles use 42px on desktop and 34px below 1000px. Category titles use 20px below 1000px. Product-card names use 15px and reduce to 12px on mobile. Avoid interpreting these page-specific sizes as a universal fixed scale.

**The Logo Asset Rule.** Preserve the original Maple logo asset in the header. The existing text-rendered footer mark is an implementation detail, not evidence of exact source-logo parity.

## Layout

Desktop header: announcement 42px; main header 108px with 40px horizontal padding; centered 200×100px logo; category navigation 39px. Utility links sit left and search/account/favourites/cart sit right. Navigation groups use native disclosure menus.

Desktop home hero: 20px outer gutters, 24px top margin, 16px column gap, 500px height, equal workshop and category halves. The right half contains a two-by-two grid with a 12px gap. Above 1600px, hero height is 600px with a 1560px maximum width. At or below 1000px its height is 420px.

Regular sections have a 1440px maximum width and 48px vertical / 40px horizontal padding. Product grids use four columns, then three at 1000px and two at 700px; desktop gaps are 12px horizontally and 36px vertically. The category grid changes from six columns to three on mobile. Product details use two columns and collapse to one on mobile.

At or below 700px, the announcement is 32px and header 76px with a 128×64px logo. The header shows the menu, search and cart; account and favourites remain accessible through the mobile menu. The hero stacks the 360px workshop panel above the two-by-two categories, using 12px side gutters and a 14px top margin. Category tiles use a 1.2 aspect ratio. Regular sections use 32px vertical / 16px horizontal padding. Footer columns reflow and cart rows move the price under the item description.

The festive banner uses the original 2784×700 desktop artwork and 4796×4796 mobile artwork through a responsive picture, links to chairs, and uses `object-fit: contain`. Preserve baked-in promotional text and the artwork's aspect ratio; never crop it to an arbitrary fixed height. The source-selection breakpoint is recorded in the sidecar. The initial clipped banner and incorrect destination were corrected before these refreshed screenshots.

**The Reference Check Rule.** Check desktop and mobile against their own incumbent references; a desktop match does not prove mobile parity or the rest of the site's templates.

## Elevation & Depth

The normal page and product cards are flat. Separation comes from the cream canvas, image areas, whitespace and fine borders. Navigation dropdowns use a restrained `0 8px 16px #292d2810` shadow; the development preview badge uses `0 2px 8px #292d2810`. Modal backdrops use `#17171175`. Do not spread these utility overlays' depth treatment across ordinary product cards.

## Shapes

Large desktop hero imagery uses the hero-image radius; product imagery uses product-image; mobile product imagery uses mobile-image. Mobile hero panels use product-image. Cart thumbnails use cart-image. Buttons, inputs and category tabs are square. Save buttons, count badges and video controls are circular. Thin borders distinguish fields, selected thumbnails, tabs and accordion rows.

## Components

- **Buttons:** solid burgundy primary, transparent outlined secondary, and white light variant. Minimum height 48px; compact variant 42px with 8px / 18px padding. Primary hover darkens to `#571710`; secondary hover fills `#e9dfd6`. Disabled buttons use 0.5 opacity and a not-allowed cursor.
- **Fields:** transparent background, square outline (`#a9a99f`), minimum 44px height, muted placeholder and burgundy caret. Labels must remain accessible even when visually hidden.
- **Navigation and tabs:** desktop text navigation has a bottom rule and disclosure dropdowns; mobile navigation opens in a dialog. Category tabs use a line border, with burgundy fill and white text for `aria-current="page"`.
- **Hero category tiles:** original image, white upper-left title and starting-price line, upper-right arrow. Image-only scale on hover is 1.025 over 0.35s. Keep the text outside the image crop.
- **Product cards:** square image, circular save control, name and burgundy price below. The details strip appears on hover or keyboard focus within the image; it is hidden on mobile, where image/name links remain. Saved hearts fill burgundy and expose `aria-pressed`.
- **Workshop panel:** original compressed local video with poster, deferred automatic playback after 1500ms, silent loop and explicit play/pause control. Reduced-motion preference prevents automatic playback; manual play remains available.
- **Dialogs and cart drawer:** cream panels with labeled headings. General dialogs cap at 600px and 90dvh; the cart drawer is right-aligned, full-height and capped at 540px. Mobile panel padding reduces from 28px to 20px.
- **Preview disclosure:** a small fixed lower-left status badge and contextual checkout text identify the development state. This is preview UI, not part of the inherited production brand system.

**The Visible Focus Rule.** Interactive controls retain the implemented 2px burgundy outline with 4px offset on keyboard focus; do not remove it to mimic a screenshot.

Link hover uses an underline with 5px offset. Buttons transition background and color over 0.15s; product detail strips transition opacity and translation over 0.2s. Reduced-motion styles disable transitions and animations and restore automatic scrolling behavior.

Media provenance is recorded in `apps/web/public/media/PROVENANCE.md`: local workshop derivatives come from the published Maple Shopify video; other current images use original Shopify CDN URLs. No new generated product imagery is introduced. Asset hosting migration remains pending.

## Do's and Don'ts

### Do:
- Do preserve the existing Maple identity, original media and source artwork proportions.
- Do use the implemented cream, burgundy, Manrope and Newsreader vocabulary consistently.
- Do keep keyboard focus, dialog labels, image alternatives and video controls usable.
- Do compare each breakpoint and template with its own incumbent reference before claiming parity.
- Do keep preview catalogue and checkout limitations visible and accurate.

### Don't:
- Don't invent a new visual world or treat unverified implementation details as approved brand changes.
- Don't crop baked-in promotional text or mismatch a banner's destination with its message.
- Don't describe the mobile adaptation or complete storefront as an exact verified Shopify reproduction.
- Don't claim live Keeri stock, completed payment integration or production readiness from visual review.
