# Cart recovery and carousel keyboard access

Cart mutations previously had an unbounded wait and unlocked stale state after transport failure. They now persist a cart-bound operation before dispatch, wait at most ten seconds for headers and body, and expose an explicit recovery action after an uncertain outcome. The same operation is replayed; a GET alone cannot clear it. Reload, unmount, late responses and storage failure retain the write guard. Keyboard activation returns focus to a stable cart region after the recovery button disappears, without stealing unrelated focus.

The API requires an operation UUID, cart identity and expected revision. Durable success/rejection receipts, item changes and revision increments share a serializable transaction. Receipt lookup precedes revision checks, so replay after a later edit returns current quantities without applying the old change. Reads use a consistent snapshot. Unknown, expired or ambiguous cookies rotate on bootstrap; PUT accepts only an existing live cart. Server-owned prices, availability checks, origin checks and disabled checkout remain.

Autoplay rows now place the rotation control first in native tab order. Scoped flex ordering keeps the controls visually below the rail; manual rows retain their existing order. No animation dependency or original marketing-copy change.

## TDD and review

- Cart UI characterization passed before changes; RED showed an unacknowledged write still unresolved after ten seconds. Protocol RED covered missing persistent operation identity and missing recovery controls. Further RED cases caught stale success revisions, untrusted proxy rejection markers, replacement/missing pending storage and lost focus. Final 23 recovery tests pass; 87 affected tests pass. Test transport doubles exercise the real provider and cart UI. Node's experimental MockTimers warning is expected in fake-clock tests.
- API RED showed missing guarded context, then rejected new protocol requests before implementation. Review caught an unsafe proposed lazy bootstrap that trusted unknown cookies; explicit unknown-cookie rotation and duplicate-cookie RED cases failed before correction. Final 12 recovery tests pass, including two additional characterization cases proving PUT cannot create an unknown/deleted cart. Existing quantity/price/origin tests retain their assertions with valid protocol inputs.
- Carousel characterization 2 pass; first-tab-stop RED failed, then all 3 new tests and 18 affected motion tests pass. Tests preserve focus pause and explicit resume behavior.
- Independent final API/UI source review found no actionable delta findings. Reviewer reran 20 UI cases before three final characterization additions; all 23 are included in the integrated suite. Root reviewed the independently authored carousel change. Existing valid-token cookie-name hardening remains separate work before commerce activation.

## Integrated verification

Node22 `npm test`: 766 pass (263 API, 450 web, 53 deployment), zero failed/skipped. Five guarded recovery database tests pass separately: **771 total**. Full typecheck/build pass. Increment dependency audit reports zero vulnerabilities; history-secret scan no leaks; strict Semgrep 74 rules/156 targets/zero findings, approximately 100% parsed, with 116 standard ignored files and one file above 1MB. Final staged/committed scanners and exact-head CI remain merge gates.

Migration `20261027060000_cart_mutation_receipts` deploys successfully on a fresh disposable database, which was then removed. Dedicated test and recovery databases migrated. Development database was backed up privately before migration; 85 products,115 variants,1 enquiry and1 cart were preserved, with zero initial receipt rows. The first combined migration command migrated development but then failed because the recovery URL variable was absent; a guarded URL derived from the dedicated local test target migrated the intended recovery database successfully. No production migration occurred.

## Ordinary-browser evidence and limits

- Built API4100 and web3000 run locally in preview mode with checkout disabled.
- Temporarily stopping only the owned local API made `/cart` show a load error and **Try again**. After restarting it, keyboard Space restored the original Aero/Desert Taupe quantity1 and moved focus to the `Your saved cart` region. Original cart contents were not changed.
- Native Tab from the Instagram profile link reaches **Play Instagram posts** before post links at1280px and390px. Controls remain12px below the rail. Both homepage and loaded cart stay within390px; desktop homepage is1280px without overflow. Temporary viewport override reset.
- Mobile screenshot: `reports/shop-carousel-keyboard-mobile-2026-10-26.jpg` in the primary workspace reports folder.
- The local snapshot has no stocked/dropship variant eligible for UI quantity changes. No availability was fabricated to force a browser sale path. Real database/API tests and component transport tests cover successful mutations and uncertain-write recovery; a live browser lost-PUT-response scenario was not exercised. No real order, payment, stock change or customer message occurred.
- VoiceOver, full WCAG/contrast, physical-wheel input and Core Web Vitals remain unverified. Carousel focus order follows [W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/).

## Release requirements

API and frontend must deploy together; old unguarded writes fail closed. Keep receipts for live carts. PUT never recreates a missing cart, allowing eventual expired-cart cleanup without resurrecting old operations. GET now creates empty browsing-session rows under the existing rate limit; scheduled retention remains operational follow-up. The original cookie name needs separate host-prefix hardening. Preserve a paired backup and compatible API/web rollback; do not mix old writers with the new protocol.

Not deployed. At2026-10-26T01:09:03Z production root was100% full with9052KiB free. `/api/health` remained OK/preview/checkoutfalse at release26bd9aa; an initial incorrect `/health` request returned404. No deletion, restart or account creation occurred on production. First publisher remains aditya@maplefurnishers.com with private password setup pending. Capacity/cleanup approval, admin acceptance, customer integrations and commerce/operational readiness remain open. The entire project goal stays active.
