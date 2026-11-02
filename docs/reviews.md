# Verified buyer reviews

Only buyers whose order was delivered can review, and nothing shows on the store until staff approve it.

## Flow

1. **Delivered.** A confirmed order (a captured checkout whose `keeri.order.captured.v2` outbox row was delivered with a Keeri order number) is marked delivered in one of two ways:
   - Staff use **Reviews → Orders to invite → Mark delivered and invite review** in the store admin (staff with customer access).
   - Keeri posts a signed `order.delivered` event (below), once its fulfilment reports delivery.

   The first record wins: a repeated click or a redelivered event changes nothing and sends nothing more.
2. **Invited.** Each order line gets a single-use link `/reviews/new?token=rvi_<uuid>.<HMAC>`. The token is the invitation id plus an HMAC-SHA256 of it under `REVIEW_LINK_SECRET`, so the email can be rebuilt for a retry without storing anything secret. Links expire 90 days after delivery is recorded.
3. **Emailed.** One plain-text email per order, with a link per piece, goes through the existing Resend sender (enquiry delivery settings) with the staff inbox as reply-to. A leased worker sends it under a key derived from the order, so a retry after a timeout can't send twice. Nothing about the buyer is copied into the delivery row; the email is rendered from the checkout at send time.
4. **Written.** The buyer's link opens the form: a 1–5 star rating, title, review, the name to show and an optional city. Submitting uses the link (concurrent submissions store exactly one review).
5. **Moderated.** Staff approve or reject in **Reviews**. Each decision is versioned (a stale decision is refused) and appended to `ProductReviewAudit` with who decided and when. An approved review can later be withdrawn.
6. **Shown.** `GET /api/products/:handle/reviews` returns approved reviews only: the average to one decimal, the count and the newest 12. The product page's "Hear From Them" band and buy-box rating use it; with no approved reviews the band says "No reviews to show yet". The staff-typed rating in Product highlights is no longer used on the product page (product cards still show it).

## Settings

| Variable | Purpose |
| --- | --- |
| `REVIEW_LINK_SECRET` | 32–256 printable characters. Turns reviews on. Changing it invalidates every unused link. |
| `KEERI_DELIVERY_WEBHOOK_SECRET` | Optional, different from the link secret. Turns on the Keeri delivery endpoint. |
| `ENQUIRY_DELIVERY_ENABLED` and the Resend settings | Needed for the invitation emails. Without them deliveries and links are still created, and the admin shows "Email is off". |

## Keeri delivery event

`POST /api/integrations/keeri/order-delivered` (server to server; no browser Origin needed).

```http
Content-Type: application/json
X-Keeri-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" under KEERI_DELIVERY_WEBHOOK_SECRET>

{"event":"order.delivered","externalOrderId":"<Keeri sales order number>","deliveredAt":"2026-11-01T09:30:00.000Z"}
```

- `externalOrderId` is the Keeri order number ShopMaple recorded when Keeri accepted the order.
- The timestamp must be within five minutes of the store's clock. Sign the exact bytes sent.
- `200 {"status":"recorded"}` also for a repeat; `401` bad or stale signature; `404` unknown order (or the secret is not configured); `409` the order is not a paid, confirmed online order; `400` malformed body. Retry `5xx` with backoff.

## Later

- When PR #80 (checkout launch) merges, the invitation can move onto its `OrderNotification` path (`sendTransactionalEmail`). The worker and email body here mirror that design so the move is small.
- Product cards across the store still read the staff-typed rating from Product highlights. Showing approved-review ratings on cards needs the summary in the catalogue card payload.
