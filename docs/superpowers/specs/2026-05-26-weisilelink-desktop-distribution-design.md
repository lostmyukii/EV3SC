# WeisileLink Desktop Distribution Design

Date: 2026-05-26
Status: Design for implementation planning
Scope: macOS and Windows desktop distribution, installation reliability, and
official EV3 firmware Bluetooth compatibility. No implementation is included in
this document.

## 1. Product Intent

WeisileLink must be distributed as a reliable teacher-computer application for
macOS and Windows. Students continue to use ScratchAI in the browser, while
WeisileLink runs locally and exposes the Scratch Link compatible endpoint:

```text
ws://127.0.0.1:20111/scratch/bt
```

The desktop app is not a replacement for ScratchAI. It is the trusted local
bridge that connects the browser to classroom EV3 hardware, performs hardware
transport selection, enforces safety rules, and reports health status in terms a
teacher can act on.

## 2. Supported Modes

WeisileLink Desktop supports two EV3 connection modes.

| Mode | EV3 requirement | Transport | Capability target | Classroom role |
|---|---|---|---|---|
| Full VSLE mode | EV3 boots ev3dev and runs `vsle_ev3_server.py` | WiFi primary, EV3-side RFCOMM fallback only where configured | Full VSLE block surface, AI Quest, 50Hz stream, multi-device sessions | Production classroom mode |
| Official firmware Bluetooth compatibility mode | EV3 runs official LEGO firmware with Bluetooth enabled | Host-native Bluetooth Classic | Basic motor/sensor/sound pack, old EV3 project compatibility, no AI Quest raw-stream guarantee | First-run trial and low-friction school adoption |

The two modes share the Scratch-facing JSON-RPC endpoint and the browser-facing
connection modal, but they do not claim identical hardware capability.

## 3. Non-Negotiable Requirements

- All desktop source, packaging scripts, installer manifests, tests, and docs
  live under `/Users/yukii/Desktop/EV3SC/`.
- The desktop app binds to `127.0.0.1` by default. LAN binding requires explicit
  teacher configuration.
- `WEISILE_PAIRING_TOKEN`, API keys, EV3 Bluetooth addresses, and student data
  are never committed.
- Installers must use an embedded runtime or a verified bundled runtime. They
  must not depend on a teacher having a compatible system Python.
- macOS and Windows packages must be reproducible from checked-in scripts.
- Release artifacts must be signed before classroom distribution. macOS
  releases must be notarized before non-developer distribution.
- Install, upgrade, start, stop, health check, diagnostics export, and uninstall
  must be documented and tested on clean machines.
- Official firmware Bluetooth compatibility must be source-backed by the EV3
  Developer Kit and the project-owned Scratch EV3 extension reference. It must
  not invent EV3 bytecode or sensor modes.
- Python `socket.AF_BLUETOOTH` is acceptable only for Linux/ev3dev RFCOMM.
  macOS and Windows Bluetooth Classic require native adapters or verified
  Scratch Link-derived adapters. `pybluez` remains prohibited.

## 4. Desktop Architecture

```text
ScratchAI browser
  -> ws://127.0.0.1:20111/scratch/bt
  -> WeisileLink Core Service
       -> Health and diagnostics endpoint
       -> Transport selector
       -> Sensor cache/router
       -> AI Quest local trainer routes
       -> Full VSLE mode: WiFi WebSocket to ev3dev EV3
       -> Official firmware mode: Native BT adapter + Direct Command poller
```

The desktop distribution is composed of four units:

| Unit | Responsibility |
|---|---|
| WeisileLink core service | Existing Python JSON-RPC, health, Trainer, session, validation, and transport orchestration |
| Desktop supervisor | Starts/stops the core service, watches liveness, restarts on crash, exposes teacher status |
| Native Bluetooth adapter | macOS/Windows OS-specific Bluetooth Classic discovery, pairing, connect, send, receive |
| Installer package | Installs files, registers auto-start, validates ports, adds uninstall/rollback path, writes logs |

The core service remains platform-neutral. Platform-specific Bluetooth is kept
behind a narrow process boundary so OS-specific code cannot leak into
Scratch-facing protocol logic.

## 5. macOS Distribution Design

The macOS distribution target is a signed `.pkg` that installs a signed
WeisileLink app bundle and a per-user LaunchAgent.

