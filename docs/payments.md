# Razorpay gateway boundary

Status: isolated server module, verified with deterministic fixtures and mocked HTTP on 25 October 2026. It is **not connected to public checkout**. Historical Shopify orders identified Razorpay; current merchant ownership, enabled methods, capture settings and webhook configuration remain unverified. No credentials were inspected and no provider API calls or payments were made during implementation.

## Implemented

`apps/api/src/payments/razorpay.ts` exposes `createRazorpayGateway(config, options)`:

- `createOrder({ amountPaise, currency, receipt })`: creates a provider order through the Orders API, using Basic authentication and integer paise in INR (minimum 100 paise). Partial payment is disabled. Validates the returned identity, receipt, amount, currency and initial state. Input must come from a frozen, server-calculated checkout attempt.
- `verifyCallback(expected, callback)`: checks the Checkout HMAC with the **persisted server order ID**, then fetches the payment. It checks payment ID, order ID, exact amount, INR, `status: captured`, `captured: true`, and absence of refunds. Returns a small captured-payment evidence object with no customer or payment-method fields.
- `verifyCapturedPayment(expected, paymentId)`: performs the same authenticated fetch and validation for reconciliation workers. `expected` must come from persisted commerce state. An event's amount or order ID is never sufficient authority for fulfilment.
- `authenticateWebhook(rawBody, signature, eventId)`: verifies original Buffer bytes using the dedicated webhook secret, then parses the envelope. It returns the event ID, body SHA-256, event type and, for `payment.captured`/`order.paid`, payment/order identifiers for lookup. It does **not** return paid state or mutate an order. Other events are authenticated but non-actionable in this module.

Standalone `verifyCheckoutSignature` and `verifyWebhookSignature` return authenticity only. They compare valid SHA-256 digests using `timingSafeEqual`. Invalid or absent secrets fail explicitly. Webhook body verification precedes JSON parsing; inbound payloads are limited to 1 MiB at this boundary.

The default transport is Node's `fetch`; `options.fetch` supplies a mock transport in tests. The endpoint is fixed to `https://api.razorpay.com/v1/` and redirects are rejected. A 10-second deadline covers both connection/response and JSON body reading (configurable up to 60 seconds). Errors expose a code and optional HTTP status, without provider error bodies, raw transport messages, personal data or credentials.

## Configuration contract

A future server composition root can map these environment names to the explicit config object:

| Environment name | Config property | Purpose |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | `keyId` | Merchant API key ID, test or live mode |
| `RAZORPAY_KEY_SECRET` | `keySecret` | Server-only API and Checkout-signature secret |
| `RAZORPAY_WEBHOOK_SECRET` | `webhookSecret` | Separate server-only secret configured on this webhook endpoint |

The module does not read environment variables and construction makes no network call. There is no configuration added to the running application. Never supply these secrets through a browser bundle. A test key and live key share the same API hostname; the configured key determines the mode. Confirm merchant account, mode and capture policy before invoking this module against Razorpay. No capture or refund mutation APIs are implemented.

Webhook secret rotation needs a bounded history of endpoint secrets for older retried events. This module validates one explicitly supplied secret; secret-version selection and retention belong to the deployment/integration layer. Do not assume the API key secret is the webhook secret.

## Required integration before accepting payments

1. Persist a guest-scoped checkout attempt and immutable commercial snapshot calculated by the server, including prices, shipping, tax, amount and currency. Authenticate access to that attempt using an opaque guest credential. Persist a stable unique receipt (at most 40 printable ASCII characters) and deduplicate submissions before requesting a provider order.
2. Acquire a durable stock reservation that coordinates online/offline inventory. Establish expiry, cancellation and late-payment reconciliation. If this guarantee is unavailable, leave purchase disabled for affected items.
3. Persist provider order identity against the attempt before exposing hosted Checkout. Record uncertain creation outcomes for reconciliation. The adapter performs **no retries**. Timeout, transport failure, HTTP failure or invalid response after POST reports `operationOutcome: unknown`; the provider may have created an order. Reconcile by the original attempt/receipt before another create call. A fresh receipt must not be generated merely because a response was lost.
4. Route webhooks through raw-body middleware **before** the general JSON parser, with an HTTP body limit. Pass `X-Razorpay-Signature` and `x-razorpay-event-id`. Verify before accepting or storing an event as authentic. Bind the endpoint secret and API credentials to the same confirmed merchant/mode.
5. Persist an inbox record with unique provider/merchant/event identity and body digest. The event-ID header is outside the signed body; do not rely on that header alone to defeat replay. Record the digest and enforce unique provider payment/order transitions too. Event delivery may be duplicated or out of order. Persist acceptance durably before acknowledging; a successful signature check is not a durable acknowledgement.
6. Resolve the event's identifiers to an existing persisted attempt, load expected money/order identity from that attempt, then fetch current captured-payment evidence. Unknown mappings, amount mismatches, authorizations, refunds, expired reservations and unavailable provider state require reconciliation. Do not reinterpret these errors as payment failure or silently release stock.
7. In one database transaction, apply an allowed idempotent commerce-order transition, mark the inbox work complete and enqueue the Keeri handoff/notification jobs. A verified capture alone cannot determine whether a cancelled/expired order should be fulfilled. Retry durable workers safely and alert on unresolved state. Browser redirects cannot mark an order paid.
8. Implement refund/dispute reconciliation separately and verify the complete sandbox flow, duplicate events, network ambiguity, last-item concurrency, delayed capture and durable handoff retry before exposing checkout. Merchant-specific limits and automatic capture settings must be verified in that environment.

The separate [order service](order-flow.md) now provides frozen checkout attempts, creation idempotency, an authenticated webhook inbox and a transactional Keeri outbox around this adapter. Production reservations, worker delivery and refund reconciliation remain unimplemented. No public endpoint invokes the gateway; the existing checkout refusal stays in place.

## Verification

Run without database or merchant configuration:

```sh
npx tsx --test apps/api/test/razorpay.test.ts
npx tsc --noEmit -p apps/api/tsconfig.json
```

The test file covers documented signature fixtures, exact raw bytes, stored-order binding, outgoing request shape, invalid money and identifiers, provider response mismatches, authorization/refunds, event authentication, unknown events, sanitized failures, absent configuration and transport/body deadlines. The initial test run failed because the adapter module did not exist; the implemented module passes all 16 focused tests. This is unit/boundary evidence, not sandbox or live payment validation.

## Official references

Reviewed 25 October 2026:

- [Create an Order](https://razorpay.com/docs/api/orders/create/): server request, integer subunits, receipt rules and response fields.
- [Standard Checkout integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/): stored-order signature formula, deterministic signature fixture and capture state.
- [Fetch a Payment With ID](https://razorpay.com/docs/api/payments/fetch-with-id/): authenticated payment fetch and payment/refund fields.
- [Validate and Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/): original body HMAC, separate secret, event ID, duplicate/out-of-order delivery and secret rotation.
- [Official Node SDK signature tests](https://github.com/razorpay/razorpay-node/blob/master/test/utils/razorpay-utils.spec.js): deterministic raw-webhook signature fixture.
