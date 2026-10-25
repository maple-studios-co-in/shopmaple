# Shopify product disclosure copy

The Shopify theme renders the Details, Materials + Care and Shipping + Returns accordions from `custom.description`, `custom.materials_care` and `custom.shipping_returns`. These are separate from the standard product description. Preserve the standard field unchanged; an empty standard description must not erase the rendered source Details.

## Capture and identity

Use the connected, verified Maple Shopify Admin read integration with the [read query](shopify-product-copy.graphql). Validate the operation against the configured Admin schema before execution. Follow `pageInfo.endCursor` until `hasNextPage` is false. Read only these three customer-facing metafields and product IDs. Do not create or modify definitions or values as part of the migration.

Append the capture to the pinned Shopify catalogue snapshot as `pdpMetafields`:

- `source: "shopify-admin-metafields"`, `complete: true`, and a separate actual `capturedAt` timestamp.
- `products`: exactly one record per product ID in that pinned snapshot, each with `id`, `details`, `materialsCare`, and `shippingReturns`.
- Each metafield is either null (source empty) or `{type: "rich_text_field", jsonValue: <native tree>}`.

All three fields must be present. Do not guess by title, handle or colour. A broader raw capture may contain archived products excluded from the pinned catalogue; retain that original capture for provenance, verify their status, and select the exact pinned ID set for the sidecar. The importer rejects duplicate, missing and foreign IDs, incomplete fields, malformed values and capture times older than the catalogue or in the future. Keep the existing catalogue timestamp/public-price evidence unchanged when only these metafields were recaptured.

The normalized `pdpContent` carries the exact source product GID and capture time into persistent storage. Shopify copy remains authoritative for already verified Shopify/Keeri matches. Keeri-only products acquire no Shopify copy. Null source sections remain empty; an absent legacy sidecar clears prior PDP copy rather than silently retaining stale content. Refreshes must therefore continue using the enriched pinned file after activation.

## Rendering and safety

Native rich text is validated with strict node/field types, depth, node count and size limits. React renders paragraphs, headings, lists, emphasis and links as elements; no raw HTML is injected. Unsafe URL schemes, protocol-relative URLs, credentials and malformed nodes are rejected. Owned Shopify storefront links are rewritten to local destinations. Text that resembles HTML is escaped. Source null sections do not get invented descriptions or operational promises. Products without a captured object retain the existing fallback behavior.

The copy preserves Shopify's published wording, including shipping/returns claims. That does not verify serviceability, fulfilment capability or transaction readiness. Checkout remains disabled until the separate commerce gates pass.

## Capture evidence, 26 October 2026 IST

The read-only connector was verified as Maple at `shop.maplefurnishers.com`. Four complete pages returned 188 unique product IDs and 222 rich-text values: 188 Details, 4 Materials + Care, 30 Shipping + Returns. Two IDs absent from the pinned 186-product catalogue were independently verified ARCHIVED (Oryon dining table set and fluted bar counter set). The exact 186-product sidecar validates: 186 Details, 4 Materials + Care, 30 Shipping + Returns. All three reference products (Aero, Aera, Avelon) match their known product IDs.

Raw and enriched snapshots remain outside Git under the private release evidence directory. No Shopify data was changed. The `Product.pdpContent` migration is additive and nullable; deployment requires the standard database backup/restore and release checks. A passing local import or merged PR does not establish deployment.
