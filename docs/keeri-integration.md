# Keeri catalogue integration boundary

Implemented on 25 October 2026: a validated **offline export adapter and local read-model importer**. It does not authenticate to Keeri, fetch a live catalogue, reserve stock, create orders, or enable checkout. The API still reports `mode: preview` and `checkoutEnabled: false`.

## Verified source contract

Read-only inspection used `/Users/adityaagrawal/dev/keeri` at commit `8d87561195f551c5b6e041219c4d5e32c2281daa`. No Keeri database was accessed or changed.

| Keeri source | Confirmed behavior |
| --- | --- |
| `packages/db/prisma/schema.prisma`, `ProductModel` | Stable `id`, `tenantId`, `name`, `productType`, nullable `description`, `status`, `deletedAt`, `updatedAt`; model owns variants and media. There is no native storefront handle or Shop Maple category enum. |
| `ProductVariant` | Stable `id`, `modelId`, `tenantId`, current unique-per-tenant `sku`, nullable `variantName`, `status`, separate `published`, `deletedAt`, `stockPolicy`, `updatedAt`. Legacy `oldSku` is not unique and is not used for identity. |
| `PriceTier` | `amount` is already integer paise; `currency` defaults to INR; `kind: mrp` supplies the public price. No rupee conversion, dealer discount, cost disclosure or stock inference. |
| `MediaAsset` | `id`, `tenantId`, nullable `modelId`/`variantId`, `stage`, `storageKey`, `supersededAt`, `position`. Only approved, stored, current media is eligible. |
| `apps/admin/src/products/shopify-publish-plan.ts`, `productStatus` | An active product requires model status published and each variant status published plus `published: true`. Shop Maple applies these checks per included variant. |
| `apps/admin/src/catalogue/catalogue-query.ts`, `LIVE_MEDIA` | Outward media reads require `stage: approved`, `supersededAt: null`, and non-null storage key. |
| `apps/admin/app/api/products/route.ts` | GET is an admin catalogue read guarded by `gateProducts("read")`; its projection lacks complete variant identities and media. It is not the export contract implemented here. |
| `apps/admin/src/products/guard.ts`, `apps/admin/src/auth/session.ts` | Authentication uses the current signed session cookie, refreshed active user/tenant state, and the `catalog` module permission. No unattended service credential/read endpoint was verified. |

## Export format

`apps/api/src/keeri.ts` defines the strict version 1 export schema. `apps/api/test/fixtures/keeri.ts` is a synthetic complete example with real field names, not merchant data. The envelope and publication manifest are **new Shop Maple integration metadata**, not claimed existing Keeri API fields.

The envelope contains:

- `schemaVersion: 1`, `source: "keeri-export"`, `complete: true`, `tenantId`, `capturedAt` (ISO datetime).
- `models`: the source field projection below, captured as one consistent full tenant snapshot. Do not concatenate pages captured at different times or label a filtered page complete.
- `publication`: an explicitly reviewed list of `{ modelId, handle, category }`. Categories are `sofas`, `chairs`, `tables`, `beds`, `storage`, `outdoors`. This avoids guessing Keeri's open product-type taxonomy or changing URLs when names change. A manifest entry alone cannot publish a draft source record.
- `publicMedia`: reviewed `{ assetId, url }` mappings to publicly accessible HTTPS images. Keeri storage keys and private admin image routes are never turned into public URLs automatically. Only media owned by the included model/published variants can be used.

An authorized export producer can select the following actual Prisma fields in Keeri. This is a specification for that producer, not a command this repository runs against Keeri:

