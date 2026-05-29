# WeisileLink Desktop

WeisileLink Desktop is the local teacher-computer bridge for ScratchAI EV3
classes. It runs on macOS or Windows, exposes the Scratch Link compatible
endpoint at `ws://127.0.0.1:20111/scratch/bt`, supervises the bridge process,
and gives teachers a predictable install, health, diagnostics, and uninstall
path.

This desktop package is not a replacement for ScratchAI. Students still use the
browser editor. WeisileLink Desktop owns local hardware transport, localhost
service startup, safety validation, and diagnostic evidence.

## Modes

- Full VSLE mode: EV3 boots ev3dev and runs `vsle_ev3_server.py`.
- Official firmware Bluetooth compatibility mode: EV3 keeps official LEGO
  firmware and connects over Bluetooth Classic for the supported Basic Pack.

Full VSLE mode is the production classroom mode. It supports the complete EV3
block surface, AI Quest workflows, 50Hz sensor streaming, multi-device sessions,
PID controls, and complete display/system behavior.

Official firmware Bluetooth compatibility mode is a limited trial and legacy
project mode. It can cover basic motor, touch, ultrasonic, color brightness,
motor position, and sound workflows only after native adapter tests and real
official-firmware EV3 smoke evidence pass on that OS. It must not be presented
as equivalent to full VSLE mode.

## Reliability Rules

- The bridge binds to `127.0.0.1` by default.
- Installers bundle their runtime and do not require system Python.
- Logs and diagnostics redact tokens, API keys, and student raw data.
- Uninstall removes startup entries and preserves diagnostics unless the teacher
  chooses to delete them.

## Required Desktop Surfaces

- Install and upgrade without developer tools.
- Start automatically after login or reboot.
- Show whether the service is running, how many ScratchAI clients are connected,
  which EV3 transport is active, and whether sensor data is fresh.
- Export a diagnostic bundle with redaction enabled by default.
- Offer start, stop, health check, and uninstall controls.
- Detect port conflicts on `20111` or `8766` and show a recovery message.
- Restart or surface a teacher-visible failure after bridge crashes.

## Security Defaults

The default package is local-only. LAN listening is allowed only when a teacher
explicitly enables it and configures pairing-token protection. Diagnostic files
must not reveal pairing tokens, API keys, Bluetooth addresses, oversized labels,
or raw student data unless a teacher deliberately includes device identifiers
for support.

## Release Evidence

No desktop package is classroom ready until the release artifact itself passes
clean-machine install, upgrade, login/reboot auto-start, health check,
ScratchAI WebSocket connection, diagnostics export, crash recovery, and
uninstall verification on the target OS.

## Release Artifact Packaging

The first packaging step is `desktop/scripts/build_release_artifacts.py`. It
packages an already-built self-contained executable into the target release
layout, writes a zip file, and records a manifest under `desktop/release/`.
Build the self-contained executable on the target OS with
`desktop/scripts/build_weisilelink_executable.py` before packaging; Windows
builds must run on a Windows host and write
`desktop/build/windows/WeisileLink.exe`:

```bash
./.venv/bin/python desktop/scripts/build_weisilelink_executable.py \
  --target windows \
  --output desktop/build/windows \
  --clean
```

Example internal smoke commands:

```bash
desktop/macos/native/build.sh

./.venv/bin/python desktop/scripts/build_release_artifacts.py macos \
  --executable path/to/WeisileLink \
  --native-adapter desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter \
  --output desktop/release/macos \
  --version 0.1.0 \
  --allow-unsigned

./.venv/bin/python desktop/scripts/build_release_artifacts.py windows \
  --executable path/to/WeisileLink.exe \
  --output desktop/release/windows \
  --version 0.1.0 \
  --allow-unsigned
```

The `--allow-unsigned` path is not classroom ready. External distribution still
requires signed artifacts, macOS notarization, and clean-machine install smoke
reports generated from the same artifact.

For macOS, run the prerequisite preflight before collecting clean-machine
evidence. After running `desktop/macos/native/build.sh` and building the
WeisileLink binary, the preflight can auto-detect
`desktop/build/macos/WeisileLink` and
`desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter`;
it also auto-detects a unique Developer ID Application and unique Developer ID
Installer identity from the macOS keychain. Pass `--executable`,
`--native-adapter`, `--app-sign-identity`, or `--installer-sign-identity` only
for nonstandard paths or when multiple matching identities are present. The
notarytool keychain profile can be passed with `--notary-keychain-profile` or
exported as `WEISILE_NOTARY_KEYCHAIN_PROFILE` so Apple account details stay
outside the repository and command history:

```bash
./.venv/bin/python desktop/scripts/check_macos_release_preflight.py \
  --app-sign-identity "Developer ID Application: WeisileEDU" \
  --installer-sign-identity "Developer ID Installer: WeisileEDU" \
  --notary-keychain-profile VSLE_NOTARY \
  --json-report docs/desktop/evidence/macos-release-preflight.json \
  --report docs/desktop/evidence/macos-release-preflight.md
```

The preflight must pass before signing, notarization, package creation, or
clean-machine install smoke evidence collection.

Once the preflight says `Ready: yes`, use the guarded runner to execute the
signed app build, notarization, and signed package steps in order:

