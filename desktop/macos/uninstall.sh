#!/usr/bin/env bash
set -eu

LABEL="cn.vsle.weisile-link"
PLIST_TARGET="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if [ -f "${PLIST_TARGET}" ]; then
  launchctl unload "${PLIST_TARGET}" >/dev/null 2>&1 || true
  rm -f "${PLIST_TARGET}"
fi

echo "WeisileLink LaunchAgent removed. Diagnostics and logs are preserved."
