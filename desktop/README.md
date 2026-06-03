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

## Classroom Profiles And Credentials

The Desktop profile layer lives in `weisile_link.desktop.profiles`. It stores
only non-secret classroom profile fields in `config.json`: `brick_id`, display
name, transport, Bluetooth address, `token_ref`, and last seen time. The raw EV3
runtime token returned by `auth.claim` is stored outside the visible config:

- macOS: Keychain item referenced as `keychain:vsle/<brick_id>`.
- Windows: Credential Manager item referenced as `wincred:vsle/<brick_id>`.

`save_claimed_profile()` accepts an EV3 `auth.claim` result, writes the token to
the platform credential backend, and upserts the non-secret profile. At startup,
`resolve_profile_environment()` reads the token from the credential backend and
builds the runtime environment for `vsle-bluetooth`.

Daily startup uses the saved profile instead of teacher-entered environment
variables:

```bash
python -m weisile_link desktop-start \
  --native-adapter /Applications/WeisileLink.app/Contents/Resources/native/WeisileEV3BluetoothAdapter
```

`desktop-start` loads the default profile from `config.json`, retrieves the raw
token from Keychain or Credential Manager, starts WeisileLink on
`127.0.0.1:20111` and Trainer on `127.0.0.1:8766`, and adds the configured
ScratchAI site origin to the WebSocket allowlist. Its startup JSON is safe to
show in a classroom UI: it reports one of `ready`, `starting`, `needs_pairing`,
or `needs_attention` without printing the pairing token.

To run the automatic EV3 ready check without starting the long-running local
bridge:

```bash
python -m weisile_link desktop-start --check-only
```

`ready` means the saved credential authenticated and at least one fresh EV3
sensor frame arrived. `needs_pairing` means no usable credential exists or the
token was rotated. `needs_attention` means the profile exists but the Desktop
app should open guided diagnostics for Bluetooth, EV3 service, or sensor stream
failure.

For fleet setup, import a non-secret classroom roster before or after pairing:

```bash
python -m weisile_link desktop-roster \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  import \
  --input classroom-roster.json
```

The roster can contain `classroom_id`, `scratchai_url`, and `devices[]` entries
with `brick_id`, `label`, `ev3_bt`, and `expected_sensors` for `S1`-`S4`. It
must not contain raw pairing tokens. When a paired profile matches a roster
device, `desktop-start --check-only`, `desktop-supervise`, and
`desktop-diagnostics` use the saved `expected_sensors` layout to require the
expected real sensor ports before reporting `ready`.

To create a non-secret roster handoff from a configured teacher computer:

```bash
python -m weisile_link desktop-roster \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  export \
  --output classroom-roster.json
```

Fleet maintenance commands keep the same safe-output rule:

```bash
python -m weisile_link desktop-device \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  list
```

```bash
python -m weisile_link desktop-device \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  select \
  --brick-id VSLE-EV3-583C
```

`desktop-device list` prints token-free paired device summaries, including
which EV3 is the current default. `desktop-device select` changes
`default_brick_id` so the next `desktop-start` or `desktop-supervise` launch
uses that classroom EV3 without editing `config.json`. App shells can also pass
`--brick-id` to `desktop-start` or `desktop-supervise` for a one-time selection.

Before treating fleet profile handling as ready for signed clean-machine
package evidence, run the simulated 10-device rehearsal gate:

```bash
./.venv/bin/python scripts/run_desktop_fleet_rehearsal.py
```

The gate imports a non-secret roster, pairs 10 simulated classroom EV3 profiles,
selects each profile, runs Desktop startup and supervisor checks for each one,
and writes token-safe evidence to
`docs/desktop/evidence/desktop-fleet-rehearsal.json` plus
`docs/desktop/DESKTOP_FLEET_REHEARSAL.md`. It is simulated-only evidence and
does not replace signed release-artifact install smoke evidence or real EV3
Bluetooth evidence.

```bash
python -m weisile_link desktop-device \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  rename \
  --brick-id VSLE-EV3-583C \
  --name "Table 1 EV3"
```

```bash
python -m weisile_link desktop-token \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  rotate \
  --brick-id VSLE-EV3-583C \
  --native-adapter /Applications/WeisileLink.app/Contents/Resources/native/WeisileEV3BluetoothAdapter
```

Token rotation authenticates with the current secure credential, asks the EV3
to persist a new runtime token, then stores that token back into Keychain or
Credential Manager. The command output never prints the old or new token.

