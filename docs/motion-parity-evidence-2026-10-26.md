# Storefront motion increment — 2026-10-26

## Source and boundaries

Observed the original public `https://shop.maplefurnishers.com/` Instagram feed moving between pages: its transform changed from -1279.58px to -3838px. The loaded feed contained 24 original post links. At a 1269px row width its six cards measured approximately 202.7 × 253.4px with 10.575px gaps. It exposed a Pause slideshow control. The source feed's public script uses automatic columns at widths below 480/768/1024/1200px of 2/3/4/5 respectively; the store uses six columns above those breakpoints. Gap is 5% of one column's allotted width. The original cities strip also moves.

Imported the same 24 posts using the public feed referenced by the original storefront script. Preserved the existing six local images and post descriptions. Added 18 JPEG thumbnails from the original public image URLs, resized to at most 720px wide with metadata removed. All 24 local images decode successfully; combined image files are 2,302,643 bytes. No external Instagram widget, tracking script, remote API call, or signed media URL is shipped to customers.

`InstagramRail` renders the source links and local images. `MovingCities` takes the existing city images as children. Both use the existing `HomeCarousel` with explicit autoplay enabled. Existing product carousels retain manual navigation by default. Parent integration owns section wiring and the layout import of `styles/motion-rail.css`.

## Behavior and TDD

Focused command, from `apps/web`, with Node 22.21.1 on PATH:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/motion-rail.test.tsx
```

Characterization: manual previous/next scrolling and reduced-motion instant scrolling passed against the original component. Server HTML already preserved links without JavaScript.

RED before implementation: the new automatic-row test failed with `Automatic rows must provide a working pause control`; the focus test had no Play control; the movement test expected scroll position 600 but observed 0. These were assertion failures against the existing component, not import/setup errors.

GREEN: add optional 4.5-second automatic page advance, controls, and native scrolling. Pause persists after focus leaves, pointer/touch interaction stops automatic motion, hover pauses temporarily, reduced-motion preference prevents automatic motion, and hidden/offscreen rows suspend it. Effects remove observers, listeners, and timers on unmount.

Additional RED: pointer activation followed by focus and click unexpectedly resumed playback (`600 !== 0`). GREEN: retain the pointer's pause intent through the focus event. Keyboard focus still pauses until the user explicitly chooses Play.

Additional RED: wrapping to the beginning used smooth scrolling, which would animate backwards through the whole row (`smooth !== instant`). GREEN: reset to the start instantly at the boundary.

Final focused result: **7/7 passing**. Node's mock timer API emits its documented experimental warning. Tests exercise real React components; jsdom browser geometry, scroll methods, media preferences, intersection observations and timer clock are controlled platform boundaries.

## Integration and security snapshot

Web typecheck passed during this increment. Concurrent web-suite snapshot: 79 tests, 74 passed, 5 failed while other agents were implementing their owned files:

- editors reorder and hide sections, change copy and save an unpublished draft
- publishers explicitly publish and restore history as a draft without auto-publishing
- version conflicts preserve local edits and require explicit reload before another save
- an expired session removes draft controls and asks for sign in
- homepage includes source Instagram posts and the original customer testimonial (old six-post expectation; source now has 24)

`npm run security:check`: dependency audit reported zero vulnerabilities, then stopped because `gitleaks` was unavailable on this process PATH. Static scan consequently did not run through that chain. These are not passing secret/static results. Parent integration must use the provisioned scanners, stage only intended changes for the staged secret scan, and run complete tests, typecheck, build, scans, and final-commit checks after all changes land.

Manual review of this increment: no checkout, customer-data, authentication, persistence, payment, request transport, HTML injection, or product source changes. React escapes captions. External links use `noopener noreferrer`. Assets are local, and the CMS validation layer must continue enforcing valid source/link origins.

The original browser was inspected, but this subagent could not keep a usable browser binding for local responsive verification. Desktop/mobile geometry, pointer/keyboard interaction, native scroll-snap, actual reduced-motion behavior, and no-JavaScript overflow still require the integrating agent's ordinary browser check. No deployment or production proof is claimed.

## References

- Original public source: https://shop.maplefurnishers.com/
- W3C carousel controls and focus behavior: https://www.w3.org/WAI/ARIA/apg/patterns/carousel/
- Native scrolling: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTo
- Offscreen observation: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API

## Integration follow-up: missing motion API

Parent's complete web run exposed a progressive-enhancement bug in an environment without `window.matchMedia`. Added a focused test which removes that API and asserts that the real carousel still renders its links, never autoplays, disables Play, and uses instant manual scrolling. RED command was the same focused command above: `AssertionError: A missing browser motion API must not prevent the carousel from rendering`, with the underlying `window.matchMedia is not a function` behavior. GREEN guards that API and defaults to reduced motion when it is unavailable. This is a production fallback, not a shim added to hide the integration error.

After the fix: focused motion **8/8**, full web **89/89**, and web typecheck all passed. The full repository/database suite and production browser checks remain owned by the integrating parent.

An independent read-only review of the new backend authentication/content contracts and migration completed as Codex Security scan `8fcd3062-e32e-47ee-9a43-f4fa7d5bb822`, with zero confirmed findings across its eight scoped surfaces. The completed report retains deployment proxy/rate-limiter identity uncertainty and missing targeted runtime cases for account-lockout recovery, initial simultaneous document creation, and session-revocation concurrency. Five real content-contract tests passed during review. This scoped review does not assert security coverage of the entire UI or repository.

With the parent's provisioned scanner PATH, the follow-up `npm run security:check` completed: dependency audit zero vulnerabilities, Gitleaks 41 commits/no leaks, Semgrep 74 rules across 98 targets/zero findings. Semgrep reported Git-based scope plus 46 ignore-pattern exclusions and one file above its 1 MB limit. This does not substitute for scanning all intended staged changes and the final committed tree; the earlier missing-PATH result is superseded only for the checks actually run here.

## Full-width source-parity follow-up

The original Instagram parent has `section--full-width` without the `section--full-width-margin` modifier. Original theme CSS spans those children across the entire section grid; horizontal padding applies only to the absent margin modifier. The app block/container both use width 100%, and its section wrapper sets only 20px vertical padding. Earlier live row width was 1269px; the exact window width was not recorded, so that observation alone is not an exact 1280px viewport comparison.

Applied only `.home-social.home-container { max-width: none; padding-inline: 0; }` in `home-parity.css`. Retained 16px inline padding on social headings, profile link and controls, leaving the Instagram image rail full width. This is declarative CSS: no artificial unit test added; parent owns the build and responsive ordinary-browser validation. `git diff --check` passed for the owned CSS/evidence files.

After this increment, `npm run security:check` exited 0 using the provisioned Node 22/security toolchains: dependency audit zero vulnerabilities, history secret scan no leaks, and Semgrep 74 rules/99 targets/zero findings. Reported scan exclusions: 47 ignore-pattern files and one file above 1 MB, with Git-based target discovery. Full log: `/tmp/shopmaple-fullwidth-security.log`. Final staged and final-commit scans remain necessary after all agents' last edits.

`npm run test:deploy:db` passed **1/1** against the local dedicated `shopmaple_preview_import_test` database. The URL was derived from a verified local `shopmaple_test` connection with only the database name replaced; credentials were not printed. Test confirms initial two-product publication, no stock authority, and refusal to repeat or overwrite an existing catalogue. Full log: `/tmp/shopmaple-fullwidth-deploy-db.log`.
