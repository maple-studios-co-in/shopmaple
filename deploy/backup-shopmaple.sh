#!/bin/sh
# Install in an immutable operations/<commit>/deploy directory. Linux production only.
set -eu
umask 077
launcher=$(/usr/bin/readlink -f -- "$0")
# Directory flock avoids following or truncating a lock-file symlink. The Node
# runner validates this fixed directory and also takes its portable overlap guard.
exec /usr/bin/flock --nonblock --no-fork /home/deploy/shopmaple/backups \
  /usr/bin/env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C \
  /usr/bin/node "${launcher%/*}/paired-backup.mjs" production
