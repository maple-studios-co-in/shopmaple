#!/bin/sh
# Weekly restore drill launcher (cron Sunday 03:30 UTC) from the stable ops path. --email-summary mails the result.
set -u
umask 077
OPS=/home/deploy/shopmaple/ops
mkdir -p "$OPS/logs" "$OPS/state" "$OPS/drill"
if [ ! -t 1 ]; then
  LOG="$OPS/logs/restore-drill.log"
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then mv -f "$LOG" "$LOG.1"; fi
  exec >>"$LOG" 2>&1
fi
exec /usr/bin/flock -n "$OPS/state/restore-drill.lock" /usr/bin/node \
  --env-file=/home/deploy/shopmaple/shared/store.env --env-file-if-exists="$OPS/alerts.env" \
  "$OPS/tools/ops/restore-drill.mjs" "$@"
