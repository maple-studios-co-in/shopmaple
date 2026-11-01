# Store catalogue union and Keeri synchronization

The new store is an enquiry catalogue while checkout remains disabled. The merchant explicitly selected every current Shopify and nondeleted Keeri product, including source drafts, with ShopMaple inclusion enabled by default. This does not change Shopify publication, Keeri's global publication flags, stock, or payment settings.

## Sources and publication

The full Shopify Admin projection contains only product-facing fields: stable IDs, names, descriptions, handles, product type, source status, public image URLs, variants/SKUs, and prices. The captured complete snapshot has 186 products (176 active, 10 draft), 284 variants, no truncated variant pages. Archived products are excluded. Store the snapshot outside Git under the deployment shared directory. This is a **pinned snapshot**, not an ongoing Shopify subscription: later Shopify changes require a newly captured complete snapshot and a sync run. Reports expose its capture timestamp separately from live Keeri freshness.

Keeri V2 is `GET /api/storefront/catalogue/v2`, authenticated with a tenant-bound `catalogue:read` service credential. The consumer validates the complete schema, tenant and asset ownership before any write. V2 uses `channelPublished` independently of global source status; explicit channel exclusions are omitted by the producer. Missing price, category, media or variants remain explicit unknowns. All imported stock is unconfirmed (`available: false`); missing/zero placeholder prices become `null`, and such variants cannot enter a purchasing cart. V1 remains available with its original stricter publication gates.

