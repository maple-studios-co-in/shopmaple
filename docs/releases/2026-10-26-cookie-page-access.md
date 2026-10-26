# Cart credential protection and public page acceptance

Production now reads and emits only `__Host-maple_cart`; local HTTP retains `maple_cart`. One strict selected-name parser serves cart bootstrap/mutation and opt-in checkout freeze/payment/status. Duplicate selected credentials fail closed; other-environment names cannot shadow the selected token. Production cookies use Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. Server checkout remains disabled.

**Rollout consequence:** existing production legacy guest carts reset to a new empty session. Legacy tokens are deliberately not migrated because a sibling domain could have supplied a known valid token. Old pending mutations fail closed. No schema migration or dependency change is required.

Mobile Help category controls now identify the actual named dialog and expose expanded state; desktop controls retain their visible answer-region relationship. Missing matchMedia falls back to viewport width/resize events. Nimbus manual room changes announce existing room text and position without moving focus. Home keeps one hidden existing brand heading regardless of section order/visibility. No visible marketing copy changed.

Homepage categories/offers and standard/compact collection cards now describe their actual responsive image slots, preserving original artwork, crop and layout. Compact mobile retains the existing 8px gap and two-column override. No animation library was added.

## TDD and review

- API:21 existing characterization tests passed;5 genuine RED assertions exposed old cookie issuance, accepted legacy production mutation, mixed-name shadowing and secure checkout failures.29 focused tests and86 affected integration tests passed. Evidence: `.local/cookie-page-access/cookie-*.log`.
- Public page access:4 new RED assertions covered missing dialog semantics/status/h1;28 focused/affected tests passed. A broader image-agent run caught the missing matchMedia fixture capability (32/33); a new deliberate absence regression failed before adding the width/resize fallback, then22 affected tests passed. The full typecheck caught direct assignment to readonly innerWidth in the new fixture; Object.defineProperty corrected the fixture and5 focused tests plus web types passed. No existing fixture was weakened.
- Images:12 characterization tests passed;2 sizing assertions failed before implementation;26 focused/affected tests passed. Review caught compact mobile's8px gap; a test-first correction changed44px to40px total subtraction. Subsequent full suite includes the concurrent Help fix.
- Independent read-only API and UI source review found no actionable delta findings after the compact-gap correction. Reviewed server config, cookie attributes/parsing, downstream ownership, responsive relationships, status/focus and CSS sizing math. This is not a penetration test or browser security-prefix enforcement test.

## Integrated verification

Node22 `npm test`:781 pass (271 API,457 web,53 deployment), zero failed/skipped. Five guarded local recovery tests pass separately: **786 total**. Full typecheck and Node22 production build pass. An intermediate build inherited the shell's Node20 after a scoped PATH assignment; it was rerun successfully with explicit Node22 before local restart. Earlier failed types/build logs are retained, not relabelled as successful.

Dependency audit:0 vulnerabilities. History secret scan:69 commits/no leaks at the precommit increment. Strict Semgrep:74 rules,157 targets,0 findings, approximately100% parsed;118 standard ignored paths and one file over1MB. Final staged and committed scans plus exact-head CI remain merge gates. Tests and scanner results do not establish live merchant readiness.

## Browser evidence

Built API4100/web3000 serve this source locally with preview mode and checkout disabled.

- At390px, keyboard Space on Payment & Invoice opens its named dialog; aria-controls matches the open dialog ID, expanded istrue, and focus moves to Back to categories. Escape closes it, expanded becomesfalse and focus returns to the original category. At1280px, controls target the answer region and have no dialog popup attribute. Both page widths match the viewport.
- Nimbus Next room changes status from Living room1/3 to Bedroom2/3 while focus remains Next room. This verifies DOM status behavior, not actual VoiceOver speech.
- Homepage has one Maple Furnishers h1. At1280px category/offer slots measure183.33/288px; at390px169/250.59px. The verification viewport reports DPR1: observed raster category candidates256px and offer candidates384px. Some larger cached candidates persist after shrinking. Earlier audit used DPR2; do not compare candidate numbers as a controlled transfer measurement.
- Collection standard/compact slots are308/181.59px at1280; mobile standard/compact173/175px at390. Compact gap is8px. No horizontal overflow in these tested states. Viewport override reset.
- Saved screenshot in primary reports: `shop-help-mobile-2026-10-26.jpg`.
- Seven sampled Help text/background pairs computed from DOM styles range4.549:1–15.002:1. This is a limited text sample, excluding all-route states, overlays, disabled controls, and image backgrounds; not full WCAG certification.
- Initial home JS232781raw/70048gzip bytes, +15/+5 versus previous increment; no configured unrelated-template markers. Not a Core Web Vitals measurement.

## Operations and remaining work

Not deployed. Read-only production check at2026-10-26T01:24:12Z: root100% full,8948KiB available, current26bd9aa and healthOK/preview/checkoutfalse. No production deletion/restart/migration/account creation or customer/payment action. First publisher is confirmed as aditya@maplefurnishers.com; private password setup and activation remain pending. Earlier cleanup approval is still unanswered.

Remaining: capacity recovery, staff acceptance, expired-cart retention, full route/state/accessibility/CWV checks, smaller product-card serialized data, customer-service/provider integrations, enquiry notifications/retention, catalogue/pricing/package data and shipping/payment/Keeri activation gates, scheduled/off-host backup and alerts, SEO cutover. The overall project goal remains active.
