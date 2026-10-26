# Storefront fidelity and Keeri discovery follow-up

Status: verified locally; not deployed. The source is the original Shopify storefront and the Suggested design in Figma file `nTEPXzov9IuWraGF0Ace6V` (Story After `251:515`, cities After `251:617`). Original copy and authorized contact overrides are preserved.

## Implemented

- Restore the Elegance ticker's original Newsreader 80px desktop / 40px mobile gradient typography, spacing and motion.
- Match measured navigation font sizes/weights and full-viewport mega-menu width; restore 40px desktop homepage campaign gutters and 16px mobile gutters.
- Use source Manrope 16px form controls and 24px vertical facet headings in collection filters. The highest-price caption remains unchanged because its source inherited context was not established.
- Repair Story promise-label overflow and the intrinsically stretched film panel. Restore serif title and film heading while retaining the complete original copy.
- Restore footer proportions, colours, fonts and original logo/icons. Footer columns remain expanded on mobile as the source explicitly disables accordion behavior there. The original Terms and Policies disclosure is keyboard-operable.
- Remove default play badges from videos and scrolling sections; retain keyboard-visible controls, touch pause and reduced-motion behavior. Carousel controls appear on hover/focus, and a resume control remains visible after a visitor intentionally pauses scrolling.
- Add labelled city cards, rounded shell and flanking 44px navigation targets. Figma provides a flattened reference, not separate destination photos; the existing editable city artwork remains. This is not exact photo parity.
- Derive missing Keeri V2 categories from exact known product types only. Explicit channel categories and existing Shopify categories take precedence. No price, stock, payment or publication eligibility is changed.

## Catalogue finding and remaining apply

The existing union contains 539 products / 1,050 variants. All 353 Keeri-only products have null categories, explaining their absence from category browsing despite being available through All Furniture and search. The corrected planner fills 332 missing categories: 323 Keeri-only products and nine merged products. Thirty Keeri-only products with unknown types remain in All Furniture/search. The captured comparison changes no handles and preserves honest price/image placeholders. Curated Shopify subcollections remain curated; they are not automatically broadened.

This is a planner result, not an applied database change. A genuinely fresh authenticated Keeri capture, identity comparison, verified backup and import are still required. Replaying the old snapshot intentionally does nothing; do not fabricate its timestamp. Local and production imports have not been performed in this increment.

## Verification

- TDD: category regression failed with null versus expected chairs, then passed with the adapter correction. Footer disclosure and city labels failed before implementation, then passed. Declarative CSS was measured against independently observed source values before and after edits.
- `npm test`: final integrated run passes 1,059 tests (361 API, 645 web, 53 deployment/backup), including two pointer-resume characterization tests.
- `npm run typecheck` and `npm run build`: pass under Node 22.21.1.
- Five guarded database deployment/recovery tests pass against dedicated test databases. The first invocation lacked the dedicated import URL; the corrected invocation derives that URL from the verified test server and uses only `shopmaple_preview_import_test` and `shopmaple_test`.
- Gitleaks and the locally available 74-rule Semgrep scan pass. These do not substitute for the dependency audit or final CI.
- Independent review caught an inaccessible pointer-resume path after hiding carousel controls. The CSS was corrected; browser checks confirm default opacity 0, paused Play opacity 1 with pointer events enabled, and successful pointer resume. The reviewer confirmed the finding resolved with no further concrete issue.
- Browser checks at 1280px desktop and actual 390px mobile cover widths, typography, promise overflow, film proportions, hidden play icons, loaded local footer assets and 44px city controls. Homepage and Story have no horizontal page overflow at 390px. The production build runs locally at port 3000.

Evidence is retained outside Git in `.local/fidelity-followup/`. External images remain affected by the Mac's network certificate problem, so complete image-loaded visual acceptance is still pending.

## Release gates still open

The current network presents an untrusted Fortinet certificate for npm and Maple hosts; SSH to the deployment host also times out. The user plans to switch connections. TLS verification remains enabled. Dependency audit, fresh catalogue capture/apply, remote CI and public deployment verification have not passed for this increment. Do not merge/deploy it as verified until those gates pass.

The approved cleanup removed only three inactive older worktrees' `.next` caches, recovering 764,903,424 bytes. The audit is in the workspace report `shop-approved-local-build-cache-cleanup-2026-10-26.json`. No source, dependencies or databases were removed.

The wider goal remains unfinished: payment/order/shipping readiness, publisher activation, remaining source-page fidelity, exact city photography, notification integrations and operational backup capacity must remain tracked separately.
