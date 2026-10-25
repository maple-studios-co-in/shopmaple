# Content and page parity increment — 26 October 2026

Status: local implementation and verification; production storefront remains 26bd9aa. PR #24 is a draft. Checkout remains disabled. This is not a pixel-perfect or complete CMS claim.

## Delivered code

- Legacy Chairs collection editorial template with local navigation, separate query-driven product grid, real source product fallback enquiries, horizontal room rails and native FAQ.
- Chairs hero height and bottom-aligned desktop typography corrected after browser comparison. Source headline rendered at 48px desktop/36px mobile. Mobile category override corrected from a horizontal strip to two columns.
- Article pages restore original featured images and source publication timestamps; display date explicitly uses Asia/Kolkata, retaining the original ISO datetime. Source export did not contain an explicit shop timezone setting.
- Nimbus desktop/mobile slideshow pairs corrected for all three rooms.
- Shop Admin Existing pages → Our Story: bounded plain-text copy, seven journey chapters, four section order/visibility controls. Original media/copy defaults retained. Public readers only receive published revisions; editing, publishing and restoring retain existing roles, CSRF and version conflict handling.

## Test-first evidence

Article characterization 2 passed, then 3 assertions failed for missing dates/featured images; focused 5 passed after implementation. Nimbus existing navigation characterization passed while the expected desktop livingroom.png assertion failed against mobile WhatsApp artwork; focused 2 passed after correction.

Our Story RED: edited title still rendered original copy; new document validation failed; Existing pages tab missing; real database save returned400 rather than200. GREEN: affected frontend47 and focused API10 tests passed, including draft isolation, publication, stale version rejection, editor role refusal, restore-to-draft, bounded strict input, original fallback and escaping. Independent manual security/code review found no actionable issues. This was not a formal Codex Security scan.

Chairs CSS is declarative and was checked in the actual browser/build, without artificial source-string unit tests. Before: desktop hero660px/heading76px and stacked description; mobile hero560px/heading42px. Corrected desktop keeps the hero bottom at576px in a1280×720 viewport and places the title and description side by side. Final mobile/combined checks are recorded below as they finish.

## Release and recovery

The content change needs no schema migration. Before any publication, retain a verified database/media recovery pair. Older binaries with strict content validators reject storyPage documents; do not simply point current at an older binary after new content is saved/published. Use a compatible release or rehearse matching content recovery, preserving newer commerce/enquiry records. A whole database rewind is not a routine rollback.

Production capacity is unresolved: approximately1.25GiB free cannot safely stage another normal full release. Recovery archives for a bounded set of old, unmarked releases are being prepared off-host; no deletion is authorized or performed. Current, required previous rollback and four explicit rollback marker targets remain protected.

## Remaining scope

- Publisher private password/account activation and production staff acceptance; enquiry capability decision separate.
- Homepage copy beyond six current fields; remaining informational templates, Nimbus and existing policy/contact copy controls.
- Remaining source/suggested layout comparisons and measured LCP/CLS/INP/accessibility across routes.
- Real review/newsletter/account/returns services and notification delivery.
- Capacity resolution, exact-head CI, deployment, ordinary public browser verification.
- Next scheduled paired backup observation; automated off-host destination, retention and alerts.
- Commerce/merchant/shipping/Keeri recovery gates before checkout activation.

## Final local checks

Application tests:200 API and206 frontend passed. Deployment checks:6 bootstrap/routing,25 media,22 paired/import and5 database tests passed after the reserve fixture correction below (464 total). Types and production build passed. Staged/history secret scans, dependency audit and74 static rules over130 files found no findings; standard skipped paths/1MB limit remain. Exact-head CI and production deployment are separate gates.

One final combined run exposed an existing backup test race: its reserve used sampled available bytes+1, which unrelated disk changes could satisfy before the first guard check. The assertion then found a run directory instead of an empty directory. The fixture now sets reserve above total filesystem capacity; production backup code is unchanged. Focused18 backup tests and the full deployment group pass. The earlier missing PREVIEW_IMPORT_TEST_DATABASE_URL invocation was corrected using the dedicated local import-test database; all5 database tests pass.

Browser evidence from built localhost:1280×720 desktop hero title48px, bottom-aligned heading and description;390×844 mobile title36px, hero bottom560px, two169px category columns, no horizontal page overflow. Native FAQ Enter opens/closes; Living Room Next moves its product rail; Clear filters navigates to chairs?page=1 and retains the grid. Story defaults show all4 sections and7 chapters on mobile without overflow. Article hero loads through Next image optimizer and date displays; Nimbus room buttons change slides and mobile Dining artwork resolves to its original mobile image. Viewport override reset afterward. Browser API does not expose reduced-motion emulation; that behavior is covered by component interaction tests, not claimed as an OS preference browser check.

Category videos now listen for reduced-motion changes and pause decorative playback; disabling the preference does not restart playback. RED observed paused=false versus expectedtrue; focused4 and related10 passed before the integrated run.
