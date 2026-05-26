# WeisileLink Desktop Diagnostics

Diagnostics help teachers and support staff understand a local EV3 connection
problem without exposing student data or secrets.

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

## Bundle Contents

A diagnostic export should include:

- WeisileLink version and build channel.
- Operating system name, version, and architecture.
- Active install mode: per-user, service, or app bundle.
- Config summary with secrets redacted.
- Health payload: service state, ScratchAI client count, active transport,
  EV3 connection state, sensor freshness, and recent error codes.
- Recent logs from the documented VSLE log directory.
- Packaging metadata such as signing/notarization status when available.

## Redaction Rules

Diagnostics redact by default:

- `WEISILE_PAIRING_TOKEN` values.
- API keys and provider credentials.
- Bluetooth addresses unless a teacher explicitly includes device identifiers.
- Training labels longer than 64 characters.
- Raw student sensor samples and raw AI Quest datasets.
- Oversized payloads that could contain copied project data.

## Teacher Workflow

The status UI or Start Menu/menu-bar action should offer one-click diagnostics
export. The exported bundle should be suitable for attaching to support tickets
without requiring command-line use.

## Verification

Every desktop release must export diagnostics on a clean macOS and Windows
machine. The verifier must inspect the resulting bundle and confirm secrets,
student raw data, and oversized labels are absent by default.
