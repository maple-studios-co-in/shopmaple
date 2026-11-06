# Writing a review on the product page

"Write a review" on the product page opens "Make yourself heard." (Figma 180:566 desktop, 180:603 phone). Without script, the link still leads to the contact page.

## The path of a review

1. The browser checks the form (rating, title up to 120 characters, review up to 2,000, name up to 60, email, and up to 5 JPG or PNG photos of up to 10 MB each). It makes each photo small, so five of them fit through the site's proxy, which holds 10 MB per request.
2. `POST /api/reviews` on the store API (`apps/api/src/reviews.ts`) checks the Origin and the hourly limit (10 per connection) before reading the body, validates it against `reviewSubmissionSchema` (`@shopmaple/contracts/reviews`, kept out of the homepage's first JavaScript), and re-makes each photo as upright WebP with its metadata (location, camera) removed.
3. The API looks up the piece's Keeri model through `ProductSourceIdentity` and sends the review to `POST {KEERI_ORIGIN}/api/storefront/reviews`, with a bearer credential and the form's `Idempotency-Key`, so a retried form cannot make a second review.
4. Keeri moderates. An approved review reaches the product page through the usual catalogue sync, so the thank-you says the review will appear once approved.

Customer words and emails are never logged: only Keeri's status code or the kind of error.

## When Keeri cannot take it

The customer has written it, so it is not lost. It is kept as an enquiry of kind `review` in Admin → Enquiries (filter "Review"), and staff get the usual alert if alerts are configured. This happens when:

- `KEERI_REVIEWS_TOKEN` is not set on the server;
- the piece has no Keeri model (a Shopify-only listing);
- Keeri refuses the review or is unavailable.

The customer sees the same thank-you. Photos cannot be kept in the inbox, so the enquiry says how many were sent.

## Turning it on

Set `KEERI_REVIEWS_TOKEN` privately on the server beside `KEERI_ORIGIN` and restart the API: a Keeri service credential allowed to write reviews, 32 to 256 URL-safe characters. Nothing else changes.

## To confirm with Keeri

Keeri's request format is in its private repository (`docs/shopmaple-product-page.md`), which this repository cannot read. The request below mirrors Keeri's own review schema as the catalogue export shows it, and is built in one place, in `registerReviewRoutes`. Until Keeri has accepted a real review from this code, treat it as unverified.

```json
{
  "modelId": "<Keeri model id>",
  "variantId": "<Keeri variant id, or null>",
  "rating": 5,
  "title": "…",
  "body": "…",
  "reviewerName": "…",
  "reviewerEmail": "…",
  "city": null,
  "reviewedAt": "2026-11-06",
  "source": "other",
  "photos": [{ "contentType": "image/webp", "data": "<base64>", "width": 1600, "height": 1200 }]
}
```

Open questions:

- **Order lines.** An earlier note says Keeri accepts a review only for a real order line. This form has no order, and checkout is off. If that rule still holds, Keeri will refuse every review and they will all land in the inbox.
- **Photos.** Whether Keeri takes them inline as above, and how many. Keeri's export allowed 4 photos on a review; the store now reads up to 5, so a 5-photo review cannot fail the catalogue sync.
- **Source.** Keeri's sources are `online_order`, `showroom`, `whatsapp`, `google` and `other`. The form sends `other`.
- **Listings without a Keeri model.** These stay in the inbox unless Keeri can take a review by another identity.
