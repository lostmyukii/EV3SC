# WeisileLink Desktop macOS Install

This document defines the required macOS behavior for the WeisileLink Desktop
release artifact.

## Modes

- Full VSLE mode: EV3 boots ev3dev and runs `vsle_ev3_server.py`.
- Official firmware Bluetooth compatibility mode: EV3 keeps official LEGO
  firmware and connects over Bluetooth Classic for the supported Basic Pack.

## Reliability Rules

- The bridge binds to `127.0.0.1` by default.
- Installers bundle their runtime and do not require system Python.
- Logs and diagnostics redact tokens, API keys, and student raw data.
- Uninstall removes startup entries and preserves diagnostics unless the teacher
  chooses to delete them.

## Package Shape

The classroom artifact is a signed `.pkg` that installs a signed
`/Applications/WeisileLink.app` bundle. The app bundle must include the Python
runtime or a self-contained executable. It must not call `/usr/bin/python3` for
classroom releases.

The checked packager for the app bundle zip is
`desktop/scripts/build_release_artifacts.py`. It writes the app bundle,
release zip, and manifest under `desktop/release/`:

```bash
desktop/macos/native/build.sh

./.venv/bin/python desktop/scripts/build_release_artifacts.py macos \
  --executable path/to/WeisileLink \
  --native-adapter desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter \
  --output desktop/release/macos \
  --version 0.1.0 \
  --allow-unsigned
```

`--allow-unsigned` is only for internal smoke testing. A classroom macOS
artifact must be signed, converted to the approved installer shape, notarized,
and then verified on a clean machine.

The installer registers a per-user LaunchAgent named `cn.vsle.weisile-link`.
The LaunchAgent starts WeisileLink on login, keeps it alive, binds to
`127.0.0.1`, and writes logs to `~/Library/Logs/WeisileLink`.

## Signing and Notarization

Every executable, helper, app bundle, and package must be signed before
external classroom distribution. macOS classroom packages must be notarized
before non-developer distribution.

Run the local prerequisite preflight before producing a real classroom
artifact. This checks the self-contained executable path, native adapter app,
Developer ID Application identity, Developer ID Installer identity, Apple
notarytool keychain profile, and required macOS packaging tools. After running
`desktop/macos/native/build.sh` and building the WeisileLink binary, it can
auto-detect `desktop/build/macos/WeisileLink` and
`desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter`;
it also auto-detects a unique Developer ID Application and unique Developer ID
Installer identity from the macOS keychain. Pass `--executable`,
`--native-adapter`, `--app-sign-identity`, or `--installer-sign-identity` only
for nonstandard paths or when multiple matching identities are present:

```bash
./.venv/bin/python desktop/scripts/check_macos_release_preflight.py \
  --app-sign-identity "Developer ID Application: WeisileEDU" \
  --installer-sign-identity "Developer ID Installer: WeisileEDU" \
  --notary-keychain-profile VSLE_NOTARY \
  --json-report docs/desktop/evidence/macos-release-preflight.json \
  --report docs/desktop/evidence/macos-release-preflight.md
```

Do not proceed to classroom artifact signing unless
`docs/desktop/evidence/macos-release-preflight.md` says `Ready: yes`.

After building a signed macOS release artifact, run the checked notarization
helper with an Apple notarytool keychain profile:

```bash
./.venv/bin/python desktop/scripts/notarize_macos_release.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --keychain-profile VSLE_NOTARY
```

The helper submits the signed artifact with `xcrun notarytool`, staples and
validates the app bundle with `xcrun stapler`, rezips the stapled app, and only
then records `notarized: true` in the manifest. Do not pass Apple passwords on
the command line or commit notarization credentials.

After notarization, build the signed classroom `.pkg` installer:

```bash
./.venv/bin/python desktop/scripts/build_macos_pkg.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --sign-identity "Developer ID Installer: WeisileEDU"
```

The package helper refuses unsigned or unnotarized manifests, runs `pkgbuild`
and `productbuild`, and records the signed installer fields in the manifest.
The macOS install smoke gate rejects release-artifact evidence if
`installer_pkg`, `installer_sha256`, or `installer_signed: true` is missing.

## Install Verification

On a clean macOS machine with no developer tools and no custom Python:

1. Install the package.
2. Log out and back in, or reboot.
3. Confirm the LaunchAgent is loaded.
4. Confirm `ws://127.0.0.1:20111/scratch/bt` accepts ScratchAI connections.
5. Confirm the health endpoint reports healthy within 10 seconds.
6. Confirm logs are written under `~/Library/Logs/WeisileLink`.
7. Export diagnostics and confirm redaction.
8. Uninstall and confirm the LaunchAgent is unloaded.

## Install Smoke Evidence Gate

Before macOS support can be marked classroom ready, collect evidence from the
installed release artifact, not from a developer checkout. The evidence JSON
for official-firmware Bluetooth compatibility must include:

```json
{
  "release_artifact_manifest": "desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json",
  "installed_from_release_artifact": true,
  "started_after_reboot": true,
  "scratch_link_endpoint_ok": true,
  "official_firmware_bt_real_ev3_ok": true
}
```

Run the gate from the repository root:

```bash
python scripts/run_desktop_install_smoke.py \
  --evidence docs/desktop/evidence/macos-install-smoke.json \
  --report docs/desktop/evidence/macos-install-smoke.md
```

The report must say `Classroom ready: yes` before macOS official firmware
Bluetooth compatibility can be shown as available to teachers.

For the no-WiFi full VSLE Bluetooth classroom path, collect release-artifact
evidence from the same clean-machine install with an ev3dev EV3 running
`vsle_ev3_server.py` over `vsle-bluetooth`:

```bash
cp docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json \
  docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json
```

```json
{
  "installed_from_release_artifact": true,
  "started_after_reboot": true,
  "scratch_link_endpoint_ok": true,
  "vsle_bluetooth_real_ev3_ok": true
}
```

The `release_artifact_manifest` file must be the manifest generated for the
installed artifact. For macOS, `scripts/run_desktop_install_smoke.py` requires
that manifest to record `signed: true`, `notarized: true`, a bundled
self-contained executable, and the bundled native Bluetooth adapter before the
release-artifact evidence can pass.

Run:

```bash
python scripts/run_desktop_install_smoke.py \
  --mode vsle-bluetooth \
  --evidence docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json \
  --report docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.md
```

Only after this gate passes may the full VSLE Bluetooth smoke evidence set
`installed_from_release_artifact: true`.

## Official Firmware Bluetooth

macOS official firmware Bluetooth compatibility must use Apple-supported
Bluetooth Classic APIs or a verified Scratch Link-derived native adapter.
Python stdlib RFCOMM is not a supported macOS implementation path.

The native adapter source and evidence requirements live in
`desktop/macos/native/README.md`. The mode remains unavailable until the install
smoke gate records real official-firmware EV3 Bluetooth evidence.