If a local credential is lost, Desktop must not pretend it can recover the raw
token. The guarded recovery command explains the required re-claim/USB support
path, and only removes the stale local profile when explicitly confirmed:

```bash
python -m weisile_link desktop-token \
  --config "$HOME/Library/Application Support/VSLE/WeisileLink/config.json" \
  recover \
  --brick-id VSLE-EV3-583C \
  --confirm-delete-profile
```

The packaged macOS/Windows shell should call the one-click supervisor instead
of asking teachers to run the bridge command directly:

```bash
python -m weisile_link desktop-supervise \
  --native-adapter /Applications/WeisileLink.app/Contents/Resources/native/WeisileEV3BluetoothAdapter \
  --open-scratchai
```

`desktop-supervise` performs the teacher-facing sequence:

1. Load the saved profile and secure token reference.
2. Run an EV3 ready-check using the stored credential.
3. Start a child `desktop-start` process without placing the token on the
   command line.
4. Wait for local ports `20111` and `8766`.
5. Open the configured ScratchAI URL when the bridge is ready.
6. Return redacted JSON for the future Desktop UI.

If no profile or credential exists, the supervisor returns `needs_pairing` and
does not start the bridge. If the EV3 ready-check or local port checks fail, it
returns `needs_attention` so the UI can open guided diagnostics.

For support export, use the shared diagnostics command:

```bash
python -m weisile_link desktop-diagnostics \
  --native-adapter /Applications/WeisileLink.app/Contents/Resources/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter \
  --output "$HOME/Library/Application Support/VSLE/WeisileLink/diagnostics/support.json"
```

It checks the saved profile, secure credential, local ports, native adapter,
EV3 ready-check, and sensor stream. The generated bundle is redacted by
default and is safe to attach to a support ticket.

The checked macOS LaunchAgent and Windows startup/service assets already call
`desktop-supervise` with localhost ports. The macOS asset passes the bundled
native adapter from
`WeisileLink.app/Contents/Resources/native/WeisileEV3BluetoothAdapter.app`.
The Windows startup script passes a bundled adapter only when
`native\WeisileEV3BluetoothAdapter.exe` exists, because the Windows native
RFCOMM adapter remains a separate classroom readiness gate.

The minimal first-run pairing command is:

```bash
python -m weisile_link desktop-pair \
  --ev3-bt A0:E6:F8:19:58:3C \
  --claim-code 12345678 \
  --native-adapter /Applications/WeisileLink.app/Contents/Resources/native/WeisileEV3BluetoothAdapter
```

It calls EV3 `auth.claim`, saves the secure profile, reconnects from the saved
credential, and returns redacted JSON with `paired`, `ready`, and
`ready_check` fields. A ready-check failure exits non-zero so the future UI can
open guided diagnostics.

## Validation

Run:

```bash
./.venv/bin/python -m pytest tests/test_desktop_packaging.py -v
./.venv/bin/python -m pytest weisile-link/tests/test_desktop_profiles.py -v
./.venv/bin/python -m pytest weisile-link/tests/test_desktop_roster.py -v
./.venv/bin/python -m pytest weisile-link/tests/test_desktop_maintenance.py -v
./.venv/bin/python -m pytest weisile-link/tests/test_desktop_pairing.py -v
./.venv/bin/python -m pytest tests/test_desktop_fleet_rehearsal.py -v
./.venv/bin/python scripts/run_desktop_fleet_rehearsal.py
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
report `Ready: yes`. A blocked run writes `Preflight Blocking Checks` and
`Release Commands After Preflight Passes` sections to
`docs/desktop/evidence/macos-release-flow.md`, so the next operator can see the
missing Developer ID/notary inputs and the exact commands that will run once
preflight passes.

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
configured. The blocked preflight report includes an "Executable Build
Commands" section so a Windows build host can produce the missing
`desktop/build/windows/WeisileLink.exe` without relying on out-of-band notes.

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

On a Windows build host, `desktop/windows/build_release.ps1` runs the target
executable build, preflight, and guarded release flow in order. It requires
`WEISILE_WINDOWS_SIGN_IDENTITY` and `WEISILE_WINDOWS_TIMESTAMP_URL` or matching
parameters, and never passes `--allow-unsigned`:

```powershell
$env:WEISILE_WINDOWS_SIGN_IDENTITY = "VSLE Windows Code Signing"
$env:WEISILE_WINDOWS_TIMESTAMP_URL = "https://timestamp.digicert.com"
.\desktop\windows\build_release.ps1
```
