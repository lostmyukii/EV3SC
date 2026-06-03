#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

hash_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

check_hash() {
    path=$1
    expected=$2
    label=$3

    if [ ! -e "$ROOT/$path" ]; then
        printf 'MISSING: %s (%s)\n' "$path" "$label" >&2
        exit 1
    fi

    actual=$(hash_file "$ROOT/$path")
    if [ "$actual" != "$expected" ]; then
        printf 'HASH MISMATCH: %s (%s)\n' "$path" "$label" >&2
        printf '  expected: %s\n' "$expected" >&2
        printf '  actual:   %s\n' "$actual" >&2
        exit 1
    fi

    printf 'OK: %s\n' "$path"
}

check_exists() {
    path=$1
    label=$2
    if [ ! -e "$ROOT/$path" ]; then
        printf 'MISSING: %s (%s)\n' "$path" "$label" >&2
        exit 1
    fi
    printf 'OK: %s\n' "$path"
}

check_hash "files/01-sd-card/balenaEtcher-1.17.0.dmg" \
    "0c0abe8c552f98a70943ae7842e6aa2d22fb727fb2a44b260470763604d8889b" \
    "macOS Etcher installer"
check_hash "files/01-sd-card/balenaEtcher-Setup-1.17.0.exe" \
    "63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684" \
    "Windows Etcher installer"
check_hash "files/01-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip" \
    "f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62" \
    "ev3dev EV3 image"
check_hash "files/02-ev3-server/websockets-7.0.tar.gz" \
    "08e3c3e0535befa4f0c4443824496c03ecc25062debbcf895874f8a0b4c97c9f" \
    "offline websockets dependency"
check_hash "files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip" \
    "4b57e11860ba04c676ad2d7b345bae7abb20f4f43789fba7752896b4beb14a9a" \
    "macOS internal WeisileLink zip"
check_hash "files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-manifest.json" \
    "e055e4cf3fcebc3eac784d0e441e54bd39eff8af745a6a4d84998ee6d196faac" \
    "macOS internal WeisileLink manifest"

check_exists "files/02-ev3-server/ev3-firmware/vsle_ev3_server.py" \
    "EV3 server"
check_exists "files/02-ev3-server/ev3-firmware/scripts/install.sh" \
    "EV3 install script"
check_exists "files/03-weisilelink-desktop/windows/build-release-windows.ps1" \
    "Windows release handoff script"
check_exists "files/04-evidence-templates/vsle_bluetooth_full_module_smoke.template.json" \
    "Bluetooth evidence template"
check_exists "files/05-ai-quest-samples/ai-quest-samples/projects/obstacle_avoidance_collector.json" \
    "AI Quest sample project"

if command -v unzip >/dev/null 2>&1; then
    unzip -tq "$ROOT/files/01-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip" >/dev/null
    unzip -tq "$ROOT/files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip" >/dev/null
    printf 'OK: zip structure checks\n'
fi

tar -tzf "$ROOT/files/02-ev3-server/websockets-7.0.tar.gz" >/dev/null
printf 'OK: websockets tarball structure\n'

if command -v hdiutil >/dev/null 2>&1; then
    hdiutil verify "$ROOT/files/01-sd-card/balenaEtcher-1.17.0.dmg" >/dev/null
    printf 'OK: macOS Etcher DMG checksum\n'
else
    printf 'SKIP: hdiutil not available for DMG verification\n'
fi

printf 'Install wizard file check passed.\n'
