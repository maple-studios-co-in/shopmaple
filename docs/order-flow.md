# Durable order foundation

Implemented as a callable server service in `apps/api/src/orders/service.ts`. It has no public routes, running worker, credentials, production reservation adapter or Keeri delivery implementation. Public checkout remains disabled. Tests use PostgreSQL and the existing Razorpay adapter with fake HTTP responses; no merchant requests or Keeri writes were made.

`CheckoutAttempt` is the durable logical commerce order for this foundation. One attempt has one immutable commercial snapshot, one stock reservation, one provider receipt/order and at most one accepted payment. `PaymentWebhookInbox` records authenticated event identity and processing outcome. `OrderOutbox` holds a pending Keeri handoff after capture. The outbox is an intention to deliver, not proof that Keeri accepted an order.

## Calling the service

Construct `createOrderService(db, options)` only in a trusted server composition root. Options contain a gateway, stable `merchantScope` identifying merchant and environment, a server pricing policy `quote(items)`, an optional reservation port and an optional clock for tests. The merchant scope must match the gateway credentials and endpoint secret. It is not browser input; the gateway does not discover or verify that merchant mapping.

| Method | Contract |
| --- | --- |
| `freezeCart(cartToken, idempotencyKey)` | Hashes the opaque guest credential, finds its unexpired cart and calculates a snapshot from current database prices and the configured server quote. A repeated key on the same cart returns the original snapshot, including after price/cart changes or process restart. |
| `createProviderOrder(cartToken, attemptId)` | Checks guest ownership and merchant scope, rechecks publication/stock eligibility, claims the attempt once, obtains a verified durable reservation, persists that guarantee, then requests exactly one provider order. |
| `ingestWebhook(rawBody, signature, eventId)` | Verifies original Buffer bytes using the existing adapter before storing authenticated event metadata. Returns only after durable insertion or finding the existing identical event. |
| `processWebhook(inboxId)` | Resolves the provider order within the configured merchant, verifies the reservation, fetches current payment evidence using persisted money, then transactionally records capture, inbox completion and the outbox job. |

The freeze operation accepts no prices, tax, shipping or totals from the browser. Its snapshot contains product/variant identities, titles, SKU, quantities, unit/line prices, subtotal, shipping, additive tax, INR and the pricing policy ID. A configured policy must explicitly account for whether catalogue prices already include tax; the test policy is not a production shipping or tax policy. Amounts must fit nonnegative PostgreSQL/Prisma `Int` and the final amount must be at least 100 paise. Quantities are limited to 1–20 across at most 50 variants. Only published, available variants with `stockPolicy: stocked` are eligible. Catalogue availability is an initial filter, never a reservation guarantee.

## Reservation boundary and states

The default state is `reservation_required`. Without a reservation port, provider order creation stops there with `RESERVATION_REQUIRED`. The port must reserve the exact frozen items across online and offline sales and return the same attempt ID, canonical snapshot SHA-256, a durable reservation ID, explicit verified flag and future expiry. Its `verify` operation must confirm that binding still guarantees stock through the expiry. Both methods are server-only integration contracts; no real Keeri endpoint is assumed or implemented.

Normal state sequence:

```text
reservation_required -> reserving -> creating_provider_order -> awaiting_payment -> captured
            \-> abandoned           \-> reconciliation_required <-/      \-> releasing -> abandoned
```

Concurrent callers use a conditional database claim; only one can reserve and POST. A failure or ambiguous outcome during reservation/provider creation leaves `reconciliation_required`. A process crash may leave `reserving` or `creating_provider_order`; these states also refuse automatic retries. Reconcile using the same persisted attempt/receipt with the provider and reservation system before any recovery. No new receipt or replacement provider order is automatically generated. `releaseAttempt` lets the owning guest abandon a `reservation_required` or `awaiting_payment` attempt: the Keeri hold is released best-effort and the attempt becomes `abandoned`, or `reconciliation_required` (`RELEASE_UNCERTAIN`) when the release fails. A failed provider order also releases its hold before leaving `reconciliation_required`. There is still no manual recovery or cancellation API for captured orders.

Prices stay frozen even if the catalogue price changes. Publication and stock eligibility are rechecked before reservation. The authoritative reservation port must account for concurrent inventory changes and hold inventory long enough for payment and eventual Keeri handoff. It must eventually support an idempotent conversion of the reservation into a fulfilled order; that integration is still required.

## Webhook durability and capture

An eventual HTTP endpoint must place limited raw-body middleware before JSON parsing, pass the signature and event headers, and acknowledge only after `ingestWebhook` resolves. It must not acknowledge a failed database write. There is no such endpoint in this implementation.

The inbox stores the authenticated SHA-256, event type and provider/payment IDs, not the complete raw payment payload or signature. Uniqueness on merchant/event ID detects a changed body under an existing event ID. Separate uniqueness on merchant/body digest defeats replay with a changed unsigned event-ID header. Only `payment.captured` and `order.paid` are actionable; other authenticated events are stored as ignored. A worker can select pending records and explicitly retry records requiring reconciliation; there is no scheduler in this module.

Before any new capture, the service checks reservation validity and expiry. It fetches payment state from Razorpay using the persisted order ID and amount, requiring captured status, matching identity/currency/amount and no refund. Unknown mappings, verification failures, expired/revoked holds and nonpayable/cancelled states leave the inbox requiring reconciliation with a bounded error code. A webhook that arrived before the provider mapping was persisted can be retried after that mapping becomes available. Failed/authorized events never downgrade captured orders. A different payment ID for an already captured order is quarantined.

