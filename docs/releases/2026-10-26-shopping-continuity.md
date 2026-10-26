# Shopping interaction continuity — 26 October 2026

Changing a product option previously remounted the detail view and cleared delivery input, quantity, gallery state and keyboard focus. The product route now keys the view by product identity. Native history replacement and `useSearchParams` keep the URL and selected option synchronized without a new server navigation. Unrelated query parameters and hash remain intact. Navigating to a different product deliberately resets product-specific state.

Saved furniture now retains settled cards when another item loads or is removed. Requests are scoped to unresolved handles; removed requests abort, late results cannot resurrect them, and mismatched product handles fail safely. Focus moves to the next/previous saved-item control, the empty-state Explore link or a stable wishlist region when only pending/failed items remain. Unrelated focus is not stolen.

Horizontal wheel/trackpad input pauses carousel autoplay until explicit Play, without preventing native scrolling. Ordinary vertical scrolling is unchanged. Existing focus/hover/visibility/reduced-motion behavior remains.

Desktop product-card View details no longer overlaps the heart button. Mobile product columns allow the thumbnail strip to scroll internally instead of widening the page. Original copy, price display, media and checkout gates remain unchanged. No dependencies, database migration or backend authority changes.

## TDD and verification

Use Node22. Evidence retained in `.local/interaction-audit` and copied to the private verification directory after integration.

- Product characterization passed before changes. Real route-boundary RED reproduced cleared postcode and lost DOM identity. A proposed acknowledgement queue exposed another RED on returning to the initial option then navigating externally; the queue was removed. Eight route tests now cover URL authority, aliases/fallback, rapid changes, mapped images, retained inputs/focus, new-product reset and query/hash/history preservation. `npx tsx --tsconfig test/tsconfig.json --test test/product-route-continuity.test.tsx test/product-variant-presentation.test.tsx` from `apps/web` passes17 tests.
- Wishlist characterization2/2; initial RED3 for disappearing settled cards and all-or-nothing errors; additional RED for focus fallback and wrong-handle response. Focused10/10 GREEN; header integration adds1. Tests include abort/re-add races and StrictMode cleanup.
- Motion characterization15/15; horizontal/Shift-wheel RED3 when autoplay advanced240px to1440px after manual intent. Affected motion/video/reveal/category43/43 GREEN. Native event default is preserved; explicit Play resumes.
- Initial integrated run found a stale `router.replace` mock assertion in storefront-ui. Replaced it with actual URL/path/query/hash assertions while retaining price/gallery/enquiry assertions, and restored URL state after fixtures. Focused7/7 GREEN. Final `npm test`:728 tests pass (251 API,424 web,53 deployment), zero failed/skipped. Five guarded recovery-DB tests run separately before merge.
- Final typecheck/build and independent regression review pass. Initial strict Semgrep scan returned exit3 despite zero findings: its parser rejected two raw JSX ampersands. Encoding them as `&amp;` preserves visible copy; focused strict scan passes without suppression. Staged/final-commit security checks remain merge gates.

## Ordinary-browser checks

- Before fix, Aero postcode110015 cleared and focus became BODY on Desert Taupe selection. After fix, postcode remains110015, the selected radio retains focus and URL retains campaign/hash. Rapid selections agree with URL; back/forward across another product restores the correct variant. Postcode reset after a different-product navigation is intentional.
- Before fix, clicking a related-product heart navigated to the product. After fix, desktop/mobile clicks update saved count without navigation.
- Before fix, removing a saved item left focus on BODY. After fix, desktop drawer and mobile favourites route focus the remaining Aero remove control. Synthetic additions were removed, restoring the original local saved list.
- Mobile ARVEN with six thumbnails initially widened390px viewport to394px. After fix, document390px, gallery350px, thumbnail client350px/scroll374px. The strip scrolls without widening the page. Viewport override reset.
- Native physical horizontal-wheel input and VoiceOver were not exercised; component wheel tests are not a full WCAG audit. W3C APG dialog/carousel guidance informed this pass. Rotation-control tab order, contrast and broader route/state acceptance remain backlog work.
- Local API health: preview mode, checkout disabled. Homepage JS228571raw/68699gzip bytes (+1160/+396 from previous increment), no admin/source leakage markers; not a Core Web Vitals measurement.

## Release limits

Not deployed by this increment. Production capacity and approval for the specifically archived releases remain unresolved; no server deletion or account creation. First publisher remains aditya@maplefurnishers.com with private password setup pending. Customer reviews/newsletter/accounts, cart uncertain-write recovery, commerce integration, operational alerts and full visual/performance acceptance remain incomplete. The full goal stays active.
