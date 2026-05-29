# WeisileLink Desktop Assets

This directory contains the checked-in desktop distribution assets for
WeisileLink macOS and Windows packages.

The files in this directory are release scaffolding and validation inputs. They
do not by themselves produce a signed classroom package. A classroom release is
complete only after a bundled runtime or self-contained executable is built,
signed, installed on clean machines, verified after reboot/login, and tested
through diagnostics export and uninstall.

## Modes

- Full VSLE mode: EV3 boots ev3dev and runs `vsle_ev3_server.py`.
- Official firmware Bluetooth compatibility mode: EV3 keeps official LEGO
  firmware and connects over Bluetooth Classic for the supported Basic Pack.

## Defaults

- Bind WeisileLink to `127.0.0.1`.
- Expose Scratch Link compatible JSON-RPC on port `20111`.
- Expose Trainer WebSocket routes on port `8766`.
- Use `wifi` as the default transport.
- Do not open LAN firewall rules from default installer scripts.

## Validation

Run:

```bash
./.venv/bin/python -m pytest tests/test_desktop_packaging.py -v
desktop/scripts/validate_desktop_assets.py
```

## Release Artifact Packaging

`desktop/scripts/build_release_artifacts.py` creates checked release artifact
folders, zip files, and manifests under `desktop/release/` from an already
built self-contained WeisileLink executable.

Unsigned artifacts are blocked by default. Use `--allow-unsigned` only for
internal smoke testing before signing, notarization, and clean-machine evidence:

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

Classroom release status still requires signed artifacts, macOS notarization,
and clean-machine install smoke evidence from the generated artifact.

Before running the real macOS release flow, check local prerequisites without
writing release artifacts or credentials into git:

```bash
./.venv/bin/python desktop/scripts/check_macos_release_preflight.py \
  --executable path/to/WeisileLink \
  --native-adapter desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter \
  --app-sign-identity "Developer ID Application: WeisileEDU" \
  --installer-sign-identity "Developer ID Installer: WeisileEDU" \
  --notary-keychain-profile VSLE_NOTARY \
  --json-report docs/desktop/evidence/macos-release-preflight.json \
  --report docs/desktop/evidence/macos-release-preflight.md
```

The preflight report must say `Ready: yes` before attempting the signed app,
notarization, and signed installer package chain.

After building a signed macOS artifact, notarize and staple it with an Apple
notarytool keychain profile. Do not pass Apple ID passwords on the command
line or store them in this repository:

```bash
./.venv/bin/python desktop/scripts/notarize_macos_release.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --keychain-profile VSLE_NOTARY
```

The script updates the manifest to `notarized: true` only after
`xcrun notarytool submit`, `xcrun stapler staple`, and
`xcrun stapler validate` all succeed.

Then build the signed classroom installer package from the signed and
notarized app manifest:

```bash
./.venv/bin/python desktop/scripts/build_macos_pkg.py \
  --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json \
  --sign-identity "Developer ID Installer: WeisileEDU"
```

The package helper writes `installer_pkg`, `installer_sha256`, and
`installer_signed: true` into the manifest. The install smoke gate requires
those fields for macOS release evidence.
