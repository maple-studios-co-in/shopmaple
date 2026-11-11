#!/bin/bash
# Deploys a staged release to staging. Usage: staging-deploy.sh <full release sha>
# Needs /home/deploy/shopmaple/backups/<sha>.tar.gz (the same archive release-stage.sh uses). Builds a staging copy
# with staging.env (the web build fixes its site address at build time, so production builds cannot be reused),
# migrates the staging database, switches staging's current link, restarts the two staging processes, checks them,
# and keeps the two newest staging builds. Never touches production processes, files or the live database.
set -euo pipefail
umask 022
SHA=${1:-}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: staging-deploy.sh <40-character release sha>" >&2; exit 2; }
STAGE=/home/deploy/shopmaple-staging
TOOLS=/home/deploy/shopmaple/ops/tools
ENVF=$STAGE/shared/staging.env
TAR=/home/deploy/shopmaple/backups/$SHA.tar.gz
R=$STAGE/releases/$SHA
LOG=$STAGE/logs/deploy-$SHA
/usr/bin/node "$TOOLS/ops/staging-env-check.mjs"
test -s "$TAR" || { echo "Missing $TAR; upload the release archive first." >&2; exit 1; }
run() { env -i PATH=/usr/bin:/bin HOME="$HOME" "$@"; }

if [ ! -d "$R" ]; then
  rm -rf "$R.partial"
  mkdir -p "$R.partial"
  tar xzf "$TAR" -C "$R.partial"
  echo "$SHA" > "$R.partial/DEPLOYED_COMMIT"
  mkdir -p "$R.partial/apps/web/public/fonts"
  ln -sfn /home/deploy/shopmaple/shared/fonts "$R.partial/apps/web/public/fonts/licensed"
  echo "== npm ci"; (cd "$R.partial" && run npm ci --no-audit --no-fund > "$LOG-install.log" 2>&1)
  echo "== prisma generate"; (cd "$R.partial" && run /usr/bin/node --env-file="$ENVF" node_modules/prisma/build/index.js generate --schema apps/api/prisma/schema.prisma > "$LOG-generate.log" 2>&1)
  echo "== build (staging addresses)"; (cd "$R.partial" && run bash -c 'set -a; . "$1"; set +a; npm run build' _ "$ENVF" > "$LOG-build.log" 2>&1)
  test -f "$R.partial/apps/api/dist/server.js"
  test -f "$R.partial/apps/web/.next/BUILD_ID"
  mv "$R.partial" "$R"
fi

echo "== prisma migrate deploy (staging database)"
(cd "$R" && run /usr/bin/node --env-file="$ENVF" node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma)
ln -sfn "releases/$SHA" "$STAGE/current.next"
mv -T "$STAGE/current.next" "$STAGE/current"
if pm2 describe shopmaple-staging-api > /dev/null 2>&1; then
  pm2 restart shopmaple-staging-api shopmaple-staging-web --update-env > /dev/null
else
  pm2 start "$STAGE/ecosystem.config.cjs" --only shopmaple-staging-api,shopmaple-staging-web > /dev/null
fi

ok=0
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4120/api/health > /dev/null && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3120/)" = 200 ]; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || { echo "Staging did not come up healthy; see pm2 logs shopmaple-staging-api / shopmaple-staging-web." >&2; exit 1; }
echo "staging api: $(curl -s http://127.0.0.1:4120/api/health)"

# Keep the two newest staging builds (this one and the previous), and no half-built copies.
cd "$STAGE/releases"
# shellcheck disable=SC2012 # names are checked against the commit pattern before anything is removed
for dir in $(ls -1dt -- */ 2>/dev/null | tr -d / | tail -n +3); do
  [[ "$dir" =~ ^[0-9a-f]{40}(\.partial)?$ ]] && [ "$dir" != "$SHA" ] && rm -rf -- "$dir"
done
echo "STAGING NOW RUNS $SHA"
