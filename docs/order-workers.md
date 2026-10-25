# Durable order workers

`apps/api/src/orders/workers.ts` provides two explicitly invoked, bounded batch processors. It does not start background jobs, read credentials, create provider orders, or connect to a Keeri endpoint. Production startup still leaves these capabilities disconnected.

## Capabilities and ownership

| Processor | Reads and changes | Port | Completion |
| --- | --- | --- | --- |
| Payment inbox | Merchant-scoped authenticated `PaymentWebhookInbox` rows; lease and retry metadata | `createOrderService(...).processWebhook(id, { leaseToken })` | The order service atomically captures the attempt, creates the Keeri outbox, and marks the inbox processed. Business reconciliation remains manual. |
| Keeri outbox | `OrderOutbox` joined to its merchant-scoped `CheckoutAttempt`; lease, retry and acknowledgement metadata | `KeeriOrderDeliveryPort.deliverCapturedOrder` | A bound downstream acknowledgement persists `deliveredAt` and `externalOrderId`. This is a handoff acknowledgement, not proof of fulfillment. |

The Keeri port is an **unconnected contract**. A pending commercial-review intake receipt is not an external sales-order acknowledgement and must not populate `externalOrderId`. The present frozen snapshot lacks customer/shipping information needed for a complete downstream sales order. A verified production integration must either complete that order contract or explicitly version this delivery protocol to represent an intake receipt separately. No endpoint, customer record, order, reservation, or acknowledgement is fabricated here.

## Claims, crash recovery and retries

Each processor atomically claims one row with PostgreSQL `FOR UPDATE SKIP LOCKED` and an `UPDATE ... RETURNING` statement. Concurrent processes cannot claim an unexpired lease. Every claim has a fresh UUID token, a deadline and a persisted attempt count. One row is claimed immediately before processing; a batch does not lock many rows while waiting on an earlier network call.

A batch accepts 1–100 rows (default 10). Defaults are a 30-second lease, five attempts and a five-second initial retry delay. Retries use exponential backoff capped at one hour. Configuration permits 1–10 attempts, 1–300-second leases and 1-second–1-hour initial backoff. Injected clocks make expiry/retry tests deterministic. SQL casts UTC ISO timestamps explicitly, and `nextAttemptAt` has a UTC database default, so a non-UTC PostgreSQL session does not reclaim a live lease or delay freshly migrated work.

An expired claim can be recovered by a subsequent batch. A crash on the final permitted attempt is quarantined with `RETRY_BUDGET_EXHAUSTED`; lowering the configured budget does not erase historical attempts. A payment worker that crashed after the business transaction committed can finish its metadata without repeating business processing.

Every completion and failure update checks both the claim token and its unexpired lease. The order service also checks that token at entry, during reconciliation and inside its serializable capture transaction. Direct calls cannot bypass an existing lease. An old worker cannot overwrite a newer worker's acknowledgement or capture outcome. Expired external calls can still have reached a remote system: safe replay therefore depends on receiver-side idempotency, not on the lease alone.

Batch results contain counts only: `claimed`, `complete`, `retried`, `failed`, and `lostLease`. A failed database claim propagates to the caller; it is not reported as a successful empty batch.

## State and failure handling

Payment business state (`pending`, `processed`, `ignored`, `reconciliation_required`) is separate from worker state (`pending`, `processing`, `complete`, `failed`). Only pending business events receive automatic processing. A returned `reconciliation_required` is terminal for automation, even when a human could later reconcile it safely. In particular, provider verification or reservation uncertainty currently requires review rather than automatic retries. Thrown operational errors receive bounded retries with `PAYMENT_PROCESSING_UNAVAILABLE` in worker metadata; business evidence is preserved.

Outbox state moves from `pending` to `processing`, then `delivered`, retryable `pending`, or terminal `failed`. Before delivery, the processor requires a captured attempt and exact agreement between its immutable commercial fields and the outbox payload: merchant, attempt, provider order, payment, amount/currency, reservation and snapshot. Mismatches fail with `OUTBOX_BINDING_MISMATCH` without calling a delivery adapter. Missing attempts are not claimable through the merchant join and require operational investigation.

The delivery idempotency key is stable across retries and process restarts: `shopmaple:keeri:<merchantScope>:<outboxId>`. The request also includes a canonical SHA-256 payload digest. The receiver must atomically deduplicate this key, reject changed payloads, and return its original acknowledgement on replay. Acknowledgements must bind the merchant, attempt, key and digest, explicitly accept the handoff and contain a valid external order identifier. A mismatched acknowledgement is terminal (`ACKNOWLEDGEMENT_MISMATCH`), because blindly retrying an ambiguous acceptance could conceal incorrect order linkage.

Transient delivery exceptions persist only `DELIVERY_UNAVAILABLE`. Raw exception text, response bodies, credentials and customer details are never stored as failure messages. The worker does not retry reservation creation or irreversible provider-order creation.

## Invocation and production gates

A future worker entrypoint can construct the order service and pass it as `payments`, then invoke `runPaymentBatch()`; a verified Keeri adapter can be passed as `keeri` before calling `runKeeriBatch()`. Calling a batch without the required port throws before claiming any work. The HTTP webhook boundary only authenticates and durably ingests events; it does not initiate delivery.

Before enabling a production runner:

1. Apply the worker migration and generate the Prisma client against the intended environment.
2. Verify merchant and environment identities across payment gateway, webhook secret, reservations and delivery adapter.
3. Finish the customer/address/commercial contract and verify Keeri's idempotent acknowledgement semantics. An intake receipt alone does not meet the current order-delivery contract.
4. Configure network timeouts shorter than the lease. There is no heartbeat extension or forced cancellation of arbitrary injected ports; a stuck port cannot finish its batch until that port settles, though another process can recover its expired lease.
5. Add supervised scheduling, operational metrics/alerts and an authenticated manual-reconciliation workflow. No public retry/reset endpoint is provided.
6. Exercise capture, crash/restart, ambiguous acknowledgement and recovery in staging before enabling live checkout.

## TDD evidence

Tests are in `apps/api/test/order-workers.test.ts` and use the dedicated `shopmaple_test` PostgreSQL database; external delivery/payment fetches are injected, while claims, leases, transactions and durable results use real SQL.

On 2026-10-25:

- Tests were authored before implementation, initially against a no-op public API scaffold. RED assertions included no concurrent delivery, absent backoff, pending instead of processed/failed state and missing configuration rejection (`/tmp/shopmaple-workers-red.log`). The first schema-dependent assertion was rerun after migration and failed on its expected durable outcome (`/tmp/shopmaple-workers-schema-red.log`).
- A payment lease regression failed with “Missing expected rejection” before service fencing (`/tmp/shopmaple-workers-fence-red.log`).
- The first implementation exposed premature retry against a non-UTC PostgreSQL session. Explicit UTC raw-SQL casts fixed the retry deadline. A raw-insert database-default test then exposed the same timezone issue in migration defaults; the UTC default fixed it. A separate RED test caught historical attempt counts decreasing after a configured retry budget was lowered.
- Final scoped verification passed **33/33** tests: 15 worker cases and 18 existing order-service cases (`/tmp/shopmaple-workers-green.log`). API typecheck passed. The dedicated test database was reset and all four migrations replayed successfully after the UTC-default fix.

The temporary logs are local evidence, not committed artifacts. Root integration verification runs the full repository suite and security checks separately; this scoped result is not a production-readiness claim.
