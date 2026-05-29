#!/usr/bin/env bash
set -eu

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="${ROOT}/desktop/macos/native/WeisileEV3BluetoothAdapter.m"
INFO_PLIST="${ROOT}/desktop/macos/native/WeisileEV3BluetoothAdapter-Info.plist"
OUT_DIR="${ROOT}/desktop/build/macos/native"
APP_DIR="${OUT_DIR}/WeisileEV3BluetoothAdapter.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
OUT="${MACOS_DIR}/WeisileEV3BluetoothAdapter"

COMMON_FLAGS=(
  -fobjc-arc
  -Wno-deprecated-declarations
  -framework Foundation
  -framework IOBluetooth
)

if [ "${1:-}" = "--check" ]; then
  clang "${COMMON_FLAGS[@]}" -fsyntax-only "${SRC}"
  exit 0
fi

rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}"
cp "${INFO_PLIST}" "${CONTENTS_DIR}/Info.plist"
clang "${COMMON_FLAGS[@]}" "${SRC}" \
  -Wl,-sectcreate,__TEXT,__info_plist,"${INFO_PLIST}" \
  -o "${OUT}"
xattr -cr "${APP_DIR}" 2>/dev/null || true
xattr -dr "com.apple.fileprovider.fpfs#P" "${APP_DIR}" 2>/dev/null || true
xattr -dr "com.apple.FinderInfo" "${APP_DIR}" 2>/dev/null || true
xattr -dr "com.apple.provenance" "${APP_DIR}" 2>/dev/null || true
codesign --force --sign - --timestamp=none --no-strict "${APP_DIR}" >/dev/null
echo "${OUT}"
