# EV3 Classroom Provisioning Design

This document designs the classroom-ready path for copying EV3SC to many
teaching EV3 bricks and teacher computers without repeating developer terminal
steps.

The target daily experience is:

1. Power on the EV3.
2. Open WeisileLink Desktop on macOS or Windows.
3. Click the paired EV3.
4. Open ScratchAI.
5. EV3 sensor values are already flowing.

Manual USB token recovery, terminal startup commands, and repeated manual
sensor tests remain support tools only. They are not part of the normal lesson
flow.

## Product Shape

The classroom system should ship as three artifacts.

| Artifact | Audience | Purpose |
| --- | --- | --- |
| EV3 Golden SD Image | Lab prep / IT / curriculum team | Boots ev3dev with EV3SC server, Bluetooth RFCOMM, systemd autostart, first-boot identity, and self-checks already installed. |
| WeisileLink Desktop Installer | Teacher computer | Installs the local Scratch Link-compatible bridge, native Bluetooth adapter, startup entry, pairing wizard, credential storage, diagnostics, and one-click ScratchAI launch. |
| Classroom Roster Package | School / teacher | Optional device inventory used to label EV3s, pre-import known devices, and avoid pairing the wrong brick in a classroom. |

## Non-Negotiable Design Principles

1. The browser never talks to EV3 Bluetooth directly.
   ScratchAI only talks to `ws://127.0.0.1:20111/scratch/bt`.

2. A cloned SD card must not clone a shared classroom token.
   The golden image must be unprovisioned. Each EV3 generates its own
   `brick_id`, pairing token, and claim code on first boot.

3. Teachers should not see or copy raw pairing tokens.
   WeisileLink Desktop obtains and stores tokens through a pairing wizard.
   USB token recovery remains a support-only fallback.

4. Normal startup performs automatic health checks, not manual tests.
   The teacher sees "Ready" or "Needs attention". Detailed sensor checks are
   only opened when the automatic check fails.

5. Windows is a first-class target, not a later port.
   The Windows package needs its own signed installer, native Bluetooth Classic
   adapter, Credential Manager storage, startup task/service, and clean-machine
   evidence.

## EV3 Golden SD Image

### Base Image Contents

The EV3 SD card image should include:

- ev3dev Stretch base image verified for EV3.
- EV3SC-owned `ev3-firmware/vsle_ev3_server.py`.
- `vsle-ev3-server.service` enabled at boot.
- Python dependencies already available offline:
  - `ev3dev2`
  - `websockets`
- Bluetooth RFCOMM listener enabled for full VSLE mode.
- A first-boot provisioning service.
- A local diagnostic CLI under `/home/robot/vsle-tools/`.
- A version manifest at `/home/robot/.config/vsle/manifest.json`.

Current install script alignment:

- `ev3-firmware/scripts/install_ev3_autostart.sh` already installs the server,
  generates `WEISILE_PAIRING_TOKEN` if missing, and enables systemd.
- Classroom provisioning should wrap this into an offline image-build step so
  teachers do not run it manually on every EV3.

### First-Boot Provisioning

The golden image must ship without a provisioned identity file. On first boot,
`vsle-firstboot.service` should:

1. Generate a stable `brick_id`, for example `VSLE-EV3-4655`.
2. Generate a long random runtime pairing token.
3. Generate a short claim code, for example 8 digits or 4 classroom-safe words.
4. Write `/home/robot/.config/vsle/ev3.env` with mode `0600`.
5. Write `/home/robot/.config/vsle/device.json`.
6. Enable the `vsle-ev3-server.service`.
7. Display the EV3 name and claim code on the EV3 LCD.
8. Keep Bluetooth visible under a predictable name for first pairing, for
   example `VSLE-EV3-4655`.

The claim code is not the runtime token. It is an onboarding secret used only
to let a nearby teacher computer claim this brick and receive the long token.

### EV3 Pairing APIs

The EV3 server should support three authentication operations:

