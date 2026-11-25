#!/bin/sh
# Unofficial headless launcher for the Mingle Node CLI.
# This is not the official desktop app. See NOTICE next to the install.
set -eu

SOURCE=$0
while [ -L "$SOURCE" ]; do
  LINKDIR=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)
  SOURCE=$(readlink -- "$SOURCE")
  case $SOURCE in
    /*) ;;
    *) SOURCE=$LINKDIR/$SOURCE ;;
  esac
done
DIR=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)

find_root() {
  for candidate in "$DIR" "$DIR/../lib/mingle-cli" /usr/lib/mingle-cli; do
    if [ -x "$candidate/runtime/node" ] && [ -f "$candidate/payload/dist/cli/main.js" ]; then
      CDPATH= cd -- "$candidate" && pwd
      return 0
    fi
  done
  return 1
}

ROOT=$(find_root) || {
  echo "mingle-cli: bundled Node runtime not found" >&2
  exit 127
}

exec "$ROOT/runtime/node" "$ROOT/payload/dist/cli/main.js" "$@"
