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