| Method | Purpose |
| --- | --- |
| `auth.claim` | First-run desktop wizard sends claim code and host identity; EV3 returns the runtime pairing token and device manifest over the Bluetooth RFCOMM channel. |
| `auth.pair` | Existing runtime authentication using the long token before commands and sensor stream are accepted. |
| `auth.rotate` | Teacher or support tool rotates the token and invalidates old desktop credentials. |

Recommended `auth.claim` request:

```json
{
  "id": "claim-1",
  "method": "auth.claim",
  "params": {
    "claim_code": "12345678",
    "host_id": "teacher-macbook-01",
    "host_public_key": "base64...",
    "app_version": "0.1.0"
  }
}
```

Recommended response:

```json
{
  "type": "ack",
  "id": "claim-1",
  "ok": true,
  "result": {
    "brick_id": "VSLE-EV3-4655",
    "brick_name": "Class EV3 01",
    "transport": "vsle-bluetooth",
    "ev3_bt": "A0:E6:F8:19:58:3C",
    "pairing_token": "<long token>",
    "capabilities": {
      "sensors": ["color", "ultrasonic", "gyro", "touch"],
      "motors": ["A", "B", "C", "D"],
      "ai_quest": true
    }
  }
}
```

The token may be encrypted to the host public key before it is returned. If the
first implementation does not encrypt it, it must still require physical
proximity, a one-time claim code, rate limiting, and local-only storage on the
teacher computer.

### Sensor Auto-Readiness

EV3 startup should not require the teacher to manually test every sensor.
Instead, the EV3 server should publish a compact readiness payload:

```json
{
  "type": "readiness",
  "brick_id": "VSLE-EV3-4655",
  "server_version": "0.1.0",
  "bluetooth": "listening",
  "sensors": {
    "S1": {"type": "color", "fresh": true},
    "S2": {"type": "ultrasonic", "fresh": true},
    "S3": {"type": "gyro", "fresh": true},
    "S4": {"type": "touch", "fresh": true}
  },
  "motors": {
    "A": {"present": true},
    "B": {"present": true}
  },
  "battery_v": 7.5
}
```

WeisileLink Desktop can then show "Ready" after it receives fresh sensor frames.
If a port is missing or stale, it opens a guided diagnosis instead of asking
the teacher to run developer commands.

## WeisileLink Desktop

### Daily Teacher Flow

The normal flow should be:

1. Teacher powers on EV3.
2. Teacher opens WeisileLink Desktop.
3. App auto-starts local bridge on `127.0.0.1:20111` and `127.0.0.1:8766`.
4. App reconnects to the last paired EV3.
5. App silently validates:
   - local port open
   - Bluetooth adapter available
   - EV3 authenticated
   - sensor stream observed
   - ScratchAI origin allowlist configured
6. Teacher clicks "Open ScratchAI".
7. Browser opens `http://101.42.92.6:18612/`.

The teacher should not have to choose environment variables, ports, Bluetooth
addresses, or tokens.

### First-Run Pairing Wizard

The first-run wizard should have five screens:

1. Welcome
   - Explain that EV3 must be powered on and showing its VSLE name/code.

2. Bluetooth Pairing
   - List EV3 Bluetooth devices.
   - If OS-level pairing is needed, deep-link to Bluetooth settings:
     - macOS: open Bluetooth settings.
     - Windows: open `ms-settings:bluetooth`.

3. Claim EV3
   - Select EV3 device.
   - Enter claim code from EV3 LCD or scan/import classroom roster QR.
   - Desktop sends `auth.claim`.

4. Save Credentials
   - macOS stores token in Keychain.
   - Windows stores token in Credential Manager.
   - Config file stores only non-secret fields: `brick_id`, friendly name,
     transport, Bluetooth address, last successful connection time.

5. Ready Check
   - Start WeisileLink using stored credential.
   - Subscribe to sensor stream.
   - Show "Ready for ScratchAI" when at least one fresh frame arrives.

### Stored Profiles

The desktop config should support multiple EV3s:

