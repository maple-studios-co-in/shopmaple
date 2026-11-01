# Quote and confirmed-order integration increment — 26 October 2026

## Implemented in ShopMaple

- Optional authoritative asynchronous Keeri quote in the order service. HTTP accepts validated India customer/billing/shipping details without browser-controlled money. Local ten-digit mobile numbers normalize to +91.
- Quote fetch occurs outside SQL transactions. The cart is re-read before freezing; idempotency binds customer, delivery method, addresses and variant quantities. Replays cannot silently use a changed purchase.
- Exact digest, item identity/quantity, expiry, integer amount and included/excluded tax total checks. The shared producer fixture is `docs/contracts/shopmaple-quote-v2.json`.
- Fixed HTTPS Keeri quote/reservation/order transport, scoped configuration, redirect refusal, bounded request/response sizes and deadlines covering response streams. Legacy review-only HTTP202 responses cannot confirm fulfilment.
- Versioned captured-order outbox delivery and actual order acknowledgement binding. Private customer status separates captured-awaiting-Keeri, confirmed order and review required. Error messages never infer that an uncertain payment did not occur.

## TDD evidence

Commands run with Node22 from repository root:

`npx tsx --env-file=.env --test --test-concurrency=1 apps/api/test/checkout-v2.test.ts`

RED observed before each implementation: v1 snapshot instead of v2 (`1 !== 2`); missing changed-input rejection; acceptance of browser monetary fields; missing concurrent-cart-change rejection; unnormalized phone; HTTP400 instead of200; absent fulfilment status; mixed-case/reversed item order rejecting a valid quote; captured checkout incorrectly saying "No payment is confirmed." Each corresponding case subsequently passed.

`npx tsx --test apps/api/test/keeri-commerce.test.ts`

RED observed against nonfunctional method scaffolds before implementation: wrong transport result, missing configuration rejection, wrong timeout/error behavior, absent reservation guarantee and absent actual order acknowledgement. GREEN includes stalled fetch/body, unsafe origins/paths, bounded streams, scoped requests and the shared producer fixture.

`npx tsx --env-file=.env --test --test-concurrency=1 apps/api/test/order-workers.test.ts`

V2 outbox initially completed zero deliveries instead of one; passed after version-aware binding. Existing v1, ownership, capture, concurrency and worker tests remain required.

## Release boundary and work remaining

This deployment is an explicitly checkout-disabled public catalogue/enquiry preview. `server.ts` still uses the preview composition; no live payment merchant, production worker or hosted checkout form is enabled. The callable order services and transport are tested components, not a claim of a completed merchant checkout.

The user selected Shiprocket-calculated delivery charges. No existing Shiprocket implementation was found in the checked Keeri or Maple backend source. Connect its authenticated serviceability/rate API, reviewed pickup/package data and eligible courier selection to Keeri's quote authority before activation. The temporary reviewed fixed-policy contract is not approval to invent live flat shipping rates.

Update 2026-11-01: Shiprocket-priced quotes (Keeri #789), made-to-order eligibility (Keeri #788), opt-in composition (#55), customer checkout and order-status screens, browser-callback verification, paid-hold-lapse handling, order emails and the recovery procedure are now built; the remaining gates are the account and evidence steps in the launch checklist in `docs/store-deployment.md`. The paragraph below is the original 26 October list.

Remaining activation work: Shiprocket integration and actual shipping/account configuration; approved catalogue selection/metadata; production Keeri scoped credentials; matching Razorpay merchant configuration and sandbox verification; customer checkout/status UI and opt-in server/worker composition; paid-hold expiry/recovery and refunds/reconciliation procedures. Shopify overlapping scarce stock still requires protected allocation or verified reconciliation. Existing Shopify remains at shop.maplefurnishers.com.

Enquiries are persisted in the shop database, with explicit receipt that no notification was sent. They are not yet automatically routed to Keeri staff. The live preview must not imply that staff delivery or an order/payment occurred.

Local full-suite/build/types/scanner logs: `/Users/adityaagrawal/.codex/verification/shopmaple-release-20261026/`. Scanners do not establish business correctness or merchant readiness. Final release details belong in `docs/store-deployment.md` and the release handoff.
