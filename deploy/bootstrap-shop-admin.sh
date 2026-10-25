#!/usr/bin/env bash
set +x
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 ]]; then
  printf 'Usage: bootstrap-shop-admin.sh PRIVATE_ENV_FILE [EXPECTED_DATABASE]\n' >&2
  exit 1
fi
case "$1" in
  /*) shop_admin_env=$1 ;;
  *) shop_admin_env="$PWD/$1" ;;
esac
shop_admin_database=${2:-shopmaple_store}
shop_admin_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
node --input-type=module - "$shop_admin_env" <<'JS'
import { lstatSync } from 'node:fs';
try {
  const file=lstatSync(process.argv[2]);
  if(process.versions.node.split('.')[0]!=='22')throw Error('Node.js 22 is required.');
  if(!file.isFile() || file.isSymbolicLink() || (file.mode&0o777)!==0o600 || file.uid!==process.getuid())throw Error('Private environment permissions must be owner-only 0600.');
} catch {console.error('Use Node.js 22 and an owned regular environment file with permissions 0600.');process.exit(1);}
JS
# The selected private file must be authoritative over an inherited shell connection.
unset DATABASE_URL NODE_ENV
node --env-file="$shop_admin_env" --input-type=module - "$shop_admin_database" <<'JS'
try {
  const target=new URL(process.env.DATABASE_URL);
  const production=target.hostname==='127.0.0.1'&&target.port==='55440'&&target.pathname==='/shopmaple_store'&&process.env.NODE_ENV==='production';
  const local=target.hostname==='127.0.0.1'&&target.port==='55439'&&['/shopmaple','/shopmaple_test'].includes(target.pathname)&&process.env.NODE_ENV!=='production';
  if(target.protocol!=='postgresql:'||target.pathname!=='/'+process.argv[2]||(!production&&!local))throw Error();
} catch {console.error('Refusing an unrecognized shop database target.');process.exit(1);}
JS
cd -- "$shop_admin_root"
trap 'unset shop_admin_password shop_admin_confirmation' EXIT HUP INT TERM
if [[ -t 0 ]]; then
  IFS= read -r -s -p 'New publisher password (at least 14 characters): ' shop_admin_password
  printf '\n' >&2
  IFS= read -r -s -p 'Confirm password: ' shop_admin_confirmation
  printf '\n' >&2
  if [[ "$shop_admin_password" != "$shop_admin_confirmation" ]]; then
    printf 'Passwords did not match; no account was created.\n' >&2
    exit 1
  fi
  printf '%s\n' "$shop_admin_password" | node --env-file="$shop_admin_env" --import tsx "$shop_admin_root/apps/api/src/admin/bootstrap-cli.ts" aditya@maplefurnishers.com publisher
else
  node --env-file="$shop_admin_env" --import tsx "$shop_admin_root/apps/api/src/admin/bootstrap-cli.ts" aditya@maplefurnishers.com publisher
fi
