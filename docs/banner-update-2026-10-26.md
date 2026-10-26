# Updated Diwali banner source record — 2026-10-26

Source: [Diwali Updated Banners](https://www.figma.com/design/nTEPXzov9IuWraGF0Ace6V?node-id=980-2), page `980:2`, section `973:438`. All 32 actual desktop/mobile frame nodes were read with high-fidelity `get_design_context`, including their screenshot targets. The page itself returns no selected design context; its child frames are the implementation source.

## Scope and content

The 16 banner pairs use the updated visible headline, offer sentence and CTA. The old eyebrow, supporting and separate eligibility text are absent from the supplied designs; their default fields are empty/null. The sale banners move the discount into the headline and show “On selected ….” in the smaller offer line. Content outside these banner designs and internal `/collections/…` destinations are preserved.

Desktop uses Newsreader 46px/49px normal headings, Manrope 18px/25px normal offer text, and Manrope 13px/20px semibold CTA text. Mobile uses 32px/35px, 15px/21px and 12px/18px respectively. Both CTA variants have a transparent background, `rgba(255,243,220,0.85)` 1px border, 2px radius and 18px horizontal / 10px vertical padding. Heading/offer text is `#fff3d3`; CTA text is `#fff3dc`.

Desktop content is x=64, width=500, gap=14; y=104 for announcement, y=79 for landing sofa, y=80 otherwise. Mobile content is x=28, y=32, width=444, gap=10. Each frame stores this under `copy`. Desktop canvas is 1900×350; mobile canvas is 500×500. Gradients and individual image placements follow each frame. Sofa hero desktop artwork intentionally begins at y=1, as in the source; the banner clips the final pixel.

## Frame and asset inventory

All 96 visible image layers were freshly downloaded with the Figma tool’s permitted `curl -L` workflow. Their SHA-256 hashes match the existing local files exactly: **0 replacements**, **2,825,892 total bytes**. Each image was decoded successfully and checked against its node, local path and design slot. Screenshots are comparison evidence only and are never used as website artwork.

| Campaign | Desktop frame | Mobile frame | Desktop asset bytes | Mobile asset bytes |
| --- | --- | --- | ---: | ---: |
| landing-announcement | `973:440` | `973:452` | 126,208 | 62,238 |
| landing-dining-table | `973:464` | `973:476` | 121,212 | 62,424 |
| landing-sofa-accent-chair | `973:488` | `973:500` | 125,075 | 61,415 |
| landing-dining | `973:512` | `973:524` | 120,400 | 61,537 |
| landing-storage | `973:536` | `973:548` | 126,003 | 62,791 |
| landing-consoles | `973:560` | `973:572` | 122,069 | 60,869 |
| sofas-hero | `973:584` | `973:594` | 121,450 | 60,099 |
| sofas-sale | `973:603` | `973:613` | 123,824 | 60,245 |
| tables-hero | `973:622` | `973:632` | 121,663 | 60,442 |
| tables-sale | `973:641` | `973:655` | 124,017 | 60,010 |
| chairs-hero | `973:666` | `973:683` | 125,981 | 62,533 |
| chairs-sale | `973:694` | `973:708` | 102,364 | 62,368 |
| beds-hero | `973:719` | `973:729` | 101,103 | 38,095 |
| beds-sale | `973:738` | `973:748` | 92,488 | 37,636 |
| outdoors-hero | `973:757` | `973:771` | 125,231 | 60,784 |
| tv-units-hero | `973:782` | `973:792` | 115,035 | 58,283 |

Each node below maps to `apps/web/public/media/diwali/<node-id-with-hyphen>.png`.

| Image node | Bytes | Image node | Bytes |
| --- | ---: | --- | ---: |
| `973:441` | 32,064 | `973:442` | 32,071 |
| `973:443` | 31,969 | `973:444` | 30,104 |
| `973:453` | 31,196 | `973:454` | 31,042 |
| `973:465` | 31,565 | `973:466` | 30,602 |
| `973:467` | 29,292 | `973:468` | 29,753 |
| `973:477` | 31,733 | `973:478` | 30,691 |
| `973:489` | 31,991 | `973:490` | 32,038 |
| `973:491` | 30,492 | `973:492` | 30,554 |
| `973:501` | 29,409 | `973:502` | 32,006 |
| `973:513` | 30,850 | `973:514` | 28,214 |
| `973:515` | 29,871 | `973:516` | 31,465 |
| `973:525` | 31,158 | `973:526` | 30,379 |
| `973:537` | 31,624 | `973:538` | 31,244 |
| `973:539` | 31,946 | `973:540` | 31,189 |
| `973:549` | 31,945 | `973:550` | 30,846 |
| `973:561` | 29,911 | `973:562` | 31,415 |
| `973:563` | 28,522 | `973:564` | 32,221 |
| `973:573` | 30,781 | `973:574` | 30,088 |
| `973:585` | 31,110 | `973:586` | 29,588 |
| `973:587` | 29,969 | `973:588` | 30,783 |
| `973:595` | 29,975 | `973:596` | 30,124 |
| `973:604` | 31,008 | `973:605` | 30,504 |
| `973:606` | 31,919 | `973:607` | 30,393 |
| `973:614` | 28,992 | `973:615` | 31,253 |
| `973:623` | 30,835 | `973:624` | 31,587 |
| `973:625` | 31,114 | `973:626` | 28,127 |
| `973:633` | 29,394 | `973:634` | 31,048 |
| `973:642` | 30,908 | `973:643` | 32,037 |
| `973:644` | 30,525 | `973:645` | 30,547 |
| `973:656` | 30,060 | `973:657` | 29,950 |
| `973:667` | 31,409 | `973:668` | 31,475 |
| `973:669` | 30,968 | `973:670` | 32,129 |
| `973:684` | 30,916 | `973:685` | 31,617 |
| `973:695` | 30,650 | `973:696` | 31,046 |
| `973:697` | 31,298 | `973:698` | 9,370 |
| `973:709` | 31,452 | `973:710` | 30,916 |
| `973:720` | 27,582 | `973:721` | 27,336 |
| `973:722` | 25,902 | `973:723` | 20,283 |
| `973:730` | 20,108 | `973:731` | 17,987 |
| `973:739` | 29,503 | `973:740` | 22,473 |
| `973:741` | 18,691 | `973:742` | 21,821 |
| `973:749` | 19,945 | `973:750` | 17,691 |
| `973:758` | 31,535 | `973:759` | 30,569 |
| `973:760` | 31,414 | `973:761` | 31,713 |
| `973:772` | 29,982 | `973:773` | 30,802 |
| `973:783` | 30,392 | `973:784` | 32,703 |
| `973:785` | 27,928 | `973:786` | 24,012 |
| `973:793` | 31,217 | `973:794` | 27,066 |

## Evidence and verification boundary

Local evidence in `.local/banner-update/` includes the 32 tool responses, 32 screenshot targets, desktop/mobile target contact sheets, downloaded assets, and `asset-audit.json` containing old/new SHA-256 hashes, source URLs, byte sizes and slot metadata. Temporary Figma URLs remain only in local evidence; runtime data uses local media paths.

Data validation passed: JSON parsing; all 16 desktop/mobile copy pairs agree; all 32 content boxes fit their frames; all 96 image files are nonempty, decode successfully and match freshly downloaded Figma hashes; all destinations remain internal collections. The two contact sheets were visually inspected against the extracted copy and artwork.

These are data/asset checks. Renderer behavior tests, rendered geometry, browser visual comparison, full-suite and security checks are recorded by the integrating change. This record does not claim deployment or checkout readiness.

## Integrated rendering verification

The renderer omits empty copy rows and names each banner region from its heading when the label is empty. Explicit published CMS copy/artwork remains authoritative. Full original copy uses compact spacing to retain CTA visibility: a real-browser regression reproduced 8px clipping before the CSS fix, then verified a 293px content bottom inside a 350px desktop frame and 194.41px inside a 390px mobile frame. Simplified defaults retain the Figma coordinates. The existing mobile CTA minimum of44px intentionally exceeds Figma's40px for touch accessibility.

Seven storefront routes at1280px and390px cover all16 campaign placements. All visible copy fits;90 rendered artwork tiles match their source node, local image and scaled geometry within0.1px. The three compact homepage cards use the square mobile artwork at desktop widths, preserving their existing placement. Keyboard focus and no horizontal page overflow were checked. Desktop/mobile screenshots are retained with the workspace release report.

Final integrated validation:1,051 project tests plus5 guarded import/bootstrap/recovery tests pass; Node22 typecheck, API/web build and homepage bundle guard pass (257,343 raw /77,837 gzip bytes). Dependency audit0vulnerabilities, secret scan clean, Semgrep74rules/182targets0findings. Independent final diff review has no remaining actionableP1/P2. The earlier whole-content size fixture became smaller than its limit after banner copy was simplified; it now independently exceeds128KiB using three valid policies and asserts the exact limit rejection. The production limit was not changed. An initial import recovery invocation stopped before execution because its dedicated environment variable was absent; rerunning with a guarded dedicated test URL passed. No failed run is counted as a pass.

These checks establish local readiness only. Final commit CI and merge are tracked in the release report. Production deployment and live checkout remain separate.
