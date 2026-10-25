# Contact, Bulk Enquiry and Returns content controls

Status: locally verified; exact-head CI and merge pending. No production deployment. Checkout remains disabled. First publisher is aditya@maplefurnishers.com; private password setup remains pending.

Shop Admin → Existing pages now includes Contact, Bulk Enquiry and Return & Exchange. Staff can edit page titles, introduction and FAQ copy, process steps, business copy and city labels. Contact and Bulk sections can be reordered or hidden. Switching templates preserves unsaved changes, and conflicts preserve the local draft. Existing editor/publisher permissions, CSRF, optimistic version checks and explicit publication remain in force.

The optional servicePages contract preserves original defaults for older documents. It uses strict bounded plaintext, complete unique identity sets and the existing 128 KiB total document limit. Published content supplies public rendering and metadata. Stable identities bind icons, pictures and FAQ state independently of labels. Approved contact details, destination links, form requirements and operational warnings remain application controlled. This change does not enable refunds, account tracking, notifications or checkout. No dependencies or database migrations were added.

## Test-first evidence

- Contract RED: a valid servicePages document was rejected, false versus true. API RED: new draft save returned 400 versus 200, while the original 12 cases passed. GREEN: 12 contract cases and 13 API content lifecycle cases, including editor publish denial, draft isolation, stale conflicts, restore-as-draft and invalid-write nonmutation.
- Admin RED: Contact title field was absent, undefined versus Contact Us. GREEN: 28 related admin cases. The new success/conflict cases edit all three templates, retain sibling edits, preserve focus on section movement, reject blank required text and verify unpublished draft payloads.
- Renderer characterization passed 2/2 before changes. RED: edited heading remained original, hidden-section fallback heading was absent, edited escaped copy was absent and renamed/reordered Help content lost focus. GREEN: 22 related renderer/metadata/home/storefront cases. Existing test transport mocks were updated narrowly because Contact now reads published content.

Focused commands, with Node 22:

```sh
npx tsx --tsconfig apps/web/test/tsconfig.json --test apps/web/test/admin-service-pages.test.tsx apps/web/test/admin-nimbus.test.tsx apps/web/test/admin-story.test.tsx apps/web/test/admin-home-details.test.tsx apps/web/test/admin-dashboard.test.tsx
cd apps/web
npx tsx --tsconfig test/tsconfig.json --test test/service-contract.test.tsx test/content-contract.test.tsx
npx tsx --tsconfig test/tsconfig.json --test test/service-pages.test.tsx test/page-metadata.test.tsx test/content-home.test.tsx test/storefront-ui.test.tsx
cd ../api
npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-content.test.ts
```

## Integrated verification

510 tests pass: 203 API, 249 web and 58 deployment/recovery, including five separate database recovery cases. Destructive tests used guarded dedicated loopback port 55439 databases with exclusive test ownership. Full typecheck and both production builds passed. Dependency audit, redacted history-secret scan and static scan passed; Semgrep ran 74 rules on 139 targets with zero findings. Staged and final-commit checks remain separate gates. Independent read-only review of the complete final source diff found no actionable correctness/security issue. This is not exhaustive security assurance.

Built local API and storefront run on ports 4100 and 3000. API health reports preview mode and checkoutEnabled false. Browser checks at 1280 and 390 pixels verified one H1, no horizontal overflow and default section order across all three routes. Contact FAQ opens with keyboard Enter; the mobile Help panel receives focus and Escape restores focus to its category. Bulk artwork loaded and the main pages contain no links to the old Shopify shop. Returns retains its fixed enquiry-only disclaimer. Viewport override was reset. The first attempted browser FAQ role selector did not match native summary elements; inspection and the correct visible summary selector verified the behavior. No customer enquiries were submitted.

Real production staff acceptance remains pending private account activation. Browser checks are bounded and do not establish complete pixel parity or all accessibility states. The existing test image stub emits a nonboolean priority warning; production artwork loads. A contracts-only typecheck attempt found no package-level tsconfig; integrated typecheck passed instead.

## Release and remaining work

Older strict-schema binaries reject servicePages documents. After saving this shape, rollback needs a compatible binary or deliberate content recovery; do not rewind newer commerce or enquiry records as routine application rollback. Keep paired database/media recovery available.

Production application remains at the previously verified 26bd9aa release. Server-capacity resolution and the existing exact-target cleanup decision remain pending. No releases were removed, no production account was created and no application deployment occurred. Remaining CMS work includes structured policy/blog content and further media/merchandising controls. Integrations, measured performance, operations and commerce readiness remain separate open work.
