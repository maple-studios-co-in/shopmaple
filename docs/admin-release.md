# Shop content admin release and private owner setup

This release adds a shop-owned content service and `/admin` dashboard. Keeri remains the authority for products, inventory, orders and delivery. No checkout activation, commerce data migration, customer import, public signup or default admin account is included.

## Read-only preflight recorded 26 October 2026

SSH alias `maple` currently resolves the active checkout to `/home/deploy/shopmaple/releases/ffb519f437f4e52ba457c59484e9fa03882f86a6`. Node is `v22.23.0`; web, API and isolated PostgreSQL listen only on `127.0.0.1:3110`, `127.0.0.1:4110` and `127.0.0.1:55440`. The private `/home/deploy/shopmaple/shared/store.env` is owned by `deploy` with mode `0600`. A redacted boolean check confirmed its production mode, exact isolated database target and `https://store.maplefurnishers.com` origin. Six existing migrations are applied; `20261027010000_shop_content_admin` was not yet applied at this preflight.

These observations are a preparation snapshot, not deployment evidence. Recheck them before release. This document does not claim any production admin identity exists.

## Required release gates

Record the immutable reviewed commit and green CI results. Run the complete repository tests, typecheck, build, dependency audit, staged/history secret scans and static analysis after integration. The parent review must include the authentication, content validation, transaction concurrency and frontend rendering diff. Keep the previous release directory intact.

The migration adds only `ShopAdminRole`, `ShopAdmin`, `ShopAdminSession`, `ShopContent` and `ShopContentRevision`. It does not seed accounts, drafts or published content. Verify the migration against the dedicated test database before touching the isolated production database. Production operator actions must use the protected server environment; never copy a developer database or browser-test credential file to the server.

## Backup and restore verification

The existing nightly backup uses the private local PostgreSQL socket. Run the same mechanism before the migration, as `deploy`, with a new filename and restrictive permissions:

```sh
set -euo pipefail
umask 077
shop_admin_stamp=$(date -u +%Y%m%dT%H%M%SZ)
shop_admin_backup=/home/deploy/shopmaple/backups/admin-before-$shop_admin_stamp.dump
/usr/lib/postgresql/16/bin/pg_dump \
  -h /home/deploy/shopmaple/shared/socket -p 55440 -d shopmaple_store \
  -Fc -f "$shop_admin_backup.partial"
test -s "$shop_admin_backup.partial"
mv "$shop_admin_backup.partial" "$shop_admin_backup"
/usr/bin/sha256sum "$shop_admin_backup" > "$shop_admin_backup.sha256"
/usr/lib/postgresql/16/bin/pg_restore --list "$shop_admin_backup" >/dev/null
```

Do not continue after any failed command. Listing an archive is insufficient restore evidence. Create a uniquely named disposable database in this same isolated cluster, restore the archive using `pg_restore --exit-on-error --no-owner`, and compare non-sensitive product/variant counts and the applied migration history against the backup snapshot. Record the archive checksum, successful restore result and disposable database name. Never restore over `shopmaple_store`, Keeri or a developer database. Remove only the exact disposable restore database after recording its results.

## Install, migrate and activate the exact release

Follow the existing [store deployment sequence](store-deployment.md), exporting the reviewed commit to `/home/deploy/shopmaple/releases/<full-sha>`. Run `npm ci` on Node 22, generate Prisma and apply the additive migration using the protected environment:

```sh
node --env-file=/home/deploy/shopmaple/shared/store.env \
  node_modules/prisma/build/index.js generate --schema apps/api/prisma/schema.prisma
node --env-file=/home/deploy/shopmaple/shared/store.env \
  node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
```

Do not inherit a different `DATABASE_URL` from the operator shell: Node's `--env-file` does not replace an existing environment variable. Clear conflicting inherited variables in a private shell and verify the resolved target before migration. Do not print the URL, passwords or environment file. The provisioning helper below performs this clearing and target verification itself.

Build with the existing production API target and web origin. Validate the staged release on loopback before replacing `current`; then atomically switch the symlink and restart only `shopmaple-api` and `shopmaple-web` with `deploy/ecosystem.config.cjs`. Keep the database and all unrelated PM2 processes running. Preserve existing Cloudflare routing; this release needs no DNS or tunnel changes.

Verify public HTTPS home, category, product, `/admin`, published content and health routes. Confirm checkout stays disabled, anonymous admin endpoints return 401, admin responses are `private, no-store`, and staff cookies have `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` and the `__Host-` prefix. Use ordinary browsers through the actual proxy. Do not submit synthetic production enquiries, orders or payments.

## Privately provision the requested owner

The authorized owner identity is `aditya@maplefurnishers.com`, role `publisher`. Its password must be chosen privately by the operator; it must never appear in chat, command arguments, an environment variable, shell history, screenshots or logs. There is no generated default credential and no public signup/reset endpoint.

After the release gates and migration pass, the user can open a private SSH terminal and run:

```sh
ssh -t maple
cd /home/deploy/shopmaple/current
bash deploy/bootstrap-shop-admin.sh /home/deploy/shopmaple/shared/store.env
```