Required behavior:

- Install to `/Applications/WeisileLink.app` or a VSLE-owned application path.
- Bundle the Python runtime or a self-contained executable produced by the build
  system. Do not use `/usr/bin/python3` for classroom releases.
- Register a per-user LaunchAgent named `cn.vsle.weisile-link`.
- Start on login and keep the bridge alive while ScratchAI is used.
- Bind only to localhost by default.
- Write logs to a user-readable VSLE log directory, not `/tmp`.
- Provide a menu/status UI or status page link that shows:
  - service running state;
  - ScratchAI client count;
  - active EV3 transport;
  - EV3 connection state;
  - sensor freshness;
  - pairing-token status without revealing the token;
  - one-click diagnostics export.
- Code-sign every executable and helper.
- Notarize release packages before teacher distribution.
- Include an uninstall script that unloads the LaunchAgent, stops the service,
  removes app files, and preserves diagnostics unless the teacher explicitly
  deletes them.

macOS official firmware Bluetooth compatibility must use a native adapter based
on Apple-supported Bluetooth Classic APIs or a verified Scratch Link-derived
adapter. The Python stdlib RFCOMM path is not considered supported on macOS.

## 6. Windows Distribution Design

The Windows distribution target is a signed installer, preferably MSI for school
deployment and a simple EXE bootstrapper for direct trials.

Required behavior:

- Install under `%ProgramFiles%\VSLE\WeisileLink` for machine-wide installs or
  `%LocalAppData%\Programs\VSLE\WeisileLink` for per-user installs.
- Bundle the Python runtime or a self-contained executable. Do not depend on a
  teacher-installed Python.
- Register either a Windows Service or a per-user startup task. The first
  classroom release should prefer per-user startup when admin rights are not
  guaranteed, with a documented machine-wide service option for IT-managed labs.
- Bind only to `127.0.0.1` by default.
- Handle Windows Firewall prompts by avoiding LAN listening unless explicitly
  configured.
- Write logs under `%ProgramData%\VSLE\WeisileLink\logs` for machine-wide mode
  or `%LocalAppData%\VSLE\WeisileLink\logs` for per-user mode.
- Provide Start Menu shortcuts for:
  - Open status page;
  - Start WeisileLink;
  - Stop WeisileLink;
  - Export diagnostics;
  - Uninstall WeisileLink.
- Configure service recovery or supervisor restart for unexpected crashes.
- Sign release executables and installers.
- Include an uninstall path that stops the service/task, removes installed
  binaries, unregisters startup entries, and preserves diagnostics unless the
  teacher explicitly deletes them.

Windows official firmware Bluetooth compatibility must use a native adapter
based on Windows-supported Bluetooth Classic APIs such as WinRT or .NET
Bluetooth APIs, verified against real EV3 hardware. The Python stdlib RFCOMM
path is not supported on Windows.

## 7. Official EV3 Firmware Bluetooth Compatibility

Compatibility mode connects to an EV3 running the official LEGO firmware. It
does not require ev3dev and does not deploy files to the EV3.

The transport stack is:

```text
WeisileLink core
  -> official EV3 compatibility transport
  -> native macOS/Windows Bluetooth Classic adapter
  -> EV3 Direct Command byte stream
  -> official EV3 firmware
```

First release capability:

| Capability | First release status | Source basis |
|---|---|---|
| Discover and pair EV3 | Required | Scratch Link BT protocol and official Scratch EV3 behavior |
| Motor timed run | Required | Official Scratch EV3 `OPOUTPUT_TIME_SPEED` usage |
| Motor stop and emergency stop | Required | Official Scratch EV3 motor stop behavior |
| Motor position | Required | Official Scratch EV3 `OPOUTPUT_GET_COUNT` polling |
| Touch pressed | Required | Official Scratch EV3 `OPINPUT_READSI` polling |
| Ultrasonic distance | Required | Official Scratch EV3 distance polling |
| Color reflected or ambient brightness | Required | Official Scratch EV3 brightness polling |
| Color ID | Required after Direct Command mode verification | EV3 Developer Kit sensor modes |
| Gyro angle/rate | Experimental until real EV3 verification passes | EV3 Developer Kit sensor modes |
| Infrared proximity/remote/beacon | Experimental until real EV3 verification passes | EV3 Developer Kit sensor modes |
| Sound tone/beep | Required | Official Scratch EV3 sound opcode usage |
| Display drawing, status LED, PID, AI Quest raw stream | Not part of first compatibility release | Full VSLE mode only |