Since 27 October 2026 each V2 variant also carries `shipping` (packed carton measurements for one unit, or `null`), `fulfilment` (`stocked` or `made_to_order` with a lead time, or `null` for dropship and unverified policies) and `eligibility` (`{sellable, reasons}`, Keeri's own verdict on whether the variant can be quoted and held today). The consumer validates their shape and accepts an export with or without them, so either side can be released first. The store records nothing from them yet: purchase availability is still decided by Keeri at quote and reservation time, and delivery pricing by the quote policy.

Public images must be approved/current and explicitly mapped by Keeri, then match the storefront image allowlist: `cdn.shopify.com/s/files/` or `shop.maplefurnishers.com/cdn/shop/`. No private storage key/admin route is published or fetched automatically. Products without a public image use the storefront fallback.

## Identity and precedence

The union matches stable Shopify IDs or exact current SKUs only. A SKU must be unique on both sides. Titles and legacy SKUs are never identity evidence. Conflicting model/variant evidence or multiple Keeri models claiming one Shopify model remain separate enquiry listings and appear in the aggregate ambiguity count.

Existing Shopify `preview-*` IDs, public handles, variant IDs and cart references survive exact merges. Persisted source-binding tables prevent two identities from the same source claiming one storefront row; previously established bindings cannot silently move. Partial matches preserve unmatched Shopify variants. For an exactly mapped product, the current Shopify snapshot owns the display title, description and image list, including empty descriptions and image lists; an exactly mapped variant retains its Shopify display title. Keeri-only products and unmatched variants retain their own display copy. Keeri remains the operational authority for matched variants' SKU and stock policy, while known buyer prices come only from the verified Shopify public-price evidence described below. Category still prefers the current Keeri category when present. Truly unknown prices stay null, and all variants remain unavailable to purchase. Source status is retained as provenance and does not imply purchasability.

Repeated option names do not establish identity. For example, unmatched Shopify and Keeri variants with the same display name remain separate until authoritative stable IDs or unique exact SKUs establish a match; no prices or photos are copied between them by name. Adding a new mapping that conflicts with a persisted binding requires a separately reviewed reconciliation, not a weakened importer guard. A display-policy change reaches persisted rows on a normal fresh snapshot sync; replaying an identical capture does not rewrite rows.

The complete import runs in one transaction with an advisory lock, timestamp/hash replay guard, collision checks and a durable sync cursor. Failed imports leave catalogue and cursor unchanged. Omitted Keeri-only rows retire; products still independently present in Shopify remain. Historical checkout snapshots are untouched. No stock or source database mutations occur.

## Deployment command

Server-private environment (never commit or print values):

- `KEERI_ORIGIN=https://maplefurnishers.keeri.in`
- `KEERI_CATALOGUE_TOKEN` (catalogue read scope only)
- `KEERI_TENANT_ID`
- `SHOPIFY_CATALOGUE_FILE=/home/deploy/shopmaple/shared/shopify-full-export.json`
- `DATABASE_URL` (isolated ShopMaple database)
- `APPROVE_STORE_CATALOGUE=publish-all-current-enquiry-only`

From the immutable release:

```sh
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/sync-store-catalogue.ts
node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/sync-store-catalogue.ts --apply
```

Default is read-only. Apply accepts only loopback database `shopmaple_store` on 55440 (or dedicated tests on 55439). Keeri capture must be no older than 15 minutes or over one minute in the future. HTTPS transport rejects redirects, oversized payloads, bad content types and untrusted origin changes. An entirely empty Keeri snapshot requires the explicit one-run `--allow-empty-keeri` flag; otherwise the previous catalogue is retained and the job fails. Individual Keeri-only exclusions need no flag. Initial publication has no exclusion rows. Current V2 omits exclusions, so a product independently present in the Shopify snapshot remains listed; a follow-up explicit exclusion identity contract is required for a Keeri channel opt-out to suppress an exact-matched Shopify contribution. Shopify itself remains unchanged.

After a reviewed first import, install a five-minute cron invoking the current release under `flock -n /home/deploy/shopmaple/shared/catalogue-sync.lock`. Log aggregate JSON only (counts, ambiguity, each source capture timestamp and dry-run state), rotate logs, and preserve nonzero failures. Credential expiry and repeated failures require operator attention; there is not yet a staff dashboard displaying the consumer's sync freshness. Keeri channel inclusion controls are the ongoing staff selection surface.

## Release and rollback

Back up and checksum the isolated database before migrations/import. Restore-test that backup into a separate scratch database. Apply the additive identity/source-status and nullable category/price migrations, start the reviewed nullable-aware runtime, dry-run the real sources, then atomically import and verify counts and representative public pages. Keep checkout disabled.

**After nullable catalogue rows are imported, switching the symlink to the older runtime alone is unsafe:** that version rejects null prices/categories and empty variants/images. Rollback must either retain the new compatible runtime or stop the scheduled sync, restore the exact pre-import database backup, then activate the previous release. Rehearse the database restore before activation and retain both release directories. Do not delete releases or reset Keeri/Shopify data.

The legacy `deploy/sync-keeri-catalogue.ts` remains a V1-only incremental tool. Do not schedule it alongside the union runner.

### Buyer-facing price evidence

Shopify Admin `variant.price` is not necessarily the price an Indian buyer sees. On 2026-10-26, Aera's raw Admin amount was INR 26,665 while its exact-variant public product JSON and `contextualPricing(country: IN)` both returned INR 31,464.70. Keeri raw MRP values also have mixed, undocumented tax bases. Never apply a blanket multiplier or treat these amounts as confirmed customer prices.

The pinned Shopify export may include `publicPrices`: source `shopify-product-json`, origin `https://shop.maplefurnishers.com`, country `IN`, currency `INR`, capture timestamp, and products/variants keyed by full Shopify IDs with integer `pricePaise` and `compareAtPaise`. Capture prices from the public product JSON in the verified INR buyer context. The consumer rejects foreign contexts, duplicate identities, prices attached to another product, out-of-range money, and evidence captured before the source snapshot or in the future. Missing evidence becomes null; compare-at must come from the same public payload. Raw Admin price fields remain in the source snapshot, and raw Keeri MRPs remain unchanged in Keeri.

**Price authority (owner decision, 1 November 2026).** The store shows Keeri's MRP, read as the GST-inclusive buyer price because the commerce policy is `gstMode: "included"`, and Keeri's `compare_at` row as the struck-through price when it is above the MRP (Keeri exports it on `compareAt=1`; an older Keeri that refuses the opt-in is asked again without it). The Shopify public price shows only where Keeri has no MRP, and such a variant is never purchasable. Because the shown price is the MRP, the price shown is always the price Keeri's quote charges. The sync report counts `keeriPricedVariants` and `priceChangedFromShopify`; run the dry-run sync and review the products whose price moves before applying it, because the caution above about mixed MRP tax bases still applies to families whose MRP is entered without GST.

## Variant photos, options and readable addresses (31 October 2026)

- The live sync asks Keeri for `?taxonomy=1&content=1&attributes=1`. Each variant then carries its named options (`attributes`: axis and value, in sheet order). Keeri leaves out axes marked N/A or left blank, and the store drops any blank value it still receives. Ship Keeri first. If the store ships first, Keeri answers `400`, and the sync asks again without attributes (`ATTRIBUTES_UNSUPPORTED`), so the catalogue keeps syncing without variant options until Keeri ships.
- A variant is titled by its Keeri variant name, otherwise its option values ("Ivory Boucle / Dark Walnut", at most 300 characters), otherwise its SKU. The options themselves are not stored yet. Option pickers will add them in a schema that does not ship in every page's script.
- Each variant keeps its own photos (`Variant.images`). Keeri-only products must use approved hosts, as product photos do. A product merged into a Shopify listing filters unapproved hosts out instead of failing. `Product.images` still holds every photo, so product cards are unchanged. `/api/products` lists leave variant photos and slugs out; the product detail response carries them. The product page shows the selected variant's photos and then the photos no variant claims. Each option in the picker shows its variant's first photo.
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