The helper checks Node 22 and an owned regular `0600` environment file; resolves the database exclusively from that file; and defaults to the exact production target `127.0.0.1:55440/shopmaple_store` in production mode. It disables shell tracing, prompts without terminal echo, asks for confirmation and clears password variables on exit. The existing bootstrap CLI enforces a 14–128 character password, hashes it with salted scrypt and creates only the fixed publisher identity. A duplicate identity fails without replacing its password or changing its role.

Secure stdin is also supported for an approved secret-management workflow. Never place a literal password in a shell pipeline or command string. Explicit local/test use requires a second database argument (`shopmaple` or `shopmaple_test`) and only accepts `127.0.0.1:55439` outside production mode. The resolved URL must match that explicit database before any account creation; arbitrary hosts and databases are refused.

Sign in at `https://store.maplefurnishers.com/admin`. Save an initial draft copied from the existing storefront, review it, and publish explicitly. Deployment and account creation alone do not publish content. Editors can save drafts and restore an old revision into a new draft; publishers can also publish. The current dashboard limits restore controls to publishers, while the API permits editors to restore because restoration never changes the public snapshot. A restore always needs a separate publish to become public.

Sessions expire after eight hours; logout invalidates the stored token. Role changes and disabling an account are checked on subsequent requests. There is currently no staff-management, password-reset or MFA UI. Operator recovery must be separately authorized; do not use the create-only helper to reset an existing identity. Login attempts are bounded by the API and per-account lockout. Account lockout can deny access temporarily if an attacker targets a known address; no lockout bypass is provided.

## Draft preview and reordering

Staff can open a draft in a new tab with **Preview draft** and reorder every admin list by drag-and-drop or keyboard. The preview token model, routes, headers and keyboard controls are described in [admin draft preview and reordering](admin-preview-and-reordering.md). Previewing never publishes, never caches and needs no new configuration.

## Rollback and content recovery

The new article authoring release also adds optional `authoredArticles` and the additive `ShopArticlePublication` date ledger. Deploy API/web together and preserve the ledger in paired database/media backups. Older content readers cannot parse authored-article documents. See [article authoring and recovery](releases/2026-10-26-authored-articles.md) for limits and restoration behavior.

Content schemas are strict. The homepage artwork/city controls release adds 26 allowed artwork keys and optional `homeCitiesLayout`; an older binary cannot parse a revision using these additions. Keep the compatible application release and paired database/media snapshot when deploying. Do not assume switching to an older binary preserves newly published content: the old parser may fall back to original content. Prefer restoring an earlier compatible revision through the current application, reviewing it and explicitly publishing before a planned binary rollback. Preserve the new revision history and media; a whole-database restore requires a separate incident decision.

For application rollback, point `current` to the retained pre-release directory and restart only the two shop application processes. The old application ignores the additive admin/content tables, so preserve them; do not reverse the migration or delete drafts, revisions, staff or sessions. Verify the old storefront and disabled checkout after rollback.

For a content correction, restore the desired revision as a draft, inspect it and publish with the current version. Stale saves/publications return 409 instead of overwriting another operator. Revision history retains the action and actor identity. A database restore is a separate incident decision because restoring a whole archive can overwrite later commerce or content writes; never perform it automatically as an application rollback.

## Local verification and evidence

Backend RED assertions preceded implementation: anonymous session `404 != 401`; valid login `401 != 200`; bounded attempts `401 != 429`; bootstrap identity missing; absent content response `NOT_FOUND` instead of version zero; save/validation `404 != 200/400`; concurrent mutations `[404,404]` instead of `[200,409]`. The focused admin suite then passed 9 tests, and the complete API suite passed 162 tests. Final integrated project validation must run again after all changes land.

Helper RED evidence: missing environment argument incorrectly exited zero; the valid private-stdin command failed to persist its owner; remote target was accepted; explicit database scope was unsupported. A local pseudo-terminal check also confirmed both password prompts suppress echo and a mismatched confirmation exits before account creation. The final focused helper suites pass four tests against the dedicated local `shopmaple_test` database. They cover private file permissions, actual creation, duplicate reset refusal, inherited-environment isolation and unexpected target refusal:

```sh
npx tsx --env-file=.env --test --test-concurrency=1 \
  deploy/bootstrap-shop-admin.test.ts deploy/bootstrap-shop-admin.db.test.ts
bash -n deploy/bootstrap-shop-admin.sh
```

During local helper development, the first integration test exposed Node environment precedence: an inherited development connection took priority over the test environment file. It created one transient owner fixture in the local development database. Before cleanup, that exact identity was verified to have zero sessions and revisions; only that identity was removed. No production operation occurred. The helper now clears inherited connection/mode variables and compares the resolved target with its explicit database scope; tests inject an unrelated, non-routable sentinel connection so a regression fails before any unintended write. Test cleanup deletes only the exact identity created by the test.

The browser QA account is a separate synthetic local identity. Remove its sessions, synthetic revisions/content and credential file after browser validation; do not transfer them into a production release. Local browser/API verification does not substitute for production proxy/session verification or private owner provisioning.
