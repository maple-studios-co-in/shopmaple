# Workshop playback lifecycle

The homepage workshop film previously continued playing when completely offscreen after manual Play. Root reproduced this in the built browser: paused=false with video top-4937/bottom-4437. The film now stops when offscreen, when the document is hidden, or when reduced motion becomes enabled. Returning does not restart it; the customer chooses Play again. The original poster, video URL, copy, CTA and category tiles are retained.

Playback stays unloaded until explicit Play. The accessible control follows actual media state and offers Cancel workshop video playback while a request is pending. Cancellation/unmount invalidates delayed completion, stale completion cannot stop a newer explicit request, native pause/error/ended reset the state, and failed requests can be retried. Manual Play remains available under reduced motion or unsupported observation capabilities. Without IntersectionObserver, offscreen detection is unavailable; document-hidden handling remains. The touch target is44x44px after a real mobile observation found32x32px.

## Test-first evidence

From apps/web, Node22.21.1:

`npx tsx --tsconfig test/tsconfig.json --test test/hero-video-motion.test.tsx`

RED before implementation:21tests,5characterization passes/16assertion failures; offscreen/hidden video.paused wasfalse instead oftrue, late completion restarted stopped media, native events left stale Pause label. Refining native-event boundary and adding partial-visibility case before implementation yielded22tests/17failures. That second run was piped through tail; its TAP summary was failing even though the pipeline exit was0, and is not represented as a passing run.

GREEN:22/22, then characterization of stale completions and returning before cancelled completion gave25/25 without further source change. Affected hero navigation/home details/artwork run40/40. Existing artwork tests emit the React priority attribute warning; it was not suppressed.

Initial integrated run:334APIpassed; web632/633passed. One pre-existing storefront-ui fixture supplied a matchMedia object without event methods, no-op play/pause, always-paused state and JSDOM prerender visibility. The fixture now models browser EventTarget/media state/events/visible document and restores descriptors. All original assertions, including the1700ms no-download assertion, are retained. Targeted Hero+storefront UI32/32passed. Complete final suite/build/scans and exact-head CI are separately recorded in final release evidence.

## Browser and release boundary

Built desktop1280px/mobile390px: no source before Play; real playback begins on click/keyboard; offscreen stops with correct Play label; scroll back remains paused; explicit replay and keyboard pause work. Mobile touch target44x44px, documentwidth379within390viewport; no horizontal overflow. Browser error log empty. Hidden/reduced-motion/race cases are component tests at browser boundaries, not live OS or every-browser certification. Final homepage initialJS257522raw/77926gzip stays within unchanged270000/79500budgets.

No API, database, credentials, authorization or provider changes. No production deployment, cleanup, email, order or payment actions. Checkout remains disabled; server capacity and verified backup/recovery remain deployment gates. The full CMS saved-draft preview is separately designed and not implemented by this increment. Broader user goal remains active.