```json
{
  "default_brick_id": "VSLE-EV3-4655",
  "scratchai_url": "http://101.42.92.6:18612/",
  "profiles": [
    {
      "brick_id": "VSLE-EV3-4655",
      "name": "Class EV3 01",
      "transport": "vsle-bluetooth",
      "ev3_bt": "A0:E6:F8:19:58:3C",
      "token_ref": "keychain:vsle/VSLE-EV3-4655",
      "last_seen_at": "2026-06-03T06:00:00Z"
    }
  ]
}
```

No raw token belongs in this file.

### Desktop Health States

The app should reduce all complexity to four states:

| State | Meaning | Teacher action |
| --- | --- | --- |
| Ready | Local service running, EV3 authenticated, sensor stream fresh. | Open ScratchAI. |
| Starting | WeisileLink is launching or reconnecting. | Wait. |
| Needs Pairing | No credential exists or token was rotated. | Open pairing wizard. |
| Needs Attention | Service, Bluetooth, EV3 server, or sensor stream failed. | Open guided diagnostics. |

### Guided Diagnostics

Diagnostics should be teacher-safe and evidence-backed:

- Check local port `20111`.
- Check local port `8766`.
- Check whether another WeisileLink process owns the port.
- Check native adapter availability.
- Check Bluetooth OS pairing.
- Check EV3 `auth.pair`.
- Check latest sensor frame count and freshness.
- Check expected sensors by lesson profile.
- Export a redacted support bundle.

Diagnostics must redact:

- pairing tokens
- API keys
- raw student labels
- Bluetooth addresses unless teacher explicitly includes device identifiers
- oversized data rows

## macOS Packaging

macOS classroom packaging should be:

- signed and notarized `WeisileLink.app`
- signed `.pkg` installer
- bundled Python or self-contained executable
- bundled macOS native Bluetooth adapter
- LaunchAgent for per-user auto-start
- Keychain token storage
- menu bar or small window UI

Existing assets already point in this direction:

- `desktop/macos/install.sh`
- `desktop/macos/weisile-link.launchd.plist`
- `desktop/macos/native/WeisileEV3BluetoothAdapter.m`
- `desktop/scripts/run_macos_release_flow.py`
- `scripts/run_desktop_install_smoke.py`

Required next change: the app must expose the first-run pairing wizard and store
full VSLE Bluetooth credentials, not only developer environment variables.

## Windows Packaging

Windows must be designed as a first-class classroom target.

### Installer

Use one of:

- MSI for school IT deployment.
- Signed EXE bootstrapper for direct teacher trials.

The installer should place files under:

- `%ProgramFiles%\VSLE\WeisileLink` for machine-wide installs, or
- `%LocalAppData%\Programs\VSLE\WeisileLink` for per-user installs.

The classroom artifact must include:

- self-contained `WeisileLink.exe`
- Windows native Bluetooth adapter
- start menu shortcut
- optional desktop shortcut
- per-user Scheduled Task at logon
- optional Windows Service for IT-managed labs
- uninstall entry
- diagnostic export command

### Windows Native Bluetooth Adapter

Python stdlib Bluetooth is not supported on Windows. The Windows release needs
`WeisileEV3BluetoothAdapter.exe` behind the existing native byte stream
boundary.

Recommended implementation:

- .NET 8 or C++/WinRT executable.
- Uses Windows Bluetooth Classic / RFCOMM APIs.
- Speaks the same newline-delimited JSON adapter protocol as WeisileLink core:
  - `connect`
  - `send`
  - `recv`
  - `status`
  - `close`
- Supports `vsle-bluetooth` full VSLE byte stream.
- Keeps official-firmware Bluetooth as a separate limited compatibility mode.

The Windows app must not depend on:

- system Python
- pybluez
- developer checkout paths
- unsigned helper binaries

### Windows Credential and Config Storage

Recommended paths:

- Token: Windows Credential Manager.
- User config: `%LocalAppData%\VSLE\WeisileLink\config.json`.
- Logs: `%LocalAppData%\VSLE\WeisileLink\logs`.
- Diagnostics: `%LocalAppData%\VSLE\WeisileLink\diagnostics`.

