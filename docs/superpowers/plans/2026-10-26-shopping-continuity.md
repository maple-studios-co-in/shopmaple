# Shopping interaction continuity

This increment addresses verified interruptions in existing storefront interactions. Preserve source copy, images, prices, navigation destinations and disabled checkout. No new motion library, backend service or migration.

## Evidence and scope

- Product option navigation currently keys the entire detail view by the query variant. Ordinary-browser reproduction on Aero Dining Chair: enter postcode110015, select Desert Taupe; the variant URL changes, postcode clears and focus moves to BODY.
- The shared carousel pauses on focus/pointer interaction but ignores horizontal wheel intent. A real component reproduction dispatching deltaX200 still permits an automatic scroll at the next interval.
- Wishlist reloads all saved products whenever any handle is removed and replaces its settled grid with loading content. Characterize, then verify removal continuity and stale-response behavior before fixing.

## Parallel ownership

- Product agent: product route/detail and focused tests. Keep same-product state/focus through variant changes; synchronize the browser URL through Next-supported native history and useSearchParams and reset on a genuinely different product. Test real route boundary, valid/invalid variants and asynchronous changes.
- Motion agent: HomeCarousel and motion-rail tests. Horizontal wheel and Shift+vertical wheel pause autoplay without preventing native scrolling. Ordinary vertical page scrolling does not pause; explicit Play resumes; reduced-motion constraints remain.
- Wishlist agent: Favourites and focused tests. Retain settled cards, request unresolved handles only, exclude removed items immediately and prevent stale responses from resurrecting them. Preserve next/previous removal focus or empty-state navigation without stealing unrelated focus.
- Parent: browser reproduction/verification, integrated tests, review, security, build, CI and backlog.

## Acceptance

- [x] Characterization and genuine assertion RED/GREEN per behavior; retain logs.
- [x] Same-product option changes retain delivery input and logical keyboard focus while selected variant data updates; new-product navigation resets product-specific state.
- [x] Manual horizontal carousel input is never overridden until explicit playback restart; vertical scroll remains unchanged.
- [x] Removing a saved item retains other cards and logical focus, with no removed-item resurrection or unnecessary settled-product refetch.
- [ ] Complete repository/recovery tests, typecheck/build and staged/final security scans pass.
- [ ] Independent regression review plus ordinary desktop/mobile browser checks; disclose unavailable assistive-technology or native-wheel evidence.
- [ ] Exact-head CI passes before merge; distinguish local/merged results from production.

W3C APG dialog and carousel patterns inform the audit: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ and https://www.w3.org/WAI/ARIA/apg/patterns/carousel/. This increment is not a full WCAG conformance audit. Further work includes carousel control tab order, measured performance/contrast, customer-service integrations, staff activation and commerce/operational gates. Cart mutation timeout/reconciliation requires a separate recovery design rather than blindly allowing another write after an uncertain response.

Observed CSS corrections: desktop View details overlapped the heart target and opened a product when Save was clicked; reserve horizontal space for the heart. Mobile ARVEN with six thumbnails overflowed a390px viewport to394px; use a bounded grid column and min-width0 children so the thumbnail strip can scroll. Browser checks verify actual hit targets/layout instead of artificial source-text tests.
