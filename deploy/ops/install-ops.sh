#!/bin/sh
# Installs (or upgrades) the ShopMaple operations tools from a staged release into the stable path
# /home/deploy/shopmaple/ops/tools, which cron uses. Usage: install-ops.sh <full release sha>
# It copies the release's deploy/ folder (dependency-free scripts), switches the tools link atomically and keeps the
# previous copy. It does not touch cron, the running store or any data.
set -eu
umask 077
SHA=${1:-}
case "$SHA" in
  *[!0-9a-f]*|'') echo "Usage: install-ops.sh <40-character release sha>" >&2; exit 2 ;;
esac
[ "${#SHA}" -eq 40 ] || { echo "Usage: install-ops.sh <40-character release sha>" >&2; exit 2; }
ROOT=/home/deploy/shopmaple
SRC=$ROOT/releases/$SHA/deploy
OPS=$ROOT/ops
[ -f "$SRC/ops/store-monitor.mjs" ] || { echo "Release $SHA has no deploy/ops tools; stage a release that includes them." >&2; exit 1; }
mkdir -p "$OPS/state" "$OPS/logs" "$OPS/drill"
chmod 700 "$OPS" "$OPS/state" "$OPS/logs" "$OPS/drill"
NEW="$OPS/tools-$SHA"
if [ ! -d "$NEW" ]; then
  rm -rf "$NEW.partial"
  mkdir "$NEW.partial"
  cp -R "$SRC/." "$NEW.partial/"
  printf '%s\n' "$SHA" > "$NEW.partial/VERSION"
  chmod -R go-rwx "$NEW.partial"
  chmod 700 "$NEW.partial"/ops/*.sh
  mv "$NEW.partial" "$NEW"
fi
PREVIOUS=$(readlink "$OPS/tools" 2>/dev/null || true)
ln -sfn "tools-$SHA" "$OPS/tools.next"
mv -T "$OPS/tools.next" "$OPS/tools"
# Keep the active and the previous copy only.
for dir in "$OPS"/tools-*; do
  name=${dir##*/}
  [ "$name" = "tools-$SHA" ] && continue
  [ -n "$PREVIOUS" ] && [ "$name" = "$PREVIOUS" ] && continue
  case "$name" in tools-[0-9a-f]*) rm -rf "$dir" ;; esac
done
echo "ShopMaple operations tools $SHA installed at $OPS/tools"
