# Remaining storefront catalogue reads

Homepage rails, category/Nimbus selections and product recommendations now read compact cards. Previously the homepage loaded a full product per card, category pages paginated the full catalogue and recommendations loaded full matching products before slicing. The main product detail still receives its full gallery, description and variants. Original copy, layout, pricing, selected order and enquiry-only source fallback remain unchanged.

Home makes one request per enabled rail in normal operation. A failed batch recovers individual compact cards so healthy siblings remain; this bounded failure path can use an additional six-second reader deadline and up to twelve singleton requests per rail. Category rails share one exact-handle selection, with the existing reader splitting selections larger than fifty. The new related endpoint validates a single category, filters published records in SQL, orders by database title/ID and takes five before variant retrieval. Web retains self-exclusion and the first four recommendations.

Category aggregation uses a page-local deferred loader: the parent/hero tree returns without waiting for product cards, the first server rail starts the request and all rails share its promise. An abandoned parent tree starts no catalogue request. Failures propagate to consumers without inventing stock or source availability.

The strict related envelope binds category, publication and at most five unique card handles. Invalid stored output is a generic private/no-store server error. Readers retain existing coalescing, isolated cached values, thirty-second freshness, complete six-second header/body deadlines and retry after rejected responses. No new dependency, database migration, authentication grant or commerce change.

## Measurement

Read-only local85-product/115-variant data, raw API response bytes (API-to-web-server transfer, **not** browser CWV):

| Read | Previous | Compact |
|---|---:|---:|
| Default homepage rails |22,770 bytes /12 requests|3,797 bytes /2 requests|
| Category selections |94,900 bytes /2 requests|7,458–10,021 bytes /1 request|
| Nimbus unique selection |94,900 bytes /2 requests|3,792 bytes /1 request|
| Chair recommendations |6,967 bytes|1,671 bytes|
| Table recommendations |4,629 bytes|1,665 bytes|

Actual source-router/Prisma measurements used PostgreSQL read-only mode; all six related categories retained first-five handle order, with one Product SELECT and one Variant SELECT for nonempty categories. Development counts stayed85/115 with no writes observed. These measurements do not establish field performance, LCP, INP or catalogue completeness.

## Test-first evidence

- API: from apps/api, `npx tsx --env-file=../../.env --test --test-concurrency=1 test/related-catalogue.test.ts`: five intended missing-route assertion failures, then5/5 pass. Affected catalogue suite21/21. Covers publication/category/order/ties, SQL bound, hidden variants, null/zero/mixed prices, malformed queries and private output failures.
- Reader: from apps/web, `npx tsx --tsconfig test/tsconfig.json --test test/compact-catalogue-reads.test.tsx`: eight genuine assertion failures against a compilable empty reader scaffold, then15/15. Covers category identity, bounded shape, no full fields, coalescing/isolation, invalid input and body deadline/recovery.
- Rendering: from root, `npx tsx --tsconfig apps/web/test/tsconfig.json --test apps/web/test/storefront-compact-reads.test.tsx`: three existing characterizations passed and five new transport assertions failed before changes; then8/8 passed. Existing affected tests retained their output assertions with transport-only fixture changes.

The deferred-loader follow-up first failed a meaningful parent-blocking assertion, then passed the affected29 tests and typecheck. Final `npm test` passed331 API,590 web and53 deployment tests; the separate guarded recovery/bootstrap suite passed5 (**979 total**, zero failures/skips). Node22 typecheck, production API/web build and bundle guard passed. The final homepage route chunks total254,284 raw /77,175 gzip bytes, unchanged by this increment. An intermediate build command did not keep its Node22 PATH assignment for the second shell command; the authoritative final build was rerun explicitly with Node22.

Independent manual review covered all21 files, including tests skipped by static rules, and the deferred-loader delta; no actionable findings. Built browser checks covered homepage, Chairs, Tables, Nimbus and Aero PDP at bounded mobile/desktop sizes. Final homepage DOM copy and product links matched the original baseline; Chairs copy matched the preceding build,390/1280px checks showed no horizontal overflow and browser error logs were empty. No full responsive or CWV acceptance is claimed. The final dependency/history/static scans, exact-head CI and merge status are recorded in the release report; source review and local tests alone do not establish deployment readiness.

## Configuration and release boundary

The user confirmed publisher `aditya@maplefurnishers.com` and separately chose `contact@maplefurnishers.com` for Shop team enquiry alerts. The private local environment records the recipient with delivery disabled. No alert was sent; verified sender credentials, production configuration, private staff setup and mailbox acceptance remain pending.

Deploy compatible API/web together because the new web reader requires the new related endpoint. Production capacity and paired-backup recovery remain unresolved; this increment performs no production cleanup or deployment. Checkout stays disabled. Further layout work includes testimonial/newsletter composition, rail hierarchy and source ticker; complete review/newsletter services, catalogue reconciliation and full responsive/accessibility/performance acceptance remain open. The whole project goal remains active.
