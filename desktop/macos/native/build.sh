#!/usr/bin/env bash
set -eu

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="${ROOT}/desktop/macos/native/WeisileEV3BluetoothAdapter.m"
INFO_PLIST="${ROOT}/desktop/macos/native/WeisileEV3BluetoothAdapter-Info.plist"
OUT_DIR="${ROOT}/desktop/build/macos/native"
OUT="${OUT_DIR}/WeisileEV3BluetoothAdapter"

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

mkdir -p "${OUT_DIR}"
clang "${COMMON_FLAGS[@]}" "${SRC}" \
  -Wl,-sectcreate,__TEXT,__info_plist,"${INFO_PLIST}" \
  -o "${OUT}"
codesign --force --sign - "${OUT}" >/dev/null
echo "${OUT}"
