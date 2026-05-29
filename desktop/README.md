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

Build that executable on the target OS before packaging. Windows executables
must be built on a Windows host; the helper refuses cross-target Windows builds
from macOS or Linux:

```bash
./.venv/bin/python desktop/scripts/build_weisilelink_executable.py \
  --target windows \
  --output desktop/build/windows \
  --clean
```

The expected Windows output is
`desktop/build/windows/WeisileLink.exe`.

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
writing release artifacts or credentials into git. After running
`desktop/macos/native/build.sh` and building the WeisileLink binary, the
preflight can auto-detect `desktop/build/macos/WeisileLink` and
`desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter`;
it also auto-detects a unique Developer ID Application and unique Developer ID
Installer identity from the macOS keychain. Pass `--executable`,
`--native-adapter`, `--app-sign-identity`, or `--installer-sign-identity` only
when using a nonstandard path or when multiple matching identities are present.
The notarytool keychain profile can be passed with `--notary-keychain-profile`
or exported as `WEISILE_NOTARY_KEYCHAIN_PROFILE` so Apple account details stay
outside the repository and command history:

```bash
./.venv/bin/python desktop/scripts/check_macos_release_preflight.py \
  --app-sign-identity "Developer ID Application: WeisileEDU" \
  --installer-sign-identity "Developer ID Installer: WeisileEDU" \
  --notary-keychain-profile VSLE_NOTARY \
  --json-report docs/desktop/evidence/macos-release-preflight.json \
  --report docs/desktop/evidence/macos-release-preflight.md
```

The preflight report must say `Ready: yes` before attempting the signed app,
notarization, and signed installer package chain.

When the preflight is ready, run the guarded macOS release chain with:

```bash
./.venv/bin/python desktop/scripts/run_macos_release_flow.py \
  --preflight-json-report docs/desktop/evidence/macos-release-preflight.json \
  --preflight-report docs/desktop/evidence/macos-release-preflight.md \
  --json-report docs/desktop/evidence/macos-release-flow.json \
  --report docs/desktop/evidence/macos-release-flow.md \
  --output desktop/release/macos \
  --version 0.1.0
```

The runner stops before signing if `check_macos_release_preflight.py` does not
report `Ready: yes`.

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

For Windows, run the prerequisite preflight before collecting clean-machine
evidence. After building a self-contained `WeisileLink.exe`, pass the Windows
code-signing identity with `--sign-identity` or
`WEISILE_WINDOWS_SIGN_IDENTITY`, and pass the RFC3161 timestamp server with
`--timestamp-url` or `WEISILE_WINDOWS_TIMESTAMP_URL`:

```bash
./.venv/bin/python desktop/scripts/check_windows_release_preflight.py \
  --executable desktop/build/windows/WeisileLink.exe \
  --sign-identity "VSLE Windows Code Signing" \
  --timestamp-url https://timestamp.digicert.com \
  --json-report docs/desktop/evidence/windows-release-preflight.json \
  --report docs/desktop/evidence/windows-release-preflight.md
```

On a Windows build host, the packager signs the copied
`WeisileLink/WeisileLink.exe` with `signtool sign`, verifies it with
`signtool verify`, and records the signing metadata in the release manifest.
The current macOS evidence is still expected to block because this machine is
not the Windows signing host and no Windows executable or signing inputs are
configured.

Once the Windows preflight says `Ready: yes`, use the guarded runner:

```bash
./.venv/bin/python desktop/scripts/run_windows_release_flow.py \
  --preflight-json-report docs/desktop/evidence/windows-release-preflight.json \
  --preflight-report docs/desktop/evidence/windows-release-preflight.md \
  --json-report docs/desktop/evidence/windows-release-flow.json \
  --report docs/desktop/evidence/windows-release-flow.md \
  --output desktop/release/windows \
  --version 0.1.0
```

The runner refuses to call the Windows packager unless
`check_windows_release_preflight.py` reports `Ready: yes`.
