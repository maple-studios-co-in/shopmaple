# Homepage content controls — 26 October 2026

Status: implemented and locally verified; awaiting exact-head CI. Production application remains at the previously verified26bd9aa release. This increment is not deployed. Checkout remains disabled.

## Change

Shop Admin → Homepage now edits eight groups of existing homepage text: hero category labels and marketing price labels, Maple Difference, Nimbus, customer testimonial, newsletter, values, cities and project introduction. Native disclosure groups keep the form manageable. Adding a testimonial paragraph focuses its new textarea; removing one returns focus to Add. Save conflicts preserve the editor's local changes.

The optional, bounded, strict plaintext homeDetails contract preserves original Shopify copy for legacy documents. Stable category/value keys retain original image and destination mappings. Public pages read published content only; draft/save/publish/restore retain existing role, CSRF and version checks. Marketing labels do not change Keeri product prices or availability. No dependencies, migrations, media routes or commerce permissions were added.

## TDD evidence

- Contract RED: valid new homepage content failed validation and fallback assertion failed. GREEN: five contract cases cover valid/invalid values and original defaults.
- Renderer RED: edited collection CTA still showed Explore Collection and expected custom markup text was absent. GREEN:17 affected render/home/banner/UI cases, including escaping, legacy defaults, stable asset mapping, prices and public-only reads.
- Admin RED: missing homepage controls; GREEN:24 affected admin cases. Separate focus RED observed null aria-label instead of Testimonial paragraph5; the focus implementation passed both saved and conflict scenarios.
- Database RED: new draft save returned400 instead of200; GREEN:11 admin-content lifecycle tests, including editor save, publisher-only publication, public draft isolation, stale409, restore-to-draft and invalid payload refusal without mutation.

Commands use Node22:

```sh
cd apps/web
npx tsx --tsconfig test/tsconfig.json --test test/home-details-contract.test.tsx
npx tsx --tsconfig test/tsconfig.json --test test/home-details-render.test.tsx test/content-home.test.tsx test/home-banners.test.tsx test/storefront-ui.test.tsx
npx tsx --tsconfig test/tsconfig.json --test test/admin-home-details.test.tsx test/admin-dashboard.test.tsx test/admin-story.test.tsx
cd ../api
npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-content.test.ts
```

## Integrated verification

475 tests passed:201API,216web,6routing/bootstrap,25media,22paired/import and5database/recovery. npm test, npm run test:deploy:db, typecheck and production build passed. Database tests used dedicated loopback port55439 test databases, never production. Local API4100/web3000 restarted from the new build; preview mode and checkout refusal remain.

Dependency audit, committed-history secret scan and74 static rules over133 source files passed. Static analysis retains its documented standard skips and1MB limit. Staged secret scan and exact-head CI are separately recorded at release. Independent final manual security/code review found no actionable findings; this is not a formal exhaustive security audit.

Built homepage browser checks confirm all eight groups retain original copy, project response-time spacing, fixed local destinations and no shop.maplefurnishers.com links. No horizontal page overflow at1280px or390px. Desktop screenshot inspected; browser viewport reset. Tests exercise custom editor values and database publication separately; a real staff browser save/publish round trip remains pending private account setup. No production publisher credential was created or disclosed.

## Recovery and remaining work

No migration is needed. Older strict validators reject documents containing homeDetails, just as older releases reject storyPage. Keep a verified database/media recovery pair and use a compatible application release or deliberate content recovery before rollback; do not rewind newer commerce/enquiry records indiscriminately.

Deployment awaits server capacity resolution. The three exact archived release removals remain unapproved; no deletion occurred. First publisher is aditya@maplefurnishers.com with private password setup still required. Remaining CMS scope includes other existing templates/policies, additional media and merchandising controls. Enquiry operations/notifications, real review/newsletter services, accounts/returns, measured performance and live commerce readiness remain separate work.
