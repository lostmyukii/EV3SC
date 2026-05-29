# WeisileLink Desktop Windows Install

This document defines the required Windows behavior for the WeisileLink Desktop
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

The classroom artifact is a signed installer. MSI is preferred for school IT
deployment, and a signed EXE bootstrapper may be used for direct trials. The
installer must place WeisileLink under either:

- `%ProgramFiles%\VSLE\WeisileLink` for machine-wide installs; or
- `%LocalAppData%\Programs\VSLE\WeisileLink` for per-user installs.

The release must include a bundled runtime or self-contained executable. It must
not require teacher-installed Python.

Build the self-contained Windows executable on a Windows build host first:

```bash
./.venv/bin/python desktop/scripts/build_weisilelink_executable.py \
  --target windows \
  --output desktop/build/windows \
  --clean
```

The expected output is `desktop/build/windows/WeisileLink.exe`. The helper
refuses to build the Windows target from macOS or Linux so release evidence
does not confuse a local developer binary with a Windows classroom artifact.

The checked packager for the Windows zip artifact is
`desktop/scripts/build_release_artifacts.py`. It writes the package directory,
release zip, and manifest under `desktop/release/`:

```bash
./.venv/bin/python desktop/scripts/build_release_artifacts.py windows \
  --executable desktop/build/windows/WeisileLink.exe \
  --output desktop/release/windows \
  --version 0.1.0 \
  --allow-unsigned
```

`--allow-unsigned` is only for internal smoke testing. A classroom Windows
artifact must be signed, wrapped in the approved installer shape, and then
verified on a clean machine.

## Release Preflight

Before Windows release evidence is collected, run the guarded preflight from the
repository root. The signing identity can be passed with `--sign-identity` or
`WEISILE_WINDOWS_SIGN_IDENTITY`; the RFC3161 timestamp server can be passed with
`--timestamp-url` or `WEISILE_WINDOWS_TIMESTAMP_URL`:

```bash
./.venv/bin/python desktop/scripts/check_windows_release_preflight.py \
  --executable desktop/build/windows/WeisileLink.exe \
  --sign-identity "VSLE Windows Code Signing" \
  --timestamp-url https://timestamp.digicert.com \
  --json-report docs/desktop/evidence/windows-release-preflight.json \
  --report docs/desktop/evidence/windows-release-preflight.md
```

The report must say `Ready: yes` before the signed Windows artifact chain can
run. On a Windows build host, `desktop/scripts/build_release_artifacts.py`
signs the copied `WeisileLink/WeisileLink.exe` with `signtool sign`, verifies
it with `signtool verify`, and writes the signing metadata into the manifest.
The current macOS evidence remains blocked because this machine is not the
Windows signing host and no Windows executable or signing inputs are
configured. The preflight Markdown includes an "Executable Build Commands"
section with the target-host PyInstaller command to generate
`desktop/build/windows/WeisileLink.exe` before signing.

After the preflight is ready, run:

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
`windows-release-flow.md`. It records `blocked-preflight` and executes no
release commands unless `check_windows_release_preflight.py` reports
`Ready: yes`.

On the Windows build host, the checked PowerShell handoff script
`desktop/windows/build_release.ps1` runs the executable build, release
preflight, and guarded release flow in one signed chain:

```powershell
$env:WEISILE_WINDOWS_SIGN_IDENTITY = "VSLE Windows Code Signing"
$env:WEISILE_WINDOWS_TIMESTAMP_URL = "https://timestamp.digicert.com"
.\desktop\windows\build_release.ps1
```

The script is intentionally Windows-only, refuses missing signing inputs, and
does not use `--allow-unsigned`.

## Startup and Firewall Defaults

The first classroom release should support per-user startup because admin rights
are not guaranteed. A machine-wide Windows Service path may be documented for
IT-managed labs.

The default install must bind only to `127.0.0.1`; it must not open LAN firewall
rules. LAN access requires explicit teacher configuration and pairing-token
setup.

## Install Verification

On a clean Windows machine with no developer tools and no custom Python:

1. Install the package.
2. Reboot or log out and back in.
3. Confirm the startup task or service starts WeisileLink.
4. Confirm `ws://127.0.0.1:20111/scratch/bt` accepts ScratchAI connections.
5. Confirm the health endpoint reports healthy within 10 seconds.
6. Confirm logs are written under the documented VSLE log directory.
7. Export diagnostics and confirm redaction.
8. Uninstall and confirm startup entries and service files are removed.

## Install Smoke Evidence Gate

Before Windows support can be marked classroom ready, collect evidence from the
installed release artifact, not from a developer checkout. The evidence JSON
for official-firmware Bluetooth compatibility must include:

```json
{
  "release_artifact_manifest": "desktop/release/windows/WeisileLink-windows-0.1.0-manifest.json",
  "installed_from_release_artifact": true,
  "started_after_reboot": true,
  "scratch_link_endpoint_ok": true,
  "official_firmware_bt_real_ev3_ok": true
}
```

Run the gate from the repository root:

```bash
python scripts/run_desktop_install_smoke.py \
  --evidence docs/desktop/evidence/windows-install-smoke.json \
  --report docs/desktop/evidence/windows-install-smoke.md
```

The report must say `Classroom ready: yes` before Windows official firmware
Bluetooth compatibility can be shown as available to teachers.

For the no-WiFi full VSLE Bluetooth classroom path, collect release-artifact
evidence from the same clean-machine install with an ev3dev EV3 running
`vsle_ev3_server.py` over `vsle-bluetooth`:

```powershell
Copy-Item docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json `
  docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.json
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
installed artifact. For Windows, `scripts/run_desktop_install_smoke.py`
requires that manifest to record `signed: true` and a bundled self-contained
executable before the release-artifact evidence can pass.

Run:

```bash
python scripts/run_desktop_install_smoke.py \
  --mode vsle-bluetooth \
  --evidence docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.json \
  --report docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.md
```

Only after this gate passes may the full VSLE Bluetooth smoke evidence set
`installed_from_release_artifact: true`.

## Official Firmware Bluetooth

Windows official firmware Bluetooth compatibility must use a native adapter
based on Windows-supported Bluetooth Classic APIs such as WinRT or .NET
Bluetooth APIs. Python stdlib RFCOMM is not a supported Windows path.

The native adapter source and evidence requirements live in
`desktop/windows/native/README.md`. The mode remains unavailable until the
install smoke gate records real official-firmware EV3 Bluetooth evidence.
