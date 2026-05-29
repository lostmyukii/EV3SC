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

For macOS, notarize the signed artifact before collecting clean-machine
evidence:

```bash
./.venv/bin/python desktop/scripts/notarize_macos_release.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --keychain-profile VSLE_NOTARY
```

The notarization helper uses `xcrun notarytool` and `xcrun stapler`; it updates
the manifest to `notarized: true` only after stapler validation succeeds.

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
