# ScratchAI Website Bluetooth Full Module Command Design

Date: 2026-05-28
Status: Implemented for command coverage; Bluetooth classroom readiness blocked
Scope: ScratchAI website EV3 Bluetooth mode, WeisileLink Desktop transport
selection, and full VSLE-EV3 module command coverage.

## 0. 2026-05-29 Evidence Decision

Real paired-ev3dev `vsle-bluetooth` evidence now confirms that all full-module
command groups can pass through the macOS native adapter and EV3 RFCOMM listener,
but the transport still misses the strict `sensor_freshness_ms_max <= 25` gate.
After EV3 hot-path caching, native adapter 5ms polling, and compact RFCOMM
sensor payloads, the remaining stream cadence clusters around the Bluetooth
Classic / macOS IOBluetooth boundary rather than the Scratch extension or EV3
hardware snapshot path.

Decision: keep `vsle-bluetooth` as a non-classroom diagnostic/fallback mode on
this evidence. WiFi Full VSLE remains the classroom 50Hz path. Full VSLE
Bluetooth must not be marked classroom-ready unless a redesigned Bluetooth
transport strategy or new real-EV3 evidence satisfies both the 25ms freshness
gate and release-artifact install gate.

## 1. Context From The Previous Work

The current ScratchAI website already loads the EV3SC-owned Unsandboxed
VSLE-EV3 extension from the public EV3 extension URL. The extension exposes the
complete current EV3 block surface:

| Module | Block count | Current source |
|---|---:|---|
| Motor | 16 | `vsle-ev3-extension/index.js` |
| Sensor | 20 | `vsle-ev3-extension/index.js` |
| Sound | 6 | `vsle-ev3-extension/index.js` |
| Display | 8 | `vsle-ev3-extension/index.js` |
| System | 6 | `vsle-ev3-extension/index.js` |
| Data collection | 8 | `vsle-ev3-extension/index.js` |
| AI Quest | 20 | `vsle-ev3-extension/index.js` |
| Total | 84 | current EV3SC block surface |

The website talks to hardware through the local Scratch Link compatible
WeisileLink endpoint:

```text
ScratchAI website
  -> ws://127.0.0.1:20111/scratch/bt
  -> WeisileLink Desktop
  -> selected EV3 transport
```

The project already has two Bluetooth-related paths, but they have different
meaning:

- `bluetooth`: EV3SC full-mode fallback for an EV3 that runs the EV3SC
  `vsle_ev3_server.py` stack. This path can preserve the same VSLE JSON command
  contract as WiFi.
- `official-bluetooth`: official LEGO firmware compatibility over Bluetooth
  Classic using EV3 Direct Commands. It is intentionally limited and currently
  source-backed only for Basic Pack behavior such as stop, device polling,
  touch, ultrasonic, color brightness, motor position, and limited sound.

The website must not use direct browser Web Bluetooth for classroom EV3 control.
The browser remains a Scratch programming surface; Bluetooth ownership stays in
WeisileLink Desktop and its native adapter boundary.

## 2. Product Goal

When a student selects Bluetooth from the ScratchAI EV3 connection flow, the
website should support every VSLE-EV3 module command through a deterministic
contract. A command must not fail merely because the browser chose a generic
"Bluetooth" label.

The design therefore separates two user-visible Bluetooth choices:

| Website label | Internal transport | EV3 requirement | Module coverage promise |
|---|---|---|---|
| Bluetooth Full VSLE | `vsle-bluetooth`, with backward-compatible alias to the existing full-mode `bluetooth` transport | EV3 runs ev3dev and `vsle_ev3_server.py` with RFCOMM enabled | Full VSLE command surface and cache-backed reporters; non-classroom diagnostic/fallback until the 25ms freshness and release-artifact gates pass |
| Official Firmware Bluetooth Compatibility | `official-bluetooth` | EV3 runs official LEGO firmware and is paired to the teacher computer | Explicit compatibility matrix, not full module parity |

The important product change is that "Bluetooth mode supports all modules"
means the website selects `vsle-bluetooth`, not `official-bluetooth`.
Compatibility mode remains available for quick trials and old EV3 projects, but
the UI and docs must not imply that it is the full module mode.

## 3. Approaches Considered

