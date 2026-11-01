# Checkout recovery, refunds and reconciliation

What staff do when an online order does not complete on its own. Every case below sends a **"Online order needs attention"** email to the staff inbox (`ORDER_MAIL_TO`, falling back to `ENQUIRY_MAIL_TO`) within a few seconds of the order worker noticing it. The email names the checkout id, the Razorpay payment and order ids, the amount, the items and the customer's contact details.

Never refund or re-raise an order from the email alone. Confirm the payment in the Razorpay dashboard first.

## How a normal order flows

1. The buyer submits contact and address details. Keeri prices the goods, GST and the Shiprocket delivery charge and returns a quote valid for a few minutes. A quote whose delivery Shiprocket could not price is refused (`DELIVERY_UNPRICED`) and the buyer is pointed to an enquiry; no flat rate is ever charged.
2. "Pay" asks Keeri to hold the stock for **15 minutes**, then creates the Razorpay order. The Razorpay window closes itself **2 minutes before** the hold lapses (`payBy`).
3. Razorpay confirms the payment two ways: the buyer's browser posts the signed callback, and Razorpay sends the `payment.captured` / `order.paid` webhook. Either one queues a check; the worker then fetches the payment from Razorpay and only a `captured` payment of the exact amount counts.
4. The worker marks the attempt `captured`, empties the buyer's cart and hands the order to Keeri (retried with backoff for about ten minutes, inside the hold). Keeri's reply carries the sales-order reference.
5. The buyer gets "Your Maple Furnishers order SO-… is confirmed"; staff get "New online order SO-…".

## Cases that need staff

| What the email says | Checkout state / code | What happened | What to do |
| --- | --- | --- | --- |
| The customer PAID, but the Keeri stock hold had lapsed | `paid_hold_lapsed` / `PAID_HOLD_LAPSED` | The payment completed after the hold expired (e.g. a slow UPI approval). Razorpay has the money; Keeri has no order. The buyer was emailed "We've received your payment" and told we'll confirm or refund within one business day. | **Fulfil or refund** (below). |
| The customer PAID, but Keeri did not accept the order | `captured`, Keeri outbox `failed` | Keeri was down or refused the order for longer than the retry window. | Check Keeri for the reservation. **Fulfil or refund**. |
| A checkout or payment needs a manual check | `reconciliation_required` with `RELEASE_UNCERTAIN`, `RESERVATION_UNCERTAIN`, `RESERVATION_INVALID`, `PROVIDER_CREATION_UNCERTAIN`, `CATALOGUE_BINDING_CHANGED` … | No payment was taken, but a Keeri hold or a Razorpay order may be left over. | In Keeri, release any hold for the checkout id. In Razorpay, confirm the order has no captured payment. No customer action. |
| Payment event with no matching checkout | payment event `UNKNOWN_PROVIDER_ORDER` | Razorpay reported a payment for an order this store does not know. | Find it in Razorpay. If it is ours and captured, refund it. |
| Second payment for one checkout | payment event `PAYMENT_ID_CONFLICT` | The buyer paid twice for the same Razorpay order. | Keep the first payment (the one recorded on the checkout); **refund the other in full**. |
| Payment not captured | payment event `PAYMENT_NOT_CAPTURED` (or the worker gave up) | An authorised payment was never captured. Razorpay refunds uncaptured payments on its own after its auto-refund window. | Confirm in Razorpay; do not capture by hand unless the order is fulfilled. |
| Payment refunded or unknown | `PAYMENT_REFUNDED_OR_UNKNOWN` | Razorpay already shows a refund on the payment. | Confirm the refund; no further action. |

## Fulfil by hand

1. Razorpay dashboard → Payments → search the payment id from the email. Confirm status **Captured** and the amount.
2. In Keeri, check stock (or production capacity and the lead time for made-to-order pieces) for the items in the email.
3. Raise the sales order in Keeri for the customer, quoting the checkout id and Razorpay payment id in its notes, at the paid amount.
4. Call or email the customer with the Keeri order reference.

## Refund in full

1. Razorpay dashboard → Payments → the payment → **Issue Refund** → full amount → normal speed. Add the checkout id in the notes.
2. Note the refund id (`rfnd_…`). Razorpay emails the customer; banks take 5–7 working days.
3. Email the customer that the refund was issued, with the amount and refund id.
4. In Keeri, release any hold still open for the checkout id.

Partial refunds (one item of several) are handled the same way with the item amount; record which item in the refund notes.

## Daily reconciliation

Once a day, compare Razorpay's captured payments for the previous day with the store's records. The store side is a read-only query the owner runs on the VPS (never from a developer machine):

```sql
-- Paid checkouts by day, with their Keeri order reference.
SELECT a."id", a."state", a."amountPaise", a."paymentId", a."providerOrderId", a."capturedAt", o."externalOrderId", o."state" AS "keeriState"
FROM "CheckoutAttempt" a
LEFT JOIN "OrderOutbox" o ON o."attemptId" = a."id" AND o."kind" = 'keeri.order.captured.v2'
WHERE a."capturedAt" >= now() - interval '1 day'
ORDER BY a."capturedAt";

-- Anything still open for staff.
SELECT "id", "state", "failureCode", "amountPaise", "paymentId", "updatedAt" FROM "CheckoutAttempt"
WHERE "state" IN ('reconciliation_required', 'paid_hold_lapsed');
SELECT "id", "eventType", "paymentId", "providerOrderId", "failureCode", "workerState" FROM "PaymentWebhookInbox"
WHERE "state" = 'reconciliation_required' OR "workerState" = 'failed';
SELECT "subjectId", "kind", "state", "failureCode" FROM "OrderNotification" WHERE "state" = 'failed';
```

Every Razorpay captured payment must match exactly one row in the first query (same payment id and amount) or an item already handled from the cases above. A captured payment with no row is an `UNKNOWN_PROVIDER_ORDER` case. A failed notification means an email (to the buyer or staff) was not sent: check the Resend dashboard and contact the customer directly.

## Known limits

- There is no staff screen for checkouts yet. A resolved `paid_hold_lapsed` checkout keeps telling the buyer "under review" on the status page; staff tell the customer the outcome directly.
- The order-status page works in the browser that placed the order (it uses the guest cart cookie). Emails carry the order reference instead of a status link.