```ts
const mediaSelect = {
  id: true, tenantId: true, modelId: true, variantId: true,
  stage: true, storageKey: true, supersededAt: true, position: true,
};
const modelSelect = {
  id: true, tenantId: true, name: true, productType: true,
  description: true, status: true, deletedAt: true, updatedAt: true,
  media: { select: mediaSelect },
  variants: { select: {
    id: true, tenantId: true, modelId: true, sku: true,
    variantName: true, status: true, published: true, deletedAt: true,
    stockPolicy: true, updatedAt: true,
    prices: {
      where: { kind: "mrp" },
      select: { kind: true, amount: true, currency: true, updatedAt: true },
    },
    media: { select: mediaSelect },
  } },
};
// Authorized producer: tenant-scoped consistent read, JSON-serialize Dates,
// then attach the reviewed publication/publicMedia manifests and capture time.
// Never export customers, orders, users, credentials, cost/dealer prices or raw URLs.
```

The producer must match each row's tenant and ownership; the adapter rejects cross-tenant rows, conflicting duplicate media, duplicate models/variants/SKUs/handles, invalid money/currency and source timestamps newer than the capture. Unexpected fields are rejected rather than silently exported. Source `deletedAt` and publication status are enforced again on consumption. Missing MRP, non-positive MRP, absent approved public media, or missing publication mapping omit the product/variant from the public result. Empty complete snapshots are valid and retire all records for that tenant source.

## Local commands

Use Node 22+. Dry run validates and summarizes without creating a database client or making a network request:

```sh
npx tsx scripts/import-keeri.ts /private/path/keeri-export.json EXPECTED_TENANT_ID
```

Apply requires `--apply`, refuses production, and accepts only `localhost`, `127.0.0.1` or `::1` with database name `shopmaple` or `shopmaple_test`. Use the Shop Maple database URL, never a Keeri database URL:

```sh
npm run db:generate
npm run db:migrate
npx tsx --env-file=.env scripts/import-keeri.ts /private/path/keeri-export.json EXPECTED_TENANT_ID --apply
```

The printed result includes source, capture time, imported and omitted model counts, dry-run status and disabled checkout. Keep actual exports and private media manifests outside this public repository. The synthetic test fixture is safe to commit.

## Synchronization semantics

- Source is `keeri:<tenantId>`. Stable read-model IDs are `keeri:<tenantId>:<sourceId>` (the colon separator is forbidden inside source IDs, so tenant/ID boundaries cannot collide); the source SKU is retained unchanged. Handles/categories are explicit manifest values.
- Every variant is imported with `available: false` regardless of source stock policy. The original `stockPolicy` remains available for enquiry UI. Checkout needs a verified reservation/allocation contract before anything becomes purchasable.
- The entire snapshot applies in one PostgreSQL transaction. A transaction-scoped advisory lock serializes a tenant's imports. `CatalogueSyncState` stores capture time and SHA-256 of the validated export, including empty snapshots.
- Older snapshots fail. An identical validated payload at the same capture time is an idempotent no-op; a different payload at the same time fails. Array ordering remains significant for this fingerprint; producers should emit deterministic order. Correct an export with a new capture timestamp.
- Only the matching tenant source is updated/retired. Existing product/variant ownership and globally unique handles cannot be taken over; a collision rolls back everything, including the cursor. Existing preview products are untouched, so a later catalogue cutover requires an explicit handle/source migration.
- Omitted products become unpublished. Omitted variants become unpublished and unavailable, but remain stored so old cart references are valid. Both product-list and product-detail reads exclude retired variants; old carts allow their removal.
- The read model uses snapshot capture time as `sourceUpdatedAt`, because price/media publication can change independently of `ProductModel.updatedAt`.

## Remaining live integration work

This local snapshot format is not an authenticated transport. A verified Keeri export/read endpoint, dedicated read credential, consistent snapshot/pagination semantics, deployed schema verification, freshness monitoring and media hosting are still needed. The approved media domain must also be configured in the frontend image allowlist before those images render there. Product/variant-specific specifications, variant image selection and migration of existing Shopify handles remain separate work.

No real tenant export or live public media URLs were supplied in this slice. Tests use synthetic schema-shaped fixtures and the dedicated local PostgreSQL test database; they establish transformation, publication, transaction, replay, concurrency and guard behavior, not production sync. Reservation, payment/order persistence and durable Keeri order handoff remain release blockers.