| Approach | Summary | Pros | Cons | Decision |
|---|---|---|---|---|
| Expand official-firmware Direct Commands until they mimic every module | Encode every VSLE command into EV3 Direct Command bytecode where possible | No ev3dev setup for schools | Cannot truthfully cover ev3dev-only PID behavior, 50Hz raw streaming, full AI Quest data flow, and some display/image semantics without source-backed firmware support and real hardware proof | Not the full-module path |
| Make the website talk directly to EV3 Bluetooth | Use browser APIs to connect from ScratchAI to EV3 | Removes local app from the mental model | Browser Bluetooth Classic coverage is not classroom reliable; it breaks existing security, diagnostics, and native adapter boundaries | Rejected |
| Add a full VSLE Bluetooth transport through WeisileLink Desktop | Browser keeps JSON-RPC; Desktop opens native Bluetooth Classic RFCOMM to EV3SC server running on ev3dev | Reuses existing full command contract, SensorCache, safety validation, Trainer routing, diagnostics, and release evidence gates | Requires EV3SC server on the EV3 and native adapter support on macOS/Windows | Recommended |

## 4. Target Architecture

```text
ScratchAI website
  -> Unsandboxed VSLE-EV3 extension
  -> SensorCache for reporters and booleans
  -> JSON-RPC commands to ws://127.0.0.1:20111/scratch/bt
  -> WeisileLink Desktop
       -> origin/token checks
       -> command validation and clamping
       -> per-session SensorDataRouter
       -> AI Quest contract and Trainer routes
       -> Transport selector
            -> wifi full mode
            -> vsle-bluetooth full mode
            -> official-bluetooth compatibility mode
```

The full Bluetooth transport is a byte transport only. It does not understand
Scratch blocks directly. WeisileLink core continues to own JSON-RPC,
validation, command acks, sensor routing, Trainer buffering, health, and
diagnostics. The EV3-side `vsle_ev3_server.py` continues to own hardware
dispatch for motors, sensors, sound, display, data collection, status light,
and emergency stop.

## 5. Transport Design

### 5.1 Full VSLE Bluetooth Transport

Expose a clear product transport name, `vsle-bluetooth`, for the full module
path. This should be implemented as a backward-compatible alias or rename of
the existing full-mode JSON-line `BluetoothTransport`; it is not the same thing
as `official-bluetooth`.

Responsibilities:

- Open an RFCOMM byte stream through an OS-native adapter on macOS/Windows or
  the existing stdlib socket path only where Linux support is verified.
- Speak the EV3SC JSON-line protocol used by the full EV3 server, not LEGO
  Direct Command bytecode.
- Reuse the existing WeisileLink command validation and ack-future behavior.
- Route `sensor_update` payloads into the same `SensorCache` paths used by WiFi.
- Preserve fail-closed behavior: invalid commands never reach the EV3, transport
  loss sends the safest available stop, and Scratch receives JSON-RPC errors.
- Report transport kind and freshness separately from WiFi in `/api/status`.

The EV3-side requirement is explicit: the EV3 must boot ev3dev and run the
EV3SC server with its Bluetooth/RFCOMM listener enabled.

This is not a request to write a new LEGO firmware image. The EV3-side work is
to deploy and, where necessary, extend the EV3SC-owned
`ev3-firmware/vsle_ev3_server.py` server so its existing RFCOMM JSON-line
listener is enabled, tested, and documented for full-module Bluetooth use.

### 5.2 Official Firmware Bluetooth Compatibility

Keep `official-bluetooth` as a separate mode. It may grow in capability, but it
does not satisfy the full-module promise until every claimed behavior has:

- source-backed Direct Command bytecode;
- fake-adapter unit tests;
- real official-firmware EV3 smoke evidence;
- clean-machine release-artifact evidence accepted by
  `scripts/run_desktop_install_smoke.py`.

Unsupported or partial behavior must be surfaced as compatibility status, not
silently treated as a successful full command.

### 5.3 Native Adapter Boundary

Both Bluetooth modes use the same principle: macOS and Windows Bluetooth Classic
must stay behind a project-owned native adapter process. Python stdlib
Bluetooth remains limited to verified Linux paths.

The native adapter protocol should expose only these byte-stream operations:

```text
connect(address, channel/profile)
send(bytes)
recv() -> bytes
close()
status() -> connected/error details
```

Protocol-specific framing belongs above this boundary:

- `vsle-bluetooth`: EV3SC JSON-line protocol.
- `official-bluetooth`: EV3 Direct Command frame protocol.

The current macOS native adapter already exposes a generic byte send/receive
shape, but its docs, environment variable names, and tests are scoped to
official-firmware Direct Command mode. Full VSLE Bluetooth needs a generalized
native byte-stream adapter name and tests so it can be used without implying
official-firmware behavior.

