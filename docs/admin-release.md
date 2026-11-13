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

Sessions expire after eight hours; logout invalidates the stored token. Role changes and disabling an account are checked on subsequent requests. The store itself has no staff-management, password-reset or MFA UI: since 14 November 2026 staff are managed in Keeri (next section). Operator recovery must be separately authorized; do not use the create-only helper to reset an existing identity. Login attempts are bounded by the API and per-account lockout. Account lockout can deny access temporarily if an attacker targets a known address; no lockout bypass is provided.

## Staff sign in with Keeri accounts (14 November 2026)

Owner's decisions, 14 November 2026: staff for the shop admin are managed in Keeri, not in a second staff list here; Keeri is the only way in; one emergency password is kept; today's shop-admin account moves to Keeri.

The sign-in page has one button, **Sign in with Keeri**. Keeri signs the person in, checks their role and sends them back; the store's server then confirms with Keeri who they are. The store never sees a Keeri password. Keeri's side is described in Keeri's `docs/app-sign-in.md`.

**There is no switch.** A production store always signs staff in with Keeri, and no setting turns shop passwords back on. Shop passwords remain only where there is no Keeri to ask: a developer's machine or a test run with none of the Keeri sign-in settings present.

### Who gets in, and with what

Access is four boxes on a role in Keeri, under **ShopMaple website admin** on Team & access → Roles. There are no per-section permissions, because the shop admin has one draft and publishes everything at once.

| Ticked in Keeri | In the shop admin |
|---|---|
| View | Opens the admin, reads the draft and History, previews. Cannot save, upload or publish. |
| Edit | View, plus change content, upload media and save drafts. |
| Publish | Edit, plus publish and restore from History. |
| Enquiries | The Enquiries screen. On its own it opens only that screen. |
| None of the four | No access; the sign-in page says so. |

Keeri's Administrator role holds all four. The owner's starting ticks for the other roles are listed in Keeri's `docs/app-sign-in.md` ("Starting roles for Maple Furnishers"); they are made on Keeri's Roles screen and stay editable there.

Restoring from History is now refused for editors by the API as well as hidden in the screen; before this release the API allowed it.

### People, accounts and History

