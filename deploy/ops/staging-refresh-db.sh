#!/bin/bash
# Refreshes the staging database and media from the newest complete production backup, with customer personal data and
# payment data removed (staging-scrub.mjs) BEFORE the copy replaces the staging database. The live database is only
# read through its backup file. Usage: staging-refresh-db.sh
set -euo pipefail
umask 077
STAGE=/home/deploy/shopmaple-staging
TOOLS=/home/deploy/shopmaple/ops/tools
PGBIN=/usr/lib/postgresql/16/bin
SOCK=$STAGE/shared/socket
ENVF=$STAGE/shared/staging.env
PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p 55441)
/usr/bin/node "$TOOLS/ops/staging-env-check.mjs"
"$PGBIN/pg_isready" -q -h "$SOCK" -p 55441 || { echo "The staging database is not running (pm2 shopmaple-staging-db)." >&2; exit 1; }

PAIR=$(/usr/bin/node --input-type=module -e "
import { listCompletePairs } from '$TOOLS/ops/backups.mjs';
import { verifyPair } from '$TOOLS/paired-backup.mjs';
const [pair] = listCompletePairs('/home/deploy/shopmaple/backups');
if (!pair) { console.error('No complete backup to copy.'); process.exit(1); }
await verifyPair(pair.path, { pgRestorePath: '$PGBIN/pg_restore' });
console.log(pair.path);")
echo "Using backup $(basename "$PAIR")"

cleanup() { "${PSQL[@]}" -d postgres -c 'DROP DATABASE IF EXISTS shopmaple_staging_next WITH (FORCE);' > /dev/null 2>&1 || true; rm -rf "$STAGE/shared/media.next"; }
trap cleanup EXIT
cleanup
"${PSQL[@]}" -d postgres -c 'CREATE DATABASE shopmaple_staging_next OWNER shopmaple_staging;'
"$PGBIN/pg_restore" --no-owner --no-acl --role=shopmaple_staging --exit-on-error -h "$SOCK" -p 55441 -d shopmaple_staging_next "$PAIR/database.dump"
/usr/bin/node "$TOOLS/ops/staging-scrub.mjs" shopmaple_staging_next
MEDIA_DIR=$(/usr/bin/node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).media.directory)" "$PAIR/COMPLETE.json")
/usr/bin/node "$TOOLS/media-backup.mjs" restore "$PAIR/$MEDIA_DIR" "$STAGE/shared/media.next"

# Swap in the scrubbed copy: the staging API is stopped for the few seconds this takes.
pm2 stop shopmaple-staging-api > /dev/null 2>&1 || true
"${PSQL[@]}" -d postgres -c 'DROP DATABASE IF EXISTS shopmaple_staging WITH (FORCE);'
"${PSQL[@]}" -d postgres -c 'ALTER DATABASE shopmaple_staging_next RENAME TO shopmaple_staging;'
rm -rf "$STAGE/shared/media.old"
mv "$STAGE/shared/media" "$STAGE/shared/media.old"
mv "$STAGE/shared/media.next" "$STAGE/shared/media"
rm -rf "$STAGE/shared/media.old"
trap - EXIT

# Bring the copied schema up to the staging release, if one is deployed.
if [ -e "$STAGE/current" ]; then
  (cd "$STAGE/current" && env -i PATH=/usr/bin:/bin HOME="$HOME" /usr/bin/node --env-file="$ENVF" node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma)
  pm2 restart shopmaple-staging-api --update-env > /dev/null 2>&1 || true
fi
echo "Staging data refreshed from $(basename "$PAIR") with customer and payment data removed."