The final serializable transaction rechecks order state and reservation expiry, records the unique payment identity, sets `captured`, removes the paid lines from the guest cart (and bumps its revision) so the same goods cannot be quoted again, inserts the unique outbox entry and marks the inbox processed. Database failures roll back those changes. Concurrent workers and duplicate events produce one capture and one handoff. The handoff payload contains the frozen snapshot, merchant/provider/payment identity, amount and reservation ID. It contains no fabricated customer/address data.

## Customer accounts and Maple order numbers (11 Nov 2026)

Migration `20261111140000_customer_accounts` is additive. It adds two nullable `CheckoutAttempt` columns, the `maple_order_number_seq` sequence and the customer tables described in [architecture](architecture.md#customer-accounts). The previous release keeps working because it never reads them.

- **`customerEmailKey`.** `freezeCart` sets it when the quote freezes the attempt. It is the snapshot's customer email, lowercased and trimmed (`emailKey`). Legacy version 1 snapshots carry no customer and stay `NULL`. The capture transaction fills it if it is still empty, for attempts an older release froze.
- **`orderNumber`.** This is Maple's own number, shown as `MF-<n>`. It comes from `nextval('maple_order_number_seq')`, an integer sequence that starts at 10001 and never cycles. It is assigned inside the serializable capture transaction in `processWebhook`, together with `paymentId` and `capturedAt`. Both payment outcomes get one: `captured`, and `paid_hold_lapsed` (paid, but confirmed or refunded by hand). An attempt that already has a number keeps it, so a replayed or duplicate event never renumbers it. A retried or rolled-back transaction can leave a gap in the sequence, but a number is never reused. Keeri's SO number (`OrderOutbox.externalOrderId`) stays internal.
- **Backfill.** The migration links existing version 2 attempts to their email. It numbers attempts already paid, in `capturedAt` order. `backfillOrderLinks` in `apps/api/src/orders/order-links.ts` repeats both statements, idempotently, every time the API starts. That covers attempts the previous release froze or captured between the migration and the new API starting. Neither statement names `"catalogueBindings"`, so its immutability trigger stays quiet.

**What a customer sees.** A signed-in customer sees the attempts whose `customerEmailKey` equals their `Customer.emailKey`, in the paid states `captured` and `paid_hold_lapsed`, with a number. When `KEERI_MERCHANT_SCOPE` is set, only that scope counts. `reconciliation_required` is left out on purpose: in `service.ts` it never holds a verified payment. It marks an uncertain hold, provider order or release, and when Razorpay later confirms a payment for it, the worker moves it to `paid_hold_lapsed`, where it appears. Any other order number, including another customer's, answers the same 404 as one that does not exist.

The customer-facing status is derived from today's data, as `getAttempt` does:
- `confirmed`: `captured`, and the `keeri.order.captured.v2` outbox entry is `delivered` with an SO number.
- `confirming`: every other paid order, including a failed Keeri delivery and `paid_hold_lapsed`, which is confirmed by hand.
- `cancelled`: reserved and not produced yet.
- `delivered`: reserved for when staff status exists.

The journey marks Confirmed done (with the Keeri acceptance time) or current, and Preparing, Dispatched and Delivered as upcoming. The delivery estimate counts from the capture day in India. It adds the longest made-to-order lead time and the courier's estimated days, with a three-day window (`estimateSpreadDays`, an owner decision to confirm). It is null when either figure is unknown.

**Emails and status.** `customer_confirmed` and `customer_received` show `MF-<n>` once it is assigned. They fall back to the old Keeri reference or checkout id only for an attempt captured before numbering existed. Staff emails keep the Keeri SO and checkout ids and add the Maple number. The guest status response (`GET /api/checkout/:attemptId`, through the cart cookie as before) gains `orderNumber: "MF-…" | null`. The signed-in owner can also open the order on any device through `GET /api/account/orders/:number`.

## Remaining activation work

- Integrate and validate real inventory reservation/expiry/consumption across channels, including last-item contention and delayed payments.
- Supply merchant-approved pricing, shipping, tax and delivery eligibility, and collect required customer/order information.
- Confirm the gateway merchant/mode, configure credentials and raw webhook routing, and add protected checkout/status endpoints.
- Implement observable inbox scheduling, uncertain-creation reconciliation and an idempotent Keeri outbox consumer with delivery retries and acknowledgement.
- Implement refunds/disputes/cancellation reconciliation. Ignored refund/dispute events currently do not update commerce state.
- Validate the complete provider sandbox flow and ordinary browser checkout before enabling purchases.

## Verification

The first behavioral run failed against an explicit unimplemented service scaffold. The implemented service passes 18 PostgreSQL integration tests, and the complete API suite passes 60 tests with file concurrency restricted to one. The tests cover guest/scope isolation, immutable totals, reservation gates, concurrent idempotency, provider ambiguity, raw signature validation, digest/header replay, payment mismatches/refunds/authorization, out-of-order and duplicate events, cancelled/expired/revoked holds, and a real SQL outbox insertion failure demonstrating rollback and successful retry.

From the repository root with Node 22 and the local test database configured in `.env`:

```sh
npx tsx --env-file=.env --test --test-concurrency=1 apps/api/test/orders.test.ts
npm test --workspace=@shopmaple/api
npx tsc --noEmit -p apps/api/tsconfig.json
```

Customer accounts and order numbers: `apps/api/test/account-unit.test.ts` and `account-contract.test.ts` run without PostgreSQL. `account-db.test.ts` needs `TEST_DATABASE_URL`. It covers sign-in by code and by password, sign-up, password resets, sessions, the adversarial cases, orders, addresses, the flag, capture numbering and the start-up catch-up. `checkout-composition.test.ts` checks the MF number in the customer emails and on the status page.

This is local service/database evidence, not provider sandbox, live payment, inventory concurrency or Keeri delivery validation. See `docs/payments.md` for the underlying gateway contract and provider references.