Startup command should be generated by installer or app, not handwritten by the
teacher:

```powershell
WeisileLink.exe --profile "%LocalAppData%\\VSLE\\WeisileLink\\config.json"
```

### Windows Acceptance Gate

Windows is classroom ready only when this passes on a clean Windows machine:

1. Install signed MSI/EXE.
2. Reboot or log out/in.
3. WeisileLink starts automatically.
4. `ws://127.0.0.1:20111/scratch/bt` accepts connections.
5. Pairing wizard claims a real ev3dev EV3 over Bluetooth.
6. `vsle-bluetooth` receives real sensor frames.
7. ScratchAI public page reads S1-S4 sensors.
8. Diagnostic export redacts secrets.
9. Uninstall removes startup entries and app files.
10. `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth` accepts the
    evidence JSON with `desktop_diagnostics_export_ok: true`,
    `desktop_diagnostics_redaction_ok: true`,
    `desktop_diagnostics_bundle` pointing to the installed diagnostics export,
    and `vsle_bluetooth_sensor_ready: true`.

## Classroom Roster Package

For schools with many EV3 bricks, support an optional roster package:

```json
{
  "classroom_id": "school-a-room-302",
  "scratchai_url": "http://101.42.92.6:18612/",
  "devices": [
    {
      "brick_id": "VSLE-EV3-4655",
      "label": "EV3-01",
      "ev3_bt": "A0:E6:F8:19:58:3C",
      "expected_sensors": {
        "S1": "color",
        "S2": "ultrasonic",
        "S3": "gyro",
        "S4": "touch"
      }
    }
  ]
}
```

The roster must not contain raw runtime tokens by default. If a school wants
zero-entry pairing, issue an encrypted roster sealed to a teacher/admin
passphrase or school public key.

The first supported Desktop roster entry point is:

```bash
python -m weisile_link desktop-roster --config path/to/config.json import \
  --input classroom-roster.json
python -m weisile_link desktop-roster --config path/to/config.json export \
  --output classroom-roster.json
```

Imported roster data is stored as non-secret config. When a roster device
matches a paired profile, Desktop ready checks use `expected_sensors` to
require the expected S1-S4 sensor ports before reporting `Ready`.

The first maintenance entry points are:

```bash
python -m weisile_link desktop-device --config path/to/config.json list
python -m weisile_link desktop-device --config path/to/config.json select \
  --brick-id VSLE-EV3-4655
python -m weisile_link desktop-device --config path/to/config.json rename \
  --brick-id VSLE-EV3-4655 --name "Table 1 EV3"
python -m weisile_link desktop-token --config path/to/config.json rotate \
  --brick-id VSLE-EV3-4655 --native-adapter path/to/native-adapter
python -m weisile_link desktop-token --config path/to/config.json recover \
  --brick-id VSLE-EV3-4655 --confirm-delete-profile
```

`desktop-device list` returns token-free paired profile summaries and marks the
current default EV3. `desktop-device select` updates `default_brick_id`, so
`desktop-start` and `desktop-supervise` launch the selected classroom brick
without manual JSON editing. Both startup commands may also accept `--brick-id`
for a one-time launch override.

Lost-token recovery is intentionally guarded: Desktop cannot recover a raw
token from config, so it preserves roster data, removes only the stale local
profile after explicit confirmation, and requires re-claim or USB support
recovery before lessons continue.

## Migration Workflow For Many EV3 Bricks

### Lab Prep

1. Build the unprovisioned EV3 golden image.
2. Flash SD cards.
3. Insert each SD card into one EV3.
4. Boot once.
5. EV3 generates unique identity and claim code.
6. Attach a physical label matching the displayed `brick_id`.
7. Optionally export a non-secret classroom roster.

### Teacher Computer Setup

1. Install WeisileLink Desktop.
2. Open pairing wizard.
3. Select or import classroom roster.
4. Pair EV3 by selecting Bluetooth device and entering claim code.
5. App stores token securely.
6. App runs automatic readiness check.
7. Teacher opens ScratchAI.