- The store keeps one `ShopAdmin` row per Keeri person (keyed by `keeriUserId`), with name and email copied from Keeri at each sign-in and each re-check, so History keeps naming who saved and published.
- **Today's accounts move to Keeri.** The first time somebody signs in with Keeri using the email address of an existing shop account, that account becomes theirs: same row, same History, role from Keeri, and its shop password is removed. This happens once per account; a row tied to one Keeri person is never handed to another. Somebody with a shop account but no Keeri user needs one made on Keeri's Users screen, with the same email if their History should stay under one name.
- **The join is by email address.** A person whose Keeri email differs from their old shop-admin email is not joined: they get a new entry, and their earlier History stays under the old address. To keep one name, make the two addresses the same before their first Keeri sign-in (change it on Keeri's Users screen).
- Shop passwords of accounts that have not moved are kept in the database but cannot be used.
- **Everybody is signed out once when this release goes live.** A shop-password session ends on its next request, and whatever was typed but not yet saved in that browser is lost. Tell staff beforehand and release at a quiet moment.
- An account switched off in the store's own database (`active = false`) stays off whatever Keeri says.

### Removing access

Disable the person in Keeri, change their role, or untick the boxes. **The shop admin stops working for them within one minute**: every staff request first checks how long ago Keeri confirmed the person, and asks Keeri again when that is more than 60 seconds. A no ends all of that person's Keeri sessions here at once. A changed level (publisher to editor, enquiries removed) applies the same way.

**If Keeri cannot be reached**, a session carries on until ten minutes after Keeri last confirmed it, then answers "couldn't confirm your access" until Keeri is back. The session is not thrown away, so the person carries on when Keeri returns. Nobody new can sign in with Keeri meanwhile. Sessions still end after eight hours.

### The emergency account

`ADMIN_EMERGENCY_EMAIL` names the one shop account whose password still works, for when Keeri is unreachable. It sits behind an **Emergency access** link on the sign-in page and is not meant for everyday use:

- every use is written to `ShopAdminSignIn` and to the API log (`[admin] emergency password sign-in by staff <id>`);
- the session shows "Emergency access" beside the role;
- it is limited like any password sign-in: five tries in fifteen minutes from one address, and five wrong tries lock the account for 15 minutes;
- a lock ends on time: tries made while it is locked are refused without being counted, and the count starts again when it runs out (before this release one wrong try every fifteen minutes kept an account locked);
- refused tries are recorded too (`emergency_failed` in `ShopAdminSignIn`), so a run of them shows up;
- it works when Keeri is down even in a browser that still holds a Keeri session: the emergency sign-in, its reset link, a fresh trip to Keeri and signing out are never held behind Keeri's confirmation;
- it has the level stored on that account and is not re-checked with Keeri;
- it keeps its password when its owner also signs in with Keeri.

**Forgot the emergency password** (owner, 14 November 2026: "some email reset"; confirmed the same day). Under Emergency access, "Forgot the emergency password? Email a reset link" emails a link to the emergency account's own address, so a forgotten password never again needs a developer script.

- The link only ever goes to the address in `ADMIN_EMERGENCY_EMAIL`. Nothing typed on the page chooses who is emailed, and the page says the same thing whatever happened.
- It works once, for fifteen minutes. Only its hash is stored. Asking again does not cancel an earlier link; using any one of them ends the rest.
- Asking needs no sign-in, so anybody who finds the page can make the store email the owner. That is capped at three emails an hour, and each one is a working link in the owner's own inbox, so it can be a nuisance but cannot lock the owner out. A flood of these emails is itself the sign that somebody is trying.
- It reads `/admin#reset=…`: the part after the `#` is never sent to a server or written to an access log, and the page removes it from the address as soon as it is read.
- Opening it asks for a new password of at least 14 characters. Setting it ends that account's emergency sessions and does **not** sign anybody in: the next step is still the labelled, recorded emergency sign-in.
- Limits: three links an hour for the account, five requests an hour and ten password attempts in fifteen minutes from one address.
- Setting a new password also clears a lock on the account.
- Each request and each use is a row in `ShopAdminPasswordReset` (when asked, when used) and a line in the API log, with no address or link in it.
- It is for the emergency account only. Everybody else resets their password in Keeri.
- It needs the store's mail sender: `ORDER_RESEND_API_KEY`, `ORDER_MAIL_FROM` and `ORDER_MAIL_TO`, or their `ENQUIRY_*` values, the same ones order emails use. Without them the link is not offered and the API log says so by name; the emergency account still works. The email is only as deliverable as that sender: its domain must be verified in Resend.
- The account must already exist in the shop admin. An emergency account whose owner has only ever signed in with Keeri has no password until this link is used once.

### Settings (names only; values are never written in a document or a message)

| File | Key | Purpose |
|---|---|---|
| Store `store.env` | `KEERI_SIGN_IN_CLIENT_ID` | The store's name in Keeri's registry: `shop-admin`. |
| Store `store.env` | `KEERI_SIGN_IN_CLIENT_SECRET` | The secret the store proves itself to Keeri with. 32 to 256 URL-safe characters. |
| Store `store.env` | `ADMIN_EMERGENCY_EMAIL` | The one account whose shop password still works. |
| Store `store.env` | `KEERI_ORIGIN`, `KEERI_TENANT_ID` | Already present. Where the store's server calls Keeri, and which company's answers it accepts. |
| Store `store.env` | `KEERI_ADMIN_ORIGIN` | Optional, already documented. Where a browser is sent to sign in; defaults to `KEERI_ORIGIN`. |
| Keeri `keeri.env` | `APP_SIGN_IN_CLIENTS` | Keeri's record of the store: company, the SHA-256 of the secret, and the one return address `<WEB_ORIGIN>/api/admin/keeri/callback`. |

A helper writes the secret to both files without showing it. On the server, as `deploy`:

```sh
node deploy/keeri-admin-sign-in.mjs setup --emergency-email <the owner's shop-admin email>
```

It reads `WEB_ORIGIN`, `KEERI_ORIGIN` and `KEERI_TENANT_ID` from `store.env`, makes a new random secret, appends the store keys and Keeri's `APP_SIGN_IN_CLIENTS`, and keeps a dated copy of each file beside it. It refuses to run twice, refuses files other users can read, and changes nothing if a value is missing. It restarts nothing. `status` shows what is set, by name only.

The helper edits settings files and cannot see the database, so it cannot tell whether the emergency address belongs to an account. The store API checks that when it starts and says so in its log, by setting name only: no emergency account named, an address that matches no active account, or an account with no password yet.

**When the store's address changes** (for example the planned move of the store's address), Keeri must be told the new return address, or it will refuse to send people back. After `WEB_ORIGIN` has been changed in `store.env`:

```sh
node deploy/keeri-admin-sign-in.mjs setup --replace
```

It makes a new secret, writes the return address from the current `WEB_ORIGIN`, keeps any other app registered in Keeri and every unrelated setting, and keeps the emergency address unless a new one is given. Then restart Keeri and the store API; until both have restarted they disagree about the secret and only the emergency account can sign in. The same command changes the secret on its own, and recovers a set-up that stopped half-way.

If a setting is missing or malformed the store still starts. The API log names the setting (never its value), the sign-in page says Keeri sign-in is not set up, and the only password that works is the emergency account's.

### Order of release

With no switch, the settings go in before the new store release is made live, so staff are never left without a way in.

1. **Keeri**: deploy the release with `/sign-in/authorize` and `/api/app-sign-in/*`. Nothing changes for anybody yet.
2. **Store, staged but not live**: back up, export the release and run its migrations (`20261114140000_admin_keeri_sign_in`, `20261114150000_admin_view_and_enquiries_only` and `20261114160000_admin_emergency_password_reset`; all additive, and the running release ignores them).
3. From the staged release folder, run the helper's `setup`. Then restart Keeri so it reads `APP_SIGN_IN_CLIENTS`.
4. In Keeri, on Team & access → Roles, tick the ShopMaple website admin boxes for the starting roles.
5. **Make the store release live** and restart `shopmaple-api` and `shopmaple-web`. Sign in with Keeri at `/admin`; check that History shows the right name, that an editor cannot publish, and that the emergency link works.
6. Under Emergency access, ask for a reset link once and confirm the email arrives at the emergency account's address. This is the only proof that the mail sender can deliver it.

**Falling back** is going back to the previous store release (point `current` at it and restart the two processes), without reversing the migrations. The old release signs staff in with shop passwords. Accounts that have already moved to Keeri have no shop password any more, apart from the emergency account, so on the old release only the emergency account and accounts that never moved can sign in.

### What protects it

- Keeri sends people back to one exact address from its own configuration; the store sends people only to Keeri's configured address and back to `/admin`. Neither takes a destination from the request.
- A random `state` goes out with the browser in an HttpOnly, `SameSite=Lax` cookie (`__Host-shop_admin_signin`, ten minutes) and must come back unchanged; it is cleared on the first callback, so a callback link works once and only in the browser that started it.
- Keeri's code is single-use, lives one minute, and is exchanged server to server with the secret in an `Authorization` header. The secret is never put in an address, and failures from the call are not logged.
- Signing in always creates a new session token and ends any session the browser arrived with.
- The answer must be for the configured `KEERI_TENANT_ID`.
- Starting and returning are each limited to 30 tries in 15 minutes per address, on top of the API's general limit.
- `ShopAdminSignIn` holds who, when and how (`keeri` or `emergency`), and nothing else.
- `ShopAdminPasswordReset` holds a link's hash, when it was asked for and when it was used.
- Staging has no Keeri sign-in, because Keeri returns people to the live store only: `deploy/ops/staging-env-check.mjs` refuses the Keeri sign-in settings there. Staging staff use the emergency account.

### Checked locally, not on the server

`apps/api/test/admin-keeri-sign-in.test.ts` runs the whole round trip against a stand-in for Keeri's two server routes; Keeri's own tests cover the real routes. The two were also run against each other over plain HTTP on one machine. Nothing was deployed. Confirm on the server: the callback through the Cloudflare tunnel and the Next proxy, the cookies' `Secure` and `__Host-` attributes, and that Keeri's start script passes `APP_SIGN_IN_CLIENTS` to the running process.

## Draft preview and reordering

Editors can preview a saved draft in a new tab and drag list items into order; see [admin draft preview and drag-and-drop reordering](admin-preview-and-reordering.md) for the preview token model, the optional `ADMIN_PREVIEW_SECRET` variable and the keyboard controls. Previewing never publishes.

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