```bash
./.venv/bin/python desktop/scripts/run_macos_release_flow.py \
  --preflight-json-report docs/desktop/evidence/macos-release-preflight.json \
  --preflight-report docs/desktop/evidence/macos-release-preflight.md \
  --json-report docs/desktop/evidence/macos-release-flow.json \
  --report docs/desktop/evidence/macos-release-flow.md \
  --output desktop/release/macos \
  --version 0.1.0
```

The runner refuses to call signing or notarization tools unless
`check_macos_release_preflight.py` reports `Ready: yes`. If blocked, the
release-flow report includes `Preflight Blocking Checks` and
`Release Commands After Preflight Passes` sections for the next signing
operator.

```bash
./.venv/bin/python desktop/scripts/notarize_macos_release.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --keychain-profile VSLE_NOTARY
```

The notarization helper uses `xcrun notarytool` and `xcrun stapler`; it updates
the manifest to `notarized: true` only after stapler validation succeeds.

Then build the signed macOS installer package:

```bash
./.venv/bin/python desktop/scripts/build_macos_pkg.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --sign-identity "Developer ID Installer: WeisileEDU"
```

The install smoke gate requires the resulting manifest to include the signed
installer package fields before it accepts macOS release-artifact evidence.

For Windows, run the release preflight before collecting clean-machine
evidence. The preflight checks the self-contained `WeisileLink.exe`, confirms
the release host and `signtool` availability, records the Windows signing
identity from `--sign-identity` or `WEISILE_WINDOWS_SIGN_IDENTITY`, records the
timestamp server from `--timestamp-url` or `WEISILE_WINDOWS_TIMESTAMP_URL`, and
keeps the flow blocked unless all release prerequisites are present. On a
Windows build host, the packager runs `signtool sign` followed by
`signtool verify` before writing a signed manifest. When the executable is
missing, the preflight report includes the exact
`build_weisilelink_executable.py --target windows` command to run on that
Windows host:

```bash
./.venv/bin/python desktop/scripts/check_windows_release_preflight.py \
  --executable desktop/build/windows/WeisileLink.exe \
  --sign-identity "VSLE Windows Code Signing" \
  --timestamp-url https://timestamp.digicert.com \
  --json-report docs/desktop/evidence/windows-release-preflight.json \
  --report docs/desktop/evidence/windows-release-preflight.md
```

When that report says `Ready: yes`, run the guarded Windows release flow:

```bash
./.venv/bin/python desktop/scripts/run_windows_release_flow.py \
  --preflight-json-report docs/desktop/evidence/windows-release-preflight.json \
  --preflight-report docs/desktop/evidence/windows-release-preflight.md \
  --json-report docs/desktop/evidence/windows-release-flow.json \
  --report docs/desktop/evidence/windows-release-flow.md \
  --output desktop/release/windows \
  --version 0.1.0
```

The runner writes `windows-release-flow.json` and
`windows-release-flow.md`; until the preflight is ready it records
`blocked-preflight` and executes no release commands.

For the real Windows build host handoff, use the checked PowerShell wrapper
instead of copying individual commands by hand:

```powershell
$env:WEISILE_WINDOWS_SIGN_IDENTITY = "VSLE Windows Code Signing"
$env:WEISILE_WINDOWS_TIMESTAMP_URL = "https://timestamp.digicert.com"
.\desktop\windows\build_release.ps1
```

`desktop/windows/build_release.ps1` runs the target-OS executable builder,
Windows release preflight, and guarded release flow without using
`--allow-unsigned`.

Windows clean-machine release evidence also requires a signed installer in the
release manifest. `scripts/run_desktop_install_smoke.py` rejects Windows
manifests unless they include `windows_installer`, `windows_installer_type`,
`windows_installer_signed: true`, and a 64-character
`windows_installer_sha256`.

For the no-WiFi full VSLE Bluetooth classroom path, collect clean-machine
install evidence with an ev3dev EV3 running `vsle_ev3_server.py` over
`vsle-bluetooth`. The evidence must include `vsle_bluetooth_real_ev3_ok: true`
and must pass the desktop gate in VSLE mode:

Use the platform-specific templates under `docs/desktop/evidence/`:

- `macos-vsle-bluetooth-install-smoke.template.json`
- `windows-vsle-bluetooth-install-smoke.template.json`

The copied evidence JSON must set `release_artifact_manifest` to the manifest
for the installed release artifact. macOS manifests must be signed and
notarized; Windows manifests must be signed. In both cases, the manifest must
record a bundled self-contained executable before the install smoke gate can
accept `installed_from_release_artifact: true`.

```bash
python scripts/run_desktop_install_smoke.py \
  --mode vsle-bluetooth \
  --evidence docs/desktop/evidence/<os>-vsle-bluetooth-install-smoke.json \
  --report docs/desktop/evidence/<os>-vsle-bluetooth-install-smoke.md
```

Only accepted `--mode vsle-bluetooth` release evidence may be used to set
`installed_from_release_artifact: true` in the full VSLE Bluetooth classroom
smoke JSON.

Apply accepted release evidence with the bridge script so the classroom smoke
JSON is only updated after the install smoke validator passes:

```bash
python scripts/apply_vsle_bluetooth_install_evidence.py \
  --install-evidence docs/desktop/evidence/<os>-vsle-bluetooth-install-smoke.json \
  --classroom-evidence docs/classroom/vsle_bluetooth_full_module_smoke.json \
  --output docs/classroom/vsle_bluetooth_full_module_smoke.json \
  --report docs/classroom/vsle_bluetooth_release_evidence_bridge.md
```
