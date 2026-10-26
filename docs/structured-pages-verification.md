# Structured custom pages — verification

Shop Admin can explicitly convert a custom page into ordered paragraphs, headings, quotes, lists, internal links and managed images. The original body is retained; returning to it requires confirmation. Existing source pages and legacy custom-page markup remain unchanged. Shared article controls preserve their prior behavior.

## TDD evidence

Commands use Node.js 22. Logs are retained locally under `.local/structured-pages`.

- API: from `apps/api`, `npx tsx --env-file=../../.env --test --test-concurrency=1 test/structured-pages-contract.test.ts test/structured-pages-db.test.ts`. Legacy characterization passed. RED rejected valid blocks and incorrectly allowed missing links/images or left published page images private. Focused API/article regressions passed 27/27; full API passed 251/251.
- Editor: `npx tsx --tsconfig apps/web/test/tsconfig.json --test apps/web/test/admin-authored-articles.test.tsx apps/web/test/admin-structured-pages.test.tsx`. Characterization passed before extraction. RED lacked conversion controls, leaked an image composer after removal and differed from legacy paragraph whitespace. GREEN 16/16. Conversion uses the exact legacy splitter and never trims retained paragraph strings.
- Renderer: `npx tsx --tsconfig apps/web/test/tsconfig.json --test apps/web/test/structured-pages.test.tsx`. Two legacy characterizations passed; four assertions failed because blocks were ignored; GREEN 7/7. Affected renderer suites passed 39/39.

## Integrated verification

- `npm test`: 706 passed (251 API, 402 web, 53 deployment tests). Dedicated guarded recovery database tests: 5 passed. Total 711, no failures or skips.
- `npm run typecheck`, `npm run build`, `git diff --check`: passed.
- Dependency audit: zero vulnerabilities. History secret scan: no leaks. Static scan: 74 rules, 156 tracked targets, zero findings; 111 standard ignored files and one file over 1 MiB excluded. Final staged/history scans remain merge gates.
- Independent read-only security/regression review found no actionable findings. This is not a penetration test or proof of commerce readiness.
- Real component browser fixture: explicit conversion, heading editing, retained edits across page switching, confirmation/cancellation and original-body recovery verified. At 390 px the initial 525 px overflow was reproduced, then corrected with scoped CSS; document width became 390 px. At 1280 px, editor/preview columns fit without overflow. Fixture state was synthetic and never saved or published.
- Rebuilt local API health: preview mode, checkout disabled. Unauthenticated admin session: 401 with `private, no-store`. Existing Sofas route checked in the ordinary browser.
- Homepage route JavaScript: 227,411 raw / 68,303 gzip bytes (+195/+40 versus preceding increment); no admin/source data leakage markers. This is a bundle check, not Core Web Vitals measurement.

## Release boundaries

No migration, production account, content publication, catalogue import or checkout activation. First publisher remains the user-confirmed `aditya@maplefurnishers.com`; private password setup is pending. Production capacity must be resolved before release. Deploy compatible API/web together: older strict readers reject page documents containing `blocks`. Keep a verified paired database/media backup and compatible rollback release.

PR/CI/merge evidence is recorded in the current workspace backlog after exact-head checks finish. The complete storefront goal remains active.
