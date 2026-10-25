# ShopMaple purchase to Keeri sales order

## Intent and approved behavior

A verified website payment creates one confirmed, fulfilment-ready Keeri sales order. The user explicitly selected invoices later through the existing billing workflow and India-only delivery with approved rates. New behavior follows TDD and security review. No third staff dashboard is introduced.

Subsequent decision: ShopMaple is an independent Keeri sales channel alongside Shopify; Shopify remains available and product distribution can be decided later. Per-channel selection must not change another channel's publication or global source status. Keep channel/source attribution on commerce records. Current Shopify stock sync is a remote quantity copy, so live overlapping limited-stock checkout requires an explicit safe allocation or verified cross-channel reconciliation; sharing a product source alone does not prevent overselling.

Keeri's Maple workspace owns product identity/pricing, inventory, customers, sales orders, captured advances, invoices and fulfilment. The existing Maple website admin remains responsible for website-specific presentation and 3D content; its current product CRUD overlap is a separate consolidation task. ShopMaple owns guest shopping, local catalogue read models, payment inbox/outbox and checkout state. Website-order operations surface within Keeri.

## Approach

Extend the existing custom ShopMaple API and Keeri service endpoints. Preserve the two databases and use authenticated versioned HTTP contracts with durable retries. Reusing the existing Keeri order/stock domain avoids a competing shop admin. A separate ecommerce admin would duplicate authority; immediate automatic invoicing contradicts the user's selected workflow.

Keeri is the authority for the final commerce quote: current approved product data, GST and explicitly configured delivery policy produce a bounded immutable v2 snapshot. ShopMaple validates and freezes that response before requesting payment. Quote requests include only product identities/quantities and validated customer/delivery input, never client-supplied money. No network requests run inside a ShopMaple database transaction. Changed cart or checkout input must not silently reuse an old quote/idempotency key.

## Contracts and invariants

- Version 1 snapshots/receipts retain legacy review-only meaning; never reinterpret them as complete orders.
- Version 2 freezes customer contact, billing and shipping addresses, India state/pincode, delivery selection, approved policy version, tax semantics, item identities/quantities/HSN/tax rate, exact integer-paise totals and expiry. The implementation contract will be recorded with identical fixtures in both repositories before parallel consumers are written.
- India/INR, stocked items and bounded quantities only initially. Tax and shipping policy must be explicit, reviewed and reproducible by Keeri's existing commercial engine. Unsupported/missing configurations refuse checkout. No guessed zero charges, tax exemptions or delivery promises.
- Quotations are bound to the authenticated tenant/merchant, exact normalized request and expiry. Reservation validates the server-issued quote before holding inventory. Caller-supplied actor, tenant, prices or verified-payment status never grant authority.
- All remote requests use fixed allowlisted HTTPS origins, scoped bearer credentials, redirect refusal, bounded response sizes/deadlines and sanitized errors. Loopback HTTP may be explicitly allowed only for test/local development.
- Captured delivery atomically creates one guest Client, confirmed SalesOrder and captured advance; binds intake to actual order; transfers the exact reserved quantities with no release/re-reserve gap or second increment. Replays return the original actual order ID. Guest contact details never overwrite/merge unrelated clients.
- Invoices remain staff-issued. Invoice creation atomically allocates the already captured advance to the invoice once; it must never charge the gateway again or produce duplicate Payment records.
- Freeze party addresses for order/invoice/challan display rather than reading a later mutable Client address.
- Prevent edits/cancellation/void flows that would misrepresent or strand captured money. Unsupported refund/late capture/ambiguous provider results enter explicit reconciliation, without pretending a refund occurred or recreating stock.
- Payment callbacks are advisory. The server verifies signed events and provider capture before marking paid. Customer status distinguishes payment pending, captured awaiting Keeri, accepted order and review required.
- Keep existing preview server working. Opt-in configured commerce composition only; no fake provider or test gateway in a publicly enabled production checkout.

## Staff and customer surfaces

Keeri: source and advance-payment visibility on normal orders; bounded permission-checked website order/receipt reconciliation list. Financial references respect Payments permission; order views respect Orders permission. A tenant-owned configured actor supplies accountability for service-created documents.

Shop: India checkout address form, server quote review, hosted gateway interaction and owned status page. Never expose secret keys, raw payloads or internal reservation/error details. Treat local-storage and URL values as untrusted.

## Verification and release limits

Use synthetic fixtures in isolated local databases. Cover concurrent replay, cart/input changes, cross-tenant access, exact totals, stock transfer/dispatch, invoice allocation, immutable addresses, unavailable delivery regions, expired quotes/holds, transport timeouts, forged webhooks, invalid acknowledgements and permissions. Run combined suites, types/builds, dependency/secret/static checks and a final security review.

Live merchant setup, service credentials, reviewed publication/commerce policy, delivery rate approval and an end-to-end gateway sandbox purchase remain activation gates. This work does not authorize a real charge, publication/cutover, or fabricated financial data. No deployment of this next increment is implied by the prior completed release.

## Current Shopify evidence (read-only, 26 October 2026)

Store: shop.maplefurnishers.com, INR. taxesIncluded=false and taxShipping=false. Accessible order history identifies Razorpay but is historical, not current merchant configuration proof. Domestic Standard delivery currently shows INR 1,000 with a weight condition; this is evidence to review, not automatic approval of a universal flat rate. First release explicitly excludes international checkout per user decision.
