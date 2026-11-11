#!/bin/bash
# One-time setup of the private staging copy (docs/operations-staging.md). Safe to re-run: each step is skipped when done.
# Creates /home/deploy/shopmaple-staging, its environment file (generated database password and preview secret, plus the
# read-only Keeri catalogue settings from store.env), its own PostgreSQL cluster on 127.0.0.1:55441 (pm2
# shopmaple-staging-db), and the staging role and database. Starts nothing else; prints no secret.
set -euo pipefail
umask 077
STAGE=/home/deploy/shopmaple-staging
TOOLS=/home/deploy/shopmaple/ops/tools
PGBIN=/usr/lib/postgresql/16/bin
STORE_ENV=/home/deploy/shopmaple/shared/store.env
ENVF=$STAGE/shared/staging.env
SOCK=$STAGE/shared/socket
test -f "$TOOLS/ops/staging.env.example" || { echo "Install the ops tools first (install-ops.sh)." >&2; exit 1; }
mkdir -p "$STAGE/releases" "$STAGE/shared/media" "$SOCK" "$STAGE/logs"
chmod 700 "$STAGE" "$STAGE/shared" "$STAGE/shared/media" "$SOCK" "$STAGE/releases" "$STAGE/logs"

if [ ! -f "$ENVF" ]; then
  DB_PASSWORD=$(openssl rand -hex 24)
  PREVIEW_SECRET=$(openssl rand -hex 32)
  sed -e "s/@DB_PASSWORD@/$DB_PASSWORD/" -e "s/@PREVIEW_SECRET@/$PREVIEW_SECRET/" "$TOOLS/ops/staging.env.example" > "$ENVF.partial"
  grep -E '^(KEERI_ORIGIN|KEERI_TENANT_ID|KEERI_CATALOGUE_TOKEN)=' "$STORE_ENV" >> "$ENVF.partial" || true
  chmod 600 "$ENVF.partial"
  mv "$ENVF.partial" "$ENVF"
  echo "Created $ENVF"
else
  echo "Keeping existing $ENVF"
fi

if [ ! -f "$STAGE/shared/postgres/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$STAGE/shared/postgres" -U deploy --auth-local=peer --auth-host=scram-sha-256 -E UTF8 > "$STAGE/logs/initdb.log" 2>&1
  echo "Created the staging PostgreSQL cluster"
fi

cp "$TOOLS/ops/ecosystem.staging.config.cjs" "$STAGE/ecosystem.config.cjs"
if ! pm2 describe shopmaple-staging-db > /dev/null 2>&1; then
  pm2 start "$STAGE/ecosystem.config.cjs" --only shopmaple-staging-db
fi
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q -h "$SOCK" -p 55441 && break; sleep 1; done
"$PGBIN/pg_isready" -q -h "$SOCK" -p 55441 || { echo "The staging database did not start; see pm2 logs shopmaple-staging-db." >&2; exit 1; }

DB_PASSWORD=$(sed -n 's#^DATABASE_URL=postgresql://shopmaple_staging:\([0-9a-f]*\)@127\.0\.0\.1:55441/shopmaple_staging$#\1#p' "$ENVF")
[ -n "$DB_PASSWORD" ] || { echo "DATABASE_URL in $ENVF is not the generated staging address." >&2; exit 1; }
# The password goes through stdin (printf is a shell builtin), never a command line.
{
  echo "SELECT 'CREATE ROLE shopmaple_staging LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopmaple_staging') \\gexec"
  printf "ALTER ROLE shopmaple_staging PASSWORD '%s';\n" "$DB_PASSWORD"
  echo "SELECT 'CREATE DATABASE shopmaple_staging OWNER shopmaple_staging' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'shopmaple_staging') \\gexec"
} | "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p 55441 -d postgres -f -
echo "Staging database ready. Next: edit $ENVF if needed, then run staging-refresh-db.sh."
