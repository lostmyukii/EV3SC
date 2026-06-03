#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
    printf 'Usage: %s /path/to/output-folder\n' "$0" >&2
    exit 2
fi

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEST=$1

"$ROOT/check_install_files.sh"

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -RL "$ROOT" "$DEST"

printf 'USB-ready install folder written to: %s\n' "$DEST"
printf 'Run this on the copied folder to verify after copy:\n'
printf '  %s/check_install_files.sh\n' "$DEST"
