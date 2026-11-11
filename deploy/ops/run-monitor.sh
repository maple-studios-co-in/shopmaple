#!/bin/sh
# Store monitor launcher. Cron runs it every 5 minutes from the stable path
# /home/deploy/shopmaple/ops/tools/ops/run-monitor.sh (installed by install-ops.sh). From a terminal it prints to the
# screen; under cron it appends to ops/logs/monitor.log, kept under about 1 MB. Options: --dry-run, --test-alert.
set -u
umask 077
OPS=/home/deploy/shopmaple/ops
mkdir -p "$OPS/logs" "$OPS/state"
if [ ! -t 1 ]; then
  LOG="$OPS/logs/monitor.log"
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then mv -f "$LOG" "$LOG.1"; fi
  exec >>"$LOG" 2>&1
fi
# store.env supplies the Resend key; alerts.env (ALERT_MAIL_TO and optional overrides) is read after it.
exec /usr/bin/flock -n "$OPS/state/monitor.lock" /usr/bin/node \
  --env-file=/home/deploy/shopmaple/shared/store.env --env-file-if-exists="$OPS/alerts.env" \
  "$OPS/tools/ops/store-monitor.mjs" "$@"
