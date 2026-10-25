# Store catalogue union and Keeri synchronization

The new store is an enquiry catalogue while checkout remains disabled. The merchant explicitly selected every current Shopify and nondeleted Keeri product, including source drafts, with ShopMaple inclusion enabled by default. This does not change Shopify publication, Keeri's global publication flags, stock, or payment settings.

## Sources and publication

The full Shopify Admin projection contains only product-facing fields: stable IDs, names, descriptions, handles, product type, source status, public image URLs, variants/SKUs, and prices. The captured complete snapshot has 186 products (176 active, 10 draft), 284 variants, no truncated variant pages. Archived products are excluded. Store the snapshot outside Git under the deployment shared directory. This is a **pinned snapshot**, not an ongoing Shopify subscription: later Shopify changes require a newly captured complete snapshot and a sync run. Reports expose its capture timestamp separately from live Keeri freshness.

Keeri V2 is `GET /api/storefront/catalogue/v2`, authenticated with a tenant-bound `catalogue:read` service credential. The consumer validates the complete schema, tenant and asset ownership before any write. V2 uses `channelPublished` independently of global source status; explicit channel exclusions are omitted by the producer. Missing price, category, media or variants remain explicit unknowns. All imported stock is unconfirmed (`available: false`); missing/zero placeholder prices become `null`, and such variants cannot enter a purchasing cart. V1 remains available with its original stricter publication gates.

Public images must be approved/current and explicitly mapped by Keeri, then match the storefront image allowlist: `cdn.shopify.com/s/files/` or `shop.maplefurnishers.com/cdn/shop/`. No private storage key/admin route is published or fetched automatically. Products without a public image use the storefront fallback.

## Identity and precedence

The union matches stable Shopify IDs or exact current SKUs only. A SKU must be unique on both sides. Titles and legacy SKUs are never identity evidence. Conflicting model/variant evidence or multiple Keeri models claiming one Shopify model remain separate enquiry listings and appear in the aggregate ambiguity count.

Existing Shopify `preview-*` IDs, public handles, variant IDs and cart references survive exact merges. Persisted source-binding tables prevent two identities from the same source claiming one storefront row; previously established bindings cannot silently move. Partial matches preserve unmatched Shopify variants. Real Keeri values take precedence, while absent Keeri photos, descriptive copy, category or price retain known Shopify presentation/price. Truly unknown values stay null. Source status is retained as provenance and does not imply purchasability.

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

Default is read-only. Apply accepts only loopback database `shopmaple_store` on 55440 (or dedicated tests on 55439). Keeri capture must be no older than 15 minutes or over one minute in the future. HTTPS transport rejects redirects, oversized payloads, bad content types and untrusted origin changes. An entirely empty Keeri snapshot requires the explicit one-run `--allow-empty-keeri` flag; otherwise the previous catalogue is retained and the job fails. Individual exclusions need no flag.

After a reviewed first import, install a five-minute cron invoking the current release under `flock -n /home/deploy/shopmaple/shared/catalogue-sync.lock`. Log aggregate JSON only (counts, ambiguity, each source capture timestamp and dry-run state), rotate logs, and preserve nonzero failures. Credential expiry and repeated failures require operator attention; there is not yet a staff dashboard displaying the consumer's sync freshness. Keeri channel inclusion controls are the ongoing staff selection surface.

## Release and rollback

Back up and checksum the isolated database before migrations/import. Restore-test that backup into a separate scratch database. Apply the additive identity/source-status and nullable category/price migrations, start the reviewed nullable-aware runtime, dry-run the real sources, then atomically import and verify counts and representative public pages. Keep checkout disabled.

**After nullable catalogue rows are imported, switching the symlink to the older runtime alone is unsafe:** that version rejects null prices/categories and empty variants/images. Rollback must either retain the new compatible runtime or stop the scheduled sync, restore the exact pre-import database backup, then activate the previous release. Rehearse the database restore before activation and retain both release directories. Do not delete releases or reset Keeri/Shopify data.

The legacy `deploy/sync-keeri-catalogue.ts` remains a V1-only incremental tool. Do not schedule it alongside the union runner.