Compatibility mode updates the same `SensorCache` shape used by the browser, but
the data freshness target is different:

| Mode | Freshness target |
|---|---|
| Full VSLE WiFi mode | 50Hz target, stale after 200ms |
| Official firmware Bluetooth mode | 6-10Hz target, stale after 500ms |

Scratch reporter blocks still read from cache synchronously. The compatibility
transport owns polling; reporter blocks must never do inline Bluetooth calls.

## 8. Installation Reliability Requirements

Every desktop release must pass these checks before it can be called classroom
ready:

1. Clean install on a macOS machine with no developer tools and no custom Python.
2. Clean install on a Windows machine with no developer tools and no custom
   Python.
3. Start after reboot/login.
4. Status endpoint reports healthy within 10 seconds after startup.
5. ScratchAI can connect to `ws://127.0.0.1:20111/scratch/bt`.
6. Port conflict is detected and shown with a clear recovery message.
7. Logs are written to the documented location.
8. Diagnostics export contains config summary, version, health payload, recent
   logs, and OS details, but excludes secrets and student raw data by default.
9. Upgrade preserves teacher configuration and pairing tokens.
10. Uninstall removes startup entries and service files.
11. Crash supervisor restarts the bridge or shows a teacher-visible failure.
12. Emergency stop remains available during shutdown and transport loss.

## 9. Security and Privacy

- The desktop app must never expose `20111` or `8766` on LAN without explicit
  configuration.
- Browser origins remain allowlisted.
- Pairing tokens are stored in OS-appropriate user config locations with
  restricted permissions.
- Diagnostic bundles redact pairing tokens, API keys, Bluetooth addresses unless
  teacher explicitly includes device identifiers, and labels longer than 64
  characters.
- Official firmware Bluetooth mode must still clamp motor speed and duration in
  WeisileLink before Direct Command encoding.
- If the desktop app cannot confirm EV3 connection state, command blocks fail
  closed with Scratch-visible JSON-RPC errors.

## 10. Testing and Acceptance

Testing must cover five layers:

| Layer | Required checks |
|---|---|
| Core service | Existing Python unit tests, JSON-RPC compatibility, health payloads |
| Installer static validation | Manifest fields, paths, autostart entries, localhost defaults, uninstall scripts |
| Packaging smoke | Build artifacts exist, signed/notarized metadata recorded where applicable |
| Runtime smoke | Fresh machine install, reboot/login start, ScratchAI WebSocket connection |
| Hardware smoke | Full mode real ev3dev EV3; compatibility mode official firmware EV3 over Bluetooth |

No desktop release is complete if it only works from a developer checkout. The
release artifact itself must be installed and tested.

## 11. Documentation Deliverables

Implementation must produce:

- `docs/desktop/WEISILELINK_DESKTOP.md`: teacher install and troubleshooting.
- `docs/desktop/MACOS_INSTALL.md`: macOS package install, permissions,
  auto-start, logs, uninstall.
- `docs/desktop/WINDOWS_INSTALL.md`: Windows installer, service/startup, logs,
  firewall, uninstall.
- `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`: capability matrix and
  limitations for official firmware Bluetooth mode.
- `docs/desktop/DIAGNOSTICS.md`: diagnostic export contents and redaction rules.

## 12. Rollout Strategy

Release order:

1. Package the existing WiFi full mode as macOS and Windows local desktop builds.
2. Add installer reliability checks, clean-machine smoke scripts, and
   diagnostics export.
3. Add official firmware Bluetooth compatibility behind an explicit
   "Basic Bluetooth Compatibility" mode label.
4. Run separate real-hardware evidence for:
   - ev3dev WiFi full mode;
   - official firmware Bluetooth compatibility on macOS;
   - official firmware Bluetooth compatibility on Windows.

The first public classroom package may ship with WiFi full mode only if the UI
clearly marks official firmware Bluetooth compatibility as unavailable. It must
not imply official firmware support until the native adapter and real EV3 smoke
tests pass on that OS.