## 6. Command Coverage Model

Full command coverage is defined at the VSLE JSON-RPC method level. Every
website EV3 block must either:

1. read synchronously from `SensorCache`;
2. route to a WeisileLink host-side AI Quest/data command; or
3. send a validated EV3 hardware command through the selected full transport.

For `vsle-bluetooth`, coverage matches WiFi because the EV3 server remains the
hardware authority.

| Module | Full VSLE Bluetooth behavior |
|---|---|
| Motor | `motor.runForever`, `motor.runTimed`, position runs, sync run/turn, stop/reset, PID set/read through the EV3SC server |
| Sensor | All reporter and Boolean blocks read cache; EV3 server streams color, ultrasonic, gyro, touch, infrared, buttons, battery |
| Sound | Tone, tone-and-wait, file playback, volume, beep, stop through EV3SC server |
| Display | Text, number, clear, image, text-at, line, circle, update through EV3SC server |
| System | Status light, stop all, connection, battery, waits, emergency stop |
| Data collection | Collection commands and reporters remain host/EV3SC-server backed; uploads route to Trainer through WeisileLink |
| AI Quest | Upload/train/status/model/predict/export stay host-side in WeisileLink and use current sensor/data buffers |

For `official-bluetooth`, use a capability matrix with three states:

| State | Meaning |
|---|---|
| Native | Source-backed EV3 Direct Command effect exists and has real hardware evidence |
| Host-side | The command is owned by WeisileLink and does not require EV3 firmware support |
| Compatibility unavailable | The block must show a clear Scratch-visible error or disabled capability status |

This avoids false support claims while still letting the website expose the full
VSLE-EV3 category consistently.

## 7. Website Connection Flow

The connection modal should preserve Scratch's visual language and add clearer
transport choices:

- WiFi Full VSLE, recommended.
- Bluetooth Full VSLE, for ev3dev EV3 with EV3SC server Bluetooth enabled.
- Official Firmware Bluetooth Compatibility, for quick basic trials.

The modal sends:

```json
{
  "method": "vsle.setTransport",
  "params": {
    "transport": "vsle-bluetooth",
    "ev3_bt": "00:16:53:AA:BB:CC"
  }
}
```

For official firmware compatibility it sends:

```json
{
  "method": "vsle.setTransport",
  "params": {
    "transport": "official-bluetooth",
    "ev3_official_bt": "00:16:53:AA:BB:CC"
  }
}
```

The website must display connection state from WeisileLink health and recent
sensor freshness, not from optimistic UI state.

## 8. Protocol And Server Changes

Required changes for implementation planning:

1. Extend transport selection to recognize `vsle-bluetooth` as the full-module
   Bluetooth name while preserving `bluetooth` as a compatibility alias for
   existing callers.
2. Introduce a shared native byte-stream adapter interface that can be injected
   into both full VSLE Bluetooth and official-firmware Direct Command
   transports.
3. Reuse, rename, or wrap the existing full-mode `BluetoothTransport` as
   `VSLEBluetoothTransport` only if that improves clarity; do not duplicate the
   JSON-line RFCOMM implementation.
4. Keep the EV3 server command envelope unchanged so WiFi and full Bluetooth use
   the same method names, params, ack shape, validation, and sensor payloads.
5. Enable the EV3 server Bluetooth listener through setup scripts and systemd
   environment (`EV3_ENABLE_BLUETOOTH=1`, address/channel config), then verify
   it handles the same auth, command, ack, sensor, and shutdown behavior as
   WiFi.
6. Extend `/api/status` with:
   - `active_transport = "vsle-bluetooth"` or `"official-bluetooth"`;
   - `transport_capability = "full"` or `"compatibility"`;
   - native adapter path/version;
   - sensor freshness and measured update rate;
   - last unsupported capability error, when applicable.
7. Keep `official_ev3_direct_command.py` as the only Direct Command encoder
   surface for official firmware mode.

No Scratch block should branch into Bluetooth-specific behavior. Blocks remain
transport-agnostic and either read `SensorCache` or call WeisileLink JSON-RPC.

## 9. Safety, Security, And Privacy

- Bind `20111` and `8766` to `127.0.0.1` by default.
- Keep browser origins allowlisted for the public ScratchAI deployment and local
  preview URLs.
