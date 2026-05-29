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

The checked packager for the Windows zip artifact is
`desktop/scripts/build_release_artifacts.py`. It writes the package directory,
release zip, and manifest under `desktop/release/`:

```bash
./.venv/bin/python desktop/scripts/build_release_artifacts.py windows \
  --executable path/to/WeisileLink.exe \
  --output desktop/release/windows \
  --version 0.1.0 \
  --allow-unsigned
```

`--allow-unsigned` is only for internal smoke testing. A classroom Windows
artifact must be signed, wrapped in the approved installer shape, and then
verified on a clean machine.

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