### Daily Class

1. Power on EV3s.
2. Open WeisileLink Desktop.
3. Wait for Ready.
4. Open ScratchAI.
5. Start lesson.

No USB and no terminal are needed in the daily class path.

## Required Implementation Milestones

### Milestone 1: EV3 Golden Image Builder

Deliverables:

- `scripts/build_ev3_golden_image.sh` or equivalent documented image builder.
- Offline wheel/dependency bundle.
- `vsle-firstboot.service`.
- First-boot identity/token/claim-code generation.
- EV3 LCD claim-code display.
- Reset/provisioning CLI:
  - `vsle-reset-identity`
  - `vsle-show-pairing-code`
  - `vsle-health`

Acceptance:

- Flash a new SD card, boot EV3, and see VSLE claim code without SSH.
- `vsle-ev3-server.service` is active after reboot.
- No shared token exists across two cloned SD cards.

### Milestone 2: Desktop Pairing Wizard

Deliverables:

- Profile store.
- Keychain/Credential Manager token storage.
- `auth.claim` support in WeisileLink and EV3 server.
- One-click start/reconnect.
- One-click ScratchAI launch.
- Redacted diagnostic export.

Acceptance:

- Pair a fresh EV3 without USB.
- Restart Desktop and reconnect without re-entering token.
- ScratchAI reads S1-S4 sensors.

### Milestone 3: macOS Classroom Package

Deliverables:

- signed/notarized app
- signed `.pkg`
- bundled native adapter
- LaunchAgent auto-start
- clean-machine smoke evidence

Acceptance:

- `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth` passes from
  release-artifact evidence that includes a default-redacted
  `desktop_diagnostics_bundle` and `vsle_bluetooth_sensor_ready: true`.

### Milestone 4: Windows Classroom Package

Deliverables:

- self-contained `WeisileLink.exe`
- signed MSI/EXE installer
- Windows native RFCOMM adapter
- Credential Manager storage
- Scheduled Task or service startup
- clean-machine smoke evidence

Acceptance:

- A clean Windows computer pairs to a real ev3dev EV3 without USB and ScratchAI
  reads sensors through local WeisileLink.
- `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth` passes from the
  signed Windows installer evidence with default-redacted diagnostics and
  `vsle_bluetooth_sensor_ready: true`.

### Milestone 5: Fleet Tools

Deliverables:

- Classroom roster import/export.
- Device rename flow.
- Token rotation flow.
- Lost-token recovery flow.
- Multi-EV3 profile selection.

Acceptance:

- A teacher can prepare 10 EV3 bricks and 10 student computers with consistent
  labels and no terminal commands.

## Decisions To Make Before Implementation

1. Claim-code format:
   - 8 digits are easy to type.
   - 4 words are easier to read aloud.
   - QR is fastest but requires camera or printed label workflow.

2. Token exchange security:
   - Fast path: claim code returns token over local Bluetooth with rate limit.
   - Stronger path: desktop sends public key, EV3 encrypts token response.

3. Windows adapter technology:
   - .NET 8 is usually faster to build and maintain.
   - C++/WinRT may be better for low-level adapter control and packaging.

4. Startup scope:
   - Per-user startup works without admin rights.
   - Machine-wide Windows Service is better for IT labs.
   - Support both, default to per-user.

5. Public ScratchAI URL management:
   - Hard-code current public URL in classroom profile.
   - Or allow school-managed URL override.

## Recommended Next Step

Implement Milestone 1 and Milestone 2 as one vertical classroom slice:

1. Add EV3 first-boot claim-code provisioning.
2. Add `auth.claim` to `vsle_ev3_server.py`.
3. Add Desktop profile and secure token storage.
4. Add a minimal pairing wizard CLI or small UI.
5. Validate on macOS with one real EV3.

After that slice passes, port the same native adapter/profile/pairing contract
to Windows and collect clean-machine Windows evidence.
