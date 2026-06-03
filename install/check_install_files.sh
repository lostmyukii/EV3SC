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

check_zip() {
    path=$1
    label=$2
    if command -v unzip >/dev/null 2>&1; then
        unzip -tq "$ROOT/$path" >/dev/null
        printf 'OK: zip structure %s\n' "$label"
    else
        printf 'SKIP: unzip not available for %s\n' "$label"
    fi
}

check_json() {
    path=$1
    label=$2
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$ROOT/$path" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    json.load(fh)
PY
        printf 'OK: JSON parse %s\n' "$label"
    else
        printf 'SKIP: python3 not available for %s\n' "$label"
    fi
}

check_xml() {
    path=$1
    label=$2
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$ROOT/$path" <<'PY'
import sys
import xml.etree.ElementTree as ET
ET.parse(sys.argv[1])
PY
        printf 'OK: XML parse %s\n' "$label"
    else
        printf 'SKIP: python3 not available for %s\n' "$label"
    fi
}

verify_once() {
    pass=$1
    printf 'Verification pass %s start\n' "$pass"

    broken_links=$(find -L "$ROOT" -type l -print)
    if [ -n "$broken_links" ]; then
        printf 'BROKEN LINKS:\n%s\n' "$broken_links" >&2
        exit 1
    fi
    printf 'OK: no broken symlinks\n'

    check_hash "shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip" \
        "f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62" \
        "ev3dev EV3 image"
    check_hash "shared/02-ev3-server/websockets-7.0.tar.gz" \
        "08e3c3e0535befa4f0c4443824496c03ecc25062debbcf895874f8a0b4c97c9f" \
        "offline websockets dependency"
    check_hash "mac/01-sd-card/balenaEtcher-1.17.0.dmg" \
        "0c0abe8c552f98a70943ae7842e6aa2d22fb727fb2a44b260470763604d8889b" \
        "macOS Etcher installer"
    check_hash "mac/02-weisilelink-desktop/WeisileLink-macos-0.1.0-internal-unsigned.zip" \
        "4b57e11860ba04c676ad2d7b345bae7abb20f4f43789fba7752896b4beb14a9a" \
        "macOS internal WeisileLink zip"
    check_hash "mac/02-weisilelink-desktop/WeisileLink-macos-0.1.0-internal-manifest.json" \
        "e055e4cf3fcebc3eac784d0e441e54bd39eff8af745a6a4d84998ee6d196faac" \
        "macOS internal WeisileLink manifest"
    check_hash "windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe" \
        "63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684" \
        "Windows Etcher installer"
    check_hash "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip" \
        "1853a7de52b37c683247440afa8cf66d112fe19993bc5876f4a20f1528c75fb0" \
        "Windows internal release evidence bundle"
    check_hash "windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json" \
        "79ef79d72578c9adcf6a6ed4377313fdf37482fbd83896465c3e485c88e91e22" \
        "Windows internal release artifact receipt"

    check_exists "shared/02-ev3-server/ev3-firmware/vsle_ev3_server.py" "EV3 server"
    check_exists "shared/02-ev3-server/ev3-firmware/scripts/install.sh" "EV3 install wrapper"
    check_exists "shared/02-ev3-server/ev3-firmware/scripts/install_ev3_autostart.sh" "EV3 autostart installer"
    check_exists "shared/02-ev3-server/ev3-firmware/systemd/vsle-ev3-server.service" "EV3 systemd unit"
    check_exists "mac/02-weisilelink-desktop/install-macos.sh" "macOS helper install script"
    check_exists "mac/02-weisilelink-desktop/uninstall-macos.sh" "macOS helper uninstall script"
    check_exists "mac/02-weisilelink-desktop/weisile-link.launchd.plist" "macOS LaunchAgent"
    check_exists "windows/02-weisilelink-desktop/install-windows.ps1" "Windows helper install script"
    check_exists "windows/02-weisilelink-desktop/uninstall-windows.ps1" "Windows helper uninstall script"
    check_exists "windows/02-weisilelink-desktop/build-release-windows.ps1" "Windows release handoff script"
    check_exists "windows/02-weisilelink-desktop/weisile-link-service.xml" "Windows service metadata"
    check_exists "windows/setup-wizard.ps1" "Windows setup wizard Phase A entrypoint"
    check_exists "windows/setup-wizard.xaml" "Windows setup wizard Phase A WPF layout"
    check_exists "windows/lib/SetupWizard.psm1" "Windows setup wizard Phase A step model"
    check_exists "windows/lib/InstallFileChecks.psm1" "Windows setup wizard Phase B file validator"
    check_exists "windows/lib/WindowsInstallActions.psm1" "Windows setup wizard Phase C confirmed desktop install actions"
    check_exists "windows/WINDOWS_SETUP_WIZARD_DEVELOPMENT.md" "Windows setup wizard development design"
    check_exists "shared/04-ai-quest-samples/ai-quest-samples/projects/obstacle_avoidance_collector.json" "AI Quest sample"

    check_zip "shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip" "ev3dev image"
    check_zip "mac/02-weisilelink-desktop/WeisileLink-macos-0.1.0-internal-unsigned.zip" "macOS internal app bundle"
    check_zip "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip" "Windows internal evidence bundle"

    tar -tzf "$ROOT/shared/02-ev3-server/websockets-7.0.tar.gz" >/dev/null
    printf 'OK: websockets tarball structure\n'

    check_json "mac/02-weisilelink-desktop/WeisileLink-macos-0.1.0-internal-manifest.json" "macOS manifest"
    check_json "windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json" "Windows receipt"
    check_json "mac/03-evidence-templates/macos-vsle-bluetooth-install-smoke.template.json" "macOS install evidence template"
    check_json "windows/03-evidence-templates/windows-vsle-bluetooth-install-smoke.template.json" "Windows install evidence template"
    check_json "shared/03-evidence-templates/vsle_bluetooth_full_module_smoke.template.json" "Bluetooth smoke template"
    check_json "shared/03-evidence-templates/vsle_bluetooth_sensor_port_matrix.template.json" "Bluetooth port matrix template"
    check_json "shared/03-evidence-templates/scratchai_teacher_block_rehearsal.template.json" "ScratchAI rehearsal template"
    check_json "shared/03-evidence-templates/real_ev3_rehearsal_evidence.template.json" "Real EV3 rehearsal template"
    check_xml "windows/setup-wizard.xaml" "Windows setup wizard Phase A XAML"

    if command -v hdiutil >/dev/null 2>&1; then
        hdiutil verify "$ROOT/mac/01-sd-card/balenaEtcher-1.17.0.dmg" >/dev/null
        printf 'OK: macOS Etcher DMG checksum\n'
    else
        printf 'SKIP: hdiutil not available for macOS DMG verification\n'
    fi

    if command -v file >/dev/null 2>&1; then
        file "$ROOT/windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe" | grep -Eqi 'windows|pe32|nsis'
        printf 'OK: Windows Etcher executable signature\n'
    else
        printf 'SKIP: file not available for Windows EXE signature check\n'
    fi

    if command -v unzip >/dev/null 2>&1; then
        unzip -Z -1 "$ROOT/windows/02-weisilelink-desktop/windows-internal-release-evidence.zip" |
            grep -q 'desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip'
        unzip -Z -1 "$ROOT/windows/02-weisilelink-desktop/windows-internal-release-evidence.zip" |
            grep -q 'desktop/release/internal/windows/WeisileLink/WeisileLink.exe'
        printf 'OK: Windows internal release zip contains app zip and executable\n'
    fi

    printf 'Verification pass %s complete\n' "$pass"
}

verify_once 1
verify_once 2
verify_once 3

printf 'Install file verification passed after 3 passes.\n'
