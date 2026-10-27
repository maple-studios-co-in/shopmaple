# Checkout HTTP boundary

The API has a configuration-gated checkout HTTP boundary. `createApp(db, config, commerce)` accepts an injected order service; `server.ts` composes one through `commerce-composition.ts` only when `CHECKOUT_ENABLED=true` and the full commerce configuration is valid (see the checkout gate in [store deployment](store-deployment.md)). Otherwise the running preview returns `503 CHECKOUT_NOT_AVAILABLE`, health reports `checkoutEnabled: false`, and the cart still advertises checkout as disabled. When composed, `GET /api/checkout/options` publishes the configured delivery methods and the public Razorpay key id, and the `/checkout` page runs the hosted browser flow. Deploying this code does not activate live payments; configuration and the recorded release gates do.

## Routes when explicitly injected

| Route | Request authority | Result |
| --- | --- | --- |
| `POST /api/checkout` | Exact configured browser Origin, current `maple_cart` cookie, `Idempotency-Key`, strict `{}` JSON body | Freeze the current cart using stored prices and a server-side quote policy. Repeated keys for the same cart return the same attempt. |
| `POST /api/checkout/:attemptId/payment-order` | Exact configured Origin, current guest cookie, UUID attempt ID, strict `{}` JSON body | Create or replay the provider order for an owned attempt. The durable attempt ID supplies idempotency; no client amount, currency, merchant, reservation or payment fields are accepted. |
| `GET /api/checkout/:attemptId` | Current guest cookie and UUID attempt ID | Return only an owned attempt's public status. Unknown, expired and other-cart credentials cannot read the attempt. |
| `POST /api/webhooks/razorpay` | Exact raw-body HMAC, `x-razorpay-signature`, `x-razorpay-event-id` | Persist authenticated receipt and return `202 {"accepted":true}`. Payment verification and order delivery happen separately. |

The response DTO is an allowlist: `id`, `state`, `amountPaise`, `currency`, `paid`, `providerOrderId`. It excludes frozen item snapshots, SKUs, cart IDs/tokens, merchant scope, reservation IDs, receipts, payment IDs, internal failure codes and provider responses. `paid` becomes true only for the service's verified `captured` state. An accepted webhook is not payment confirmation.

Checkout and webhook responses use `Cache-Control: private, no-store`. The normal API rate limiter also applies to the webhook. The application continues enforcing Origin on browser mutation routes, including checkout. Only the exact machine POST path bypasses browser Origin checks; suffixed and trailing-slash paths do not. The webhook parser runs before the generic JSON parser, accepts only uncompressed `application/json`, and caps the raw body at 64 KiB. Authentication happens in the existing gateway before any inbox database write. The HTTP layer deliberately does not synchronously process the event or contact the provider.

Guest credentials must contain exactly one well-formed `maple_cart` cookie. Existing service checks enforce cart expiry, cart ownership and merchant scope. Missing or mismatched credentials receive the same public not-found response. Body and key validation failures return 400; invalid HMAC returns 401; oversized webhook bodies return 413; unsupported encoding/content types return 415. Domain failures are translated to safe public messages without internal error details.

## TDD evidence — 2026-10-25

From `apps/api`, using Node 22 and the dedicated local `shopmaple_test` PostgreSQL database:

```sh
export PATH=/Users/adityaagrawal/.nvm/versions/node/v22.21.1/bin:$PATH
../../node_modules/.bin/tsx --env-file=../../.env --test --test-concurrency=1 test/commerce-http.test.ts
```

**RED:** Tests were written against the existing `createApp` before implementation. Nine tests executed: two existing safety regressions passed and seven feature tests failed with assertion mismatches. The first failure was `503 !== 200` for authenticated freezing; strict-input and ownership cases returned 503 instead of 400/404; the machine webhook returned 403 instead of authenticated webhook statuses. There were no missing-module or import failures. Full local RED output: `/tmp/checkout-http-red.log`.

**GREEN:** The same command then passed all nine tests, zero failed, zero skipped. After fixing optional response-header TypeScript annotations, it passed again (nine tests, duration 513.898875 ms). The first GREEN output is recorded locally at `/tmp/checkout-http-green.log`. Temporary logs are local execution evidence, not repository artifacts.

The tests use real Express routes, real order and payment service logic, real PostgreSQL persistence, and signed raw webhook fixtures. Only external Razorpay transport and stock reservation authority are controlled fixtures. They assert persisted totals and replay counts, strict input rejection, current-cookie ownership, minimal public DTOs, raw-byte authentication before storage, replay deduplication, pending-versus-verified-capture state, payload limits, retained CSRF enforcement, and disabled-default behavior. The captured-state test first receives an authorized/noncaptured provider response and proves no paid status/outbox exists, then supplies captured evidence and observes the durable handoff.

The scoped test run is not a claim that the full project suite has passed. A concurrent worker/schema task was still in progress when API typecheck ran; its not-yet-generated Prisma worker fields were reported. The integration owner runs the full suite and final typecheck after merging the parallel changes.

## Activation requirements

Before injecting a production service, complete and validate the real Keeri reservation authority, merchant/environment configuration, shipping/tax policy, worker operation and recovery, captured-order delivery, checkout UI and hosted-gateway integration, and production routing/observability. The service used by these tests has fixture stock holds and fixture provider HTTP responses; they must never become production defaults. No live provider or Keeri calls were made while implementing this boundary.
