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

The installer registers a per-user LaunchAgent named `cn.vsle.weisile-link`.
The LaunchAgent starts WeisileLink on login, keeps it alive, binds to
`127.0.0.1`, and writes logs to `~/Library/Logs/WeisileLink`.

## Signing and Notarization

Every executable, helper, app bundle, and package must be signed before
external classroom distribution. macOS classroom packages must be notarized
before non-developer distribution.

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

## Official Firmware Bluetooth

macOS official firmware Bluetooth compatibility must use Apple-supported
Bluetooth Classic APIs or a verified Scratch Link-derived native adapter.
Python stdlib RFCOMM is not a supported macOS implementation path.
