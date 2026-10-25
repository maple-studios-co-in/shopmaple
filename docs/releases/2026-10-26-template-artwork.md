# Fixed-template artwork controls

Staff can replace 21 existing image placements on the homepage, Nimbus and Our Story through Shop Admin's Artwork tab. Six placements keep separate desktop and mobile crops. Original imagery and descriptions remain the default; Restore original removes only the selected override. Product imagery remains catalogue-owned. Video files, original public copy, links and playback controls remain unchanged.

The optional strict `templateMedia` contract permits only fixed, unique placement keys and approved image URLs. Descriptions are bounded and required except for four decorative hero tiles. Managed uploads remain private until a publisher explicitly publishes a saved draft. Both responsive images, including references in hidden sections, must pass the existing atomic file/reference validation. Existing authorization, CSRF, role and version-conflict controls apply.

## Verification

Node 22 was used throughout. The integrated suite passed 572 tests (211 API, 308 web, 53 deployment/recovery); five additional isolated PostgreSQL recovery tests passed, for 577 total. Typechecking and production builds passed. Initial typechecking caught an optional Cache-Control header in a new test; the test now asserts its presence/type before checking immutable caching, and the focused API tests and typecheck/build passed again.

TDD evidence:

- Schema: `tsx --tsconfig test/tsconfig.json --test test/template-media-contract.test.tsx` from apps/web first failed three intended assertions; two existing rejection/size cases passed. Implementation then passed 5/5. Final contract/default checks with `content-contract.test.tsx` passed 13/13.
- Renderer: `tsx --tsconfig test/tsconfig.json --test test/template-artwork-render.test.tsx` first characterized all 21 original slots and six pairs, then failed because a published workshop override still rendered the original poster. Implementation passed; affected rendering/video integration passed 27/27.
- Admin: `tsx --tsconfig apps/web/test/tsconfig.json --test apps/web/test/admin-template-artwork.test.tsx` failed six intended missing-Artwork assertions, then passed 6/6. Covers private media selection, sibling edits, paired crops, restoration/focus, invalid values, stale-version retention and explicit publisher flow.
- API: `tsx --env-file=.env --test --test-concurrency=1 apps/api/test/template-media.test.ts` first failed three publication/privacy assertions. After collector changes, the initial combined invocation used the wrong working directory for an existing bootstrap fixture; rerunning from apps/api with `--env-file=../../.env` passed all 31 affected media/content tests.
- The direct resolver cloning test was written before the helper but was not independently run RED. It is additional verification; the renderer supplied the observed integration RED. No separate RED claim is made for this case.

Independent manual source/security review found no actionable new issue. Root aligned URL input limits to the 1000-character contract. Dependency, redacted secret and static scans are release gates; final revision/CI evidence is recorded with the PR and private verification artifacts.

Built public homepage, Nimbus and Story were checked at 390 and 1280 pixels without horizontal overflow. Mobile homepage artwork and Nimbus's distinct mobile/desktop film posters selected the original crops. A hydrated editor component fixture confirmed grouped placement selection, responsive fields, 1000-character URL limits, a 900-character URL without overflow, and restoration returning focus to the selector. Fixture state was synthetic and unsaved; this is not authenticated production staff acceptance. The local API returned preview mode with checkout disabled; anonymous direct/proxied admin sessions returned 401 and private no-store; the admin shell returned noindex,nofollow.

## Release boundaries and rollback

No migration, dependency addition, production content write, user creation or deployment is part of this increment. Production capacity and private publisher activation remain separate gates. All tests use disposable test databases; local development catalogue retains its existing fixture.

Deploy API and web together. Earlier strict readers do not understand `templateMedia`; after an override is saved/published, an application-only downgrade can reject that document and fall back to original content. Capture a verified paired database/media backup before release and use the matching recovery plan for downgrade. Do not silently strip staff edits to accommodate an older build.

Remaining: decorative icons/city artwork, video management, new article authoring and structural page editing, full visual/accessibility/performance acceptance, staff activation and production release, customer-service integrations, operational alerts/backups and commerce readiness. No full-site parity, zero bundle growth or checkout readiness claim is made. The shared registry reaches public source JSON in some client graphs; compressed bundle/performance impact has not been quantified.
