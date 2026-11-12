#!/bin/sh
# Nightly backup launcher (cron 02:47 UTC) from the stable ops path. It runs the reviewed paired backup of the active
# release through backup-runner.mjs, which records the outcome in ops/state/backup-last.json for the store monitor.
set -u
umask 077
OPS=/home/deploy/shopmaple/ops
mkdir -p "$OPS/logs" "$OPS/state"
if [ ! -t 1 ]; then
  LOG="$OPS/logs/backup.log"
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then mv -f "$LOG" "$LOG.1"; fi
  exec >>"$LOG" 2>&1
fi
exec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C HOME=/home/deploy \
  /usr/bin/node "$OPS/tools/ops/backup-runner.mjs"
