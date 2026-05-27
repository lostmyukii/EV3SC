#!/usr/bin/env bash
set -eu

LABEL="cn.vsle.weisile-link"
APP_PATH="/Applications/WeisileLink.app"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/WeisileLink"
PLIST_SOURCE="$(cd "$(dirname "$0")" && pwd)/weisile-link.launchd.plist"
PLIST_TARGET="${LAUNCH_AGENTS_DIR}/${LABEL}.plist"

export WEISILE_LINK_HOST="127.0.0.1"
export WEISILE_LINK_PORT="20111"
export TRAINER_WS_PORT="8766"
export WEISILE_TRANSPORT="wifi"
export WEISILE_OFFICIAL_BT_ADAPTER="${APP_PATH}/Contents/Resources/native/WeisileEV3BluetoothAdapter"

if [ ! -d "${APP_PATH}" ]; then
  echo "Missing ${APP_PATH}. Install the signed WeisileLink.app bundle first." >&2
  exit 1
fi

if [ ! -x "${WEISILE_OFFICIAL_BT_ADAPTER}" ]; then
  echo "Missing executable native adapter: ${WEISILE_OFFICIAL_BT_ADAPTER}" >&2
  exit 1
fi

mkdir -p "${LAUNCH_AGENTS_DIR}" "${LOG_DIR}"
sed "s#__WEISILE_LOG_DIR__#${LOG_DIR}#g" "${PLIST_SOURCE}" > "${PLIST_TARGET}"

if launchctl list "${LABEL}" >/dev/null 2>&1; then
  launchctl unload "${PLIST_TARGET}" >/dev/null 2>&1 || true
fi

launchctl load "${PLIST_TARGET}"
echo "WeisileLink LaunchAgent installed with localhost defaults."
