# Cart selection and storefront interactions — 26 October 2026

Published products with known prices now offer Add to cart even when stock is unverified or the item is made to order. This saves a shopping selection; it does not authorize payment, reserve stock, or create an order. Unknown-price products retain their enquiry action.

## Authority and compatibility

`canAddToCart` checks bounded integer pricing and publication. The API checks both product and variant publication against current database rows. Cart responses expose `cartable` separately from `available`; stock metadata and `canOrder` are unchanged. Older responses parse with `cartable=false`, preventing unsupported increases. Deploy compatible API/web versions together. No schema migration or catalogue rewrite is required.

New items and increases require current cart eligibility. Existing lines can decrease or be removed after delisting or loss of price. Server-owned totals, guest ownership, Origin checks, cart revisions, durable mutation receipts, replay handling and serializable transactions remain intact. The browser sends quantity and mutation context only, never prices or availability.

The cart drawer opens after an acknowledged Add to cart. Quantity edits and refresh persistence use the existing guarded cart service. Online payment remains explicitly unavailable until the full-payment made-to-order flow, merchant configuration and shipping integration are verified. The user's chosen payment policy is full prepayment; production timing will be decided per product, with no invented default date.

## Presentation

Public pages hide grey scrollbar chrome while retaining native scrolling and overflow behavior. The stylesheet is scoped through the public header, leaving Shop Admin styling untouched. Product-card and gallery wishlist controls share a 44px circular target, burgundy heart, filled saved state, visible keyboard focus and reduced-motion support. No new JavaScript or animation library is needed for these visual changes.

## TDD and verification

- API characterization 34/34 passed. Ten assertion failures established RED for priced unavailable/MTO selection, decreasing ineligible existing lines, and the new response field. Focused implementation passed; affected integration 45/45 passed. Rejection-replay coverage now uses an unknown price instead of a stock condition that intentionally no longer blocks cart selection.
- Four new rendered frontend tests failed with missing Add to cart or disabled quantity controls before implementation. They pass after the change; affected cart/variant suite 53/53, source-disclosure/route suite 21/21 and incomplete-product suite 14/14 passed.
- Earlier full runs exposed old enquiry-only/disabled-decrease/copy expectations. Those were updated to the explicit new behavior while preserving source disclosures and unknown-price safeguards. A worker was killed during an obsolete DOM assertion; the corrected focused suite and final complete suite passed. No failed run is counted as a pass.
- Final full suite: 1,036 passing tests (345 API, 638 web, 53 deployment), zero failed/skipped. Separate guarded database recovery checks are recorded in the release evidence. Node 22 types/build and homepage bundle guard pass: 257,343 raw / 77,837 gzip bytes.
- Browser verified Aera Add to cart, quantity increase, refresh persistence, totals, then removal of only the test-added item to restore the original Aero selection. No payment/order/enquiry was submitted. Wishlist toggling was verified and restored. At 390px: 44px heart targets, no document overflow, hidden scrollbar chrome. Native page scrolling still works; Admin retains its original scrollbar styling.
- Independent security/correctness review found no actionable P1/P2 issues in cart authority or compatibility. Dependency, secret and static scans, final commit review and exact-head CI remain separate release evidence.

This increment does not deploy to production. The last read-only production audit found full disk and a failed scheduled backup; those operational gates remain open. Updated banner assets were not present in the user's message, so no replacement banners were invented or published.
