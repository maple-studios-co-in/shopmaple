# Store catalogue: Keeri is the only product source

**Owner decision, 11 November 2026.** The store sells and shows only what Keeri publishes to it. No product data or
photos come from Shopify any more: the pinned Shopify export is no longer read, and the products that existed only in
it have left the store for now (they will be dealt with later). The store is an enquiry catalogue while checkout
remains disabled.

## Source and publication

Keeri V2 is `GET /api/storefront/catalogue/v2`, authenticated with a tenant-bound `catalogue:read` service credential.
The consumer validates the complete schema, tenant and asset ownership before any write. V2 uses `channelPublished`
independently of global source status; explicit channel exclusions are omitted by the producer. Missing price,
category, media or variants remain explicit unknowns. Missing/zero placeholder prices become `null`, and such
variants cannot enter a purchasing cart. V1 remains available with its original stricter publication gates.

Since 27 October 2026 each V2 variant also carries `shipping` (packed carton measurements for one unit, or `null`),
`fulfilment` (`stocked` or `made_to_order` with a lead time, or `null` for dropship and unverified policies) and
`eligibility` (`{sellable, reasons}`, Keeri's own verdict on whether the variant can be quoted and held today). The
consumer validates their shape and accepts an export with or without them, so either side can be released first.

Public photos must be approved/current and explicitly mapped by Keeri, then be a Keeri photo on the store's own
address: `https://<SITE_URL or a SITE_ALIASES host>/media/keeri/<id>.webp` (`apps/api/src/catalogue-images.ts`). No
other host, Shopify's included, is a product photo. No private storage key/admin route is published or fetched
automatically. Products without a public photo use the storefront fallback.

## Identity: the former Shopify listings

Before 11 November the store merged each Keeri product into a matching Shopify listing (the "union"). Those merges
were recorded in the source-binding tables (`ProductSourceIdentity`, `VariantSourceIdentity`). The sync keeps using
them, so a Keeri product that was merged keeps that listing's store identity:

- its product id (`preview-<n>`), its address (handle) and every `ProductHandleAlias` pointing at it, so old links and
  wishlists keep working;
- the variant ids its Keeri variants were bound to, so carts keep pointing at them, and each variant's `?variant=` value.

Everything a customer reads comes from Keeri: title, description, Keeri's copy (`sourceDetails`; the Shopify copy
blocks in `pdpContent` are cleared), photos (Keeri's only; the Shopify gallery is dropped), category, variant titles
and prices. A Shopify variant of such a listing that Keeri does not have is unpublished. Persisted bindings cannot
silently move: a binding that would give two Keeri products one store product, or move a variant to another product,
fails the sync (`EXISTING_IDENTITY_CONFLICT`, `VARIANT_REPARENT_FORBIDDEN`).

A fresh database has no bindings, so there every Keeri product takes its own Keeri id and address.

## What the sync does with products Keeri does not publish

The complete import runs in one transaction with an advisory lock, a timestamp/hash watermark (`union:<tenant>` in
`CatalogueSyncState`: an older capture is refused, the same capture is replayed without writing) and collision checks.
A failed import leaves catalogue and watermark unchanged. Every store product Keeri no longer publishes, including
every former Shopify-only listing (source `shopify-preview`), is **unpublished with its variants**, never deleted:

- the row, its handle and its aliases stay, so no Keeri product can take that address;
- cart lines keep a valid reference; the cart shows them as no longer available (without the old photo) and checkout
  refuses them;
- historical orders and checkout snapshots are untouched.

The report counts `keeriProducts`, `formerShopifyListings` (merged listings now on Keeri's copy), `retiredProducts`
(products unpublished by this run), `keeriPricedVariants`, `totalProducts` and `totalVariants`.

The web store sends a retired product's old address, `/products/<handle>`, to its kind's collection, or to
`/collections/all`, with a temporary redirect (307), from the list in `apps/web/data/retired-products.json`.
Curated lists (homepage bestsellers, compare, category rails, Nimbus series, mega menu) name Keeri products; a list
saved in published content that still names a retired product shows its Keeri replacement from the same file, or
leaves it out.

### First sync after this release

On the server's first apply after release, against today's production data:

1. The 32 merged listings keep their ids, handles, aliases and bound variant ids, and switch to Keeri's title,
   description, copy, photos and prices. Any Shopify-only variant of theirs is unpublished.
2. The 154 Shopify-only listings, and their variants, are unpublished (`retiredProducts` reports them). Their rows stay.
3. Keeri-only products are unchanged in identity; they are re-read as on every sync.
4. Carts holding a retired product, or a retired variant, keep the line; it shows as unavailable and cannot be bought.

Run the dry run first and check `keeriProducts` (385 today) and `totalProducts`. The dry run does not read the
database, so it reports what Keeri publishes, not how many rows will retire.

## Deployment command

Server-private environment (never commit or print values):

- `KEERI_ORIGIN=https://maplefurnishers.keeri.in`
- `KEERI_CATALOGUE_TOKEN` (catalogue read scope only)
- `KEERI_TENANT_ID`
- `DATABASE_URL` (isolated ShopMaple database)
- `APPROVE_STORE_CATALOGUE=publish-all-current-enquiry-only`

`SHOPIFY_CATALOGUE_FILE` is no longer read; a `store.env` that still sets it syncs exactly as one that does not, and
it can be removed at leisure.

From the immutable release:

```sh
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/sync-store-catalogue.ts
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/sync-store-catalogue.ts --apply
```

Default is read-only. Apply accepts only loopback database `shopmaple_store` on 55440 (or dedicated tests on 55439).
Keeri capture must be no older than 15 minutes or over one minute in the future. HTTPS transport rejects redirects,
oversized payloads, bad content types and untrusted origin changes. An entirely empty Keeri snapshot requires the
explicit one-run `--allow-empty-keeri` flag; otherwise the previous catalogue is retained and the job fails.

The five-minute cron invokes the current release under `flock -n /home/deploy/shopmaple/shared/catalogue-sync.lock`.
Log aggregate JSON only (counts, capture timestamp and dry-run state), rotate logs, and preserve nonzero failures.

## Release and rollback

Back up and checksum the isolated database before the first apply. The sync makes no schema change. Rolling the code
back after a Keeri-only apply leaves the former Shopify-only listings unpublished and the merged listings on Keeri's
copy until a sync with the older code (and its Shopify export) runs again; prefer rolling forward. Restoring the
pre-apply backup returns the exact previous catalogue.

The legacy `deploy/sync-keeri-catalogue.ts` remains a V1-only incremental tool. Do not schedule it alongside the
catalogue runner.

### Prices

The store shows Keeri's `store_price` and never its raw `mrp`, which is before GST (owner, 1 and 7 November 2026).
Keeri works out `store_price` as the MRP plus the model's GST rate, or a recorded `mrp_gst`, and its GST-included
quote charges that same figure, so the price shown is the price charged; a quote in any other GST mode is refused as
`PRICE_CHANGED`. Keeri's `compare_at` row is the struck-through price when it is above the store price. A variant
without a Keeri store price shows no price (price on request) and is never purchasable; Shopify's prices are no longer
used, including on the former merged listings.

## Variant photos, options and readable addresses (31 October 2026)

- The live sync asks Keeri for `?taxonomy=1&content=1&attributes=1`. Each variant then carries its named options (`attributes`: axis and value, in sheet order). Keeri leaves out axes marked N/A or left blank, and the store drops any blank value it still receives. Ship Keeri first. If the store ships first, Keeri answers `400`, and the sync asks again without attributes (`ATTRIBUTES_UNSUPPORTED`), so the catalogue keeps syncing without variant options until Keeri ships.
- The level `?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1` (Keeri #826) adds `offer` to every model: `{ label, code, startsAt, endsAt }` for the switched-on offer running now, or else the one starting soonest, or `null`; Keeri never sends one that has ended. A product takes its Keeri model's offer, stored in `Product.offer` and served on `/api/products/:handle`; the product page counts down to it while it runs. Ship Keeri first: an older Keeri answers `400`, and the sync steps down a level (`OFFERS_UNSUPPORTED`, then `PRODUCT_PAGE_UNSUPPORTED`, then `ATTRIBUTES_UNSUPPORTED`), so offers stay empty until Keeri ships.
- A variant is titled by its Keeri variant name, otherwise its option values ("Ivory Boucle / Dark Walnut", at most 300 characters), otherwise its SKU. The options themselves are not stored yet. Option pickers will add them in a schema that does not ship in every page's script.
- Each variant keeps its own photos (`Variant.images`). They must use approved hosts, as product photos do; a former Shopify listing filters unapproved hosts out instead of failing. `Product.images` still holds every photo, so product cards are unchanged. `/api/products` lists leave variant photos and slugs out; the product detail response carries them. The product page shows the selected variant's photos and then the photos no variant claims. Each option in the picker shows its variant's first photo.
- Product addresses are readable. A Keeri product still on exactly `keeri-<model id>` is renamed once:
  - to its name, then its name and type, then a number;
  - a name with no letters becomes its type plus its Keeri id;
  - the new address avoids every address in the run, every stored product (published or not) and every earlier alias.

  The old address is kept in `ProductHandleAlias`. `/api/products/<old>` and `/api/catalogue/cards/<old>` answer `308` to the current address. The batch `/api/catalogue/cards?handles=` resolves old addresses and reports them in `moved`, so homepage merchandising picks keep showing. `moved` sits outside the shared contract and only the server reads it, which keeps it out of every page's script. The wishlist re-saves a renamed product under its new address. Reviewed and already readable addresses never change.
- Each variant has a readable `?variant=` value (`Variant.slug`, unique within its product). A variant keeps its slug when its title changes, and a new variant never reuses one. The product page reads a slug, or an older id, and writes the slug. Old ids move to the slug permanently (`lib/product-address.ts`).
- Migration `20261031010000_variant_media_addresses` only adds two columns with constant defaults and a new table. It is safe on a live table, and older releases ignore it.
- **Rollback caveat:** the rename is a data change. The previous release has no alias routes, so after a rollback the old `keeri-<id>` addresses return 404 while the readable ones keep working. Roll the code forward rather than back, or accept the broken old links until it is redeployed.
- Known gap: the search dialog's "recently viewed" list drops a renamed product until it is viewed again.
- The homepage script budget (`scripts/check-homepage-payload.mjs`, 79,500 gzip bytes) is nearly used up: main is at 79,473 and this change at 79,496.

## Free delivery badge (13 November 2026)

Keeri staff can tick a ShopMaple variant free delivery, and Keeri's quote then charges no courier rate for it (see [checkout HTTP](checkout-http.md#free-delivery)). This tells the shopper before checkout.

- The richest level the sync asks for is now `?taxonomy=1&content=1&attributes=1&compareAt=1&productPage=1&offers=1&freeDelivery=1`. It adds `freeDelivery: boolean` to every variant: `true` only where the variant's ShopMaple row is selected and ticked, which is exactly what Keeri's quote reads. Keeri's shared fixture is `docs/contracts/shopmaple-catalogue-v2-free-delivery.json` (the same file in the Keeri repository).
- The sync stores it in `Variant.freeDelivery` (migration `20261113210000_variant_free_delivery`: one column with a constant default, safe on a live table, ignored by older releases). Every sync states it, so an untick in Keeri, or a sync from a level without the field, clears it. `/api/products` and `/api/products/:handle` carry it per variant.
- **Product page.** For the chosen finish, when it is ticked and can be bought (`canOrder`: available, priced, stocked or made to order), the page says "Free delivery": a chip beside the price, the buy box's promise strip, the ticker and the first promise card, and the shipping note and the shipping FAQ answer change to match. Another finish of the same product keeps the usual wording. A ticked finish that cannot be bought says nothing, because checkout would never apply it.
- **Cards.** A card (`freeDelivery: true` on the card contract, absent otherwise) says "Free delivery" only when the product has at least one buyable variant and every buyable variant is ticked. A product where only some finishes ship free shows no badge on its card; the product page still says it for those finishes.
- **Wording.** Keeri still asks the courier about the buyer's address before it waives the charge, and a place the courier cannot reach is not delivered free. So the store says "Free delivery" and "confirmed for your address at checkout", and never names a pincode, a city or "anywhere".
- **Release order.** Ship the store first. Only this store release asks Keeri for the level, so an older store never sees the field. If this store release is live before the Keeri release, Keeri answers `400`, the sync steps down to the offers level (`FREE_DELIVERY_UNSUPPORTED`), and no badge shows until Keeri ships; nothing else changes. The badge appears after the first sync once both are live and a variant is ticked.
- Rollback: an older store release ignores the column and asks Keeri for the offers level again.

## Order progress back from Keeri

The catalogue and orders flow from the store's requests. One flow runs the other way: Keeri posts signed order updates (status, delivery, cancellation, refund) to `POST /api/integrations/keeri/order-events`, and the buyer's order pages read them. See [order flow](order-flow.md#order-progress-from-keeri-13-nov-2026) and [deployment](store-deployment.md#order-progress-from-keeri).