- Clamp motor speed, sound duration, sound frequency, display bounds, labels,
  and collection intervals before transport dispatch.
- On disconnect, issue `system.stopAll` or the safest available transport-level
  stop and clear pending command futures.
- Diagnostics redact Bluetooth addresses, pairing tokens, API keys, oversized
  labels, and student raw data by default.
- Do not write secrets or generated release artifacts into git.

## 10. Testing And Acceptance

Implementation should prove the design with tests at these layers:

| Layer | Required checks |
|---|---|
| Extension | All EV3 blocks remain exposed; reporters/booleans stay synchronous cache reads; `vsle.setTransport` sends the selected transport without Scratch visual changes |
| Coverage matrix | Generate/maintain a matrix from `vsle-ev3-extension/index.js`, `COMMAND_VALIDATORS`, JSON-RPC host-side handlers, and EV3 server handlers showing every block as cache-backed, host-side, or EV3-dispatched |
| JSON-RPC server | `vsle.setTransport` selects `vsle-bluetooth`; every hardware method in `COMMAND_VALIDATORS` forwards through the full Bluetooth transport with the same ack/error mapping as WiFi |
| Full Bluetooth transport | Fake byte-stream adapter tests for connect, JSON-line send, ack resolution, sensor update routing, timeout, reconnect, and disconnect stop |
| Native adapter | macOS/Windows adapter process tests for connect/send/recv/close and failure mapping |
| EV3 server | RFCOMM listener accepts the same auth, command, ack, sensor, and shutdown behavior as WiFi |
| Browser rehearsal | Website loads EV3 as Unsandboxed Extension, selects Bluetooth Full VSLE, shows connected state from real sensor freshness, and runs one command per module |
| Real hardware | Physical ev3dev EV3 full Bluetooth smoke covering motor, sensor, sound, display, system stop, data collect, and AI Quest upload/train/export path |
| Release evidence | Clean-machine artifact evidence for macOS and Windows before any classroom-ready claim |

The full-module Bluetooth command-coverage milestone is complete when the real
hardware smoke confirms all command groups through `vsle-bluetooth`. Classroom
readiness is a stricter milestone: it additionally requires release-artifact
install evidence and `sensor_freshness_ms_max <= 25`. Official firmware
compatibility evidence must remain separate.

## 11. Rollout Plan

1. Rename the ambiguous website Bluetooth choice in docs and UI copy so teachers
   understand the difference between Full VSLE Bluetooth and Official Firmware
   Compatibility.
2. Add the `vsle-bluetooth` transport selector path and fake-adapter parity
   tests against WiFi command behavior.
3. Add the full Bluetooth native adapter injection path for desktop releases.
4. Enable the EV3 server RFCOMM JSON-line listener in the ev3dev setup docs and
   install scripts.
5. Run browser rehearsal on the ScratchAI site with the full Bluetooth mode.
6. Collect real ev3dev EV3 Bluetooth command coverage evidence.
7. Keep official-firmware Direct Command expansion as a separate compatibility
   track with its own matrix and evidence gates.
8. Keep full VSLE Bluetooth in diagnostic/fallback status unless a redesigned
   Bluetooth stream or new real-EV3 evidence satisfies the classroom freshness
   and release-artifact gates.

## 12. Source Basis

- `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`: project transport, SensorCache,
  command validation, safety, desktop release, and official-firmware Bluetooth
  constraints.
- `vsle-ev3-extension/index.js`: current 84-block website EV3 module surface and
  transport-agnostic block implementation pattern.
- `weisile-link/weisile_link/protocol/validation.py`: current EV3 hardware
  command allowlist and clamping rules.
- `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`: existing
  official-firmware native adapter boundary and current compatibility behavior.
- `weisile-link/weisile_link/protocol/official_ev3_direct_command.py`: current
  source-backed Direct Command encoder/decoder.
- `scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js`:
  EV3SC-owned official Scratch EV3 reference for Scratch Link and Direct Command
  compatibility behavior.
- LEGO MINDSTORMS EV3 Communication Developer Kit:
  `https://www.lego.com/cdn/cs/set/assets/blt6879b00ae6951482/LEGO_MINDSTORMS_EV3_Communication_Developer_Kit.pdf`.
- LEGO MINDSTORMS EV3 Firmware Developer Kit:
  `https://www.lego.com/cdn/cs/set/assets/blt77bd61c3ac436ea3/LEGO_MINDSTORMS_EV3_Firmware_Developer_Kit.pdf`.
