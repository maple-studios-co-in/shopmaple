# Shop content and motion verification — 26 October 2026

## Changes under test

- Strict published-content contract and safe server rendering.
- Protected staff sessions; editor drafts and publisher publication; version conflicts and immutable history.
- Form-based Shop Admin, separate from customer navigation; stalled-request recovery.
- Original 24-post Instagram row, responsive columns, native controls and accessible autoplay; moving city row.
- Private first-publisher provisioning for the approved owner address.

## RED/GREEN evidence

The implementation plan and focused suites track assertion-based failures before implementation. Contract tests rejected unsafe links/media/duplicate identities/reserved routes. Rendering tests failed until saved order, visibility and custom copy were applied. API tests exercised real dedicated PostgreSQL storage for authentication, CSRF, authorization, stale writes and private drafts. Dashboard tests failed on missing forms, invalid session handling and customer navigation on admin pages. Motion tests failed before pause/reduced-motion/focus/cleanup behavior and the missing-matchMedia fallback existed. Timeout tests covered response bodies that stall after headers.

Commands: `npm test`, `npm run typecheck`, `API_URL=http://127.0.0.1:4103 npm run build`, `npm run test:deploy:db`, `npm run security:check`, and final staged secret scan. The import DB suite uses only `shopmaple_preview_import_test`; API tests use `shopmaple_test`.

## Local browser workflow

Synthetic staff identity existed only in the separate development database. Saved source draft v1; edited social heading and saved v2; public endpoint remained 404. Published v3 and saw edited heading in the browser. Restored v1 into draft v4; public endpoint retained v3. Published v5 and saw the original heading again. No production content, enquiries, orders or payments were submitted.

The Instagram row contains 24 unique posts, six desktop columns and two at390px. Autoplay visibly advanced; Pause changed to Play; no horizontal page overflow at390px. Final screenshots and release checks are recorded separately.

## Limits

Scanners and tests are bounded evidence, not a guarantee of no vulnerabilities. Publisher activation and authenticated HTTPS workflow require the owner's private password setup. Media uploads, campaign scheduling, CRM inbox/notifications, remaining template controls and additional effects are future increments. Checkout remains disabled pending merchant, packing/shipping, price-basis and end-to-end order/recovery gates. Native carousel movement is implemented; no claim of full pixel parity across every page or original carousel timing is made.
