# Official EV3 Firmware Bluetooth Compatibility

This mode allows a first-version trial path for EV3 bricks that still run the
official LEGO firmware. It does not install ev3dev, does not deploy files to the
brick, and does not replace full VSLE mode.

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

## Capability Matrix

| Capability | Compatibility status |
|---|---|
| EV3 discovery and pairing | Required before release |
| Timed motor run | Required before release |
| Motor stop and emergency stop | Required before release |
| Motor position polling | Required before release |
| Touch sensor pressed | Required before release |
| Ultrasonic distance | Required before release |
| Color reflected or ambient brightness | Required before release |
| Color ID | Requires Direct Command mode verification |
| Gyro angle/rate | Experimental until real EV3 evidence passes |
| Infrared proximity/remote/beacon | Experimental until real EV3 evidence passes |
| Sound tone/beep | Required before release |
| Display drawing | Full VSLE mode only for first release |
| Status LED | Full VSLE mode only for first release |
| PID controls | Full VSLE mode only |
| AI Quest raw stream | Full VSLE mode only |
| 50Hz raw streaming | Full VSLE mode only |

## Current Implementation Status

The EV3SC transport now has an automated, fake-adapter verified Direct Reply
path for official-firmware polling:

- Device-list replies identify sensor ports and motor ports using the official
  Scratch EV3 byte offsets.
- Sensor/motor value replies decode sensor SI floats and motor signed 32-bit
  tachometer counts from Direct Reply global memory.
- Supported Basic Pack cache paths include `sensors.S1.ambient`,
  `sensors.S1.brightness`, `sensors.S2.distance_inch`,
  `sensors.S2.distance_cm`, `sensors.S4.pressed`, and
  `motors.<A-D>.position` when the EV3 reports a motor on that port.
- The poll loop writes the same `SensorCache` shape used by VSLE mode and emits
  normal `sensor_update` payloads to the Scratch-facing bridge.

This is still not real hardware approval. macOS official-firmware Bluetooth
compatibility remains blocked until a paired official-firmware EV3 connects
through the native adapter and the install-smoke evidence gate records
`official_firmware_bt_real_ev3_ok: true` from a release artifact.

## Transport Boundary

The Scratch-facing endpoint remains JSON-RPC 2.0 over
`ws://127.0.0.1:20111/scratch/bt`. Behind that endpoint, compatibility mode
uses an official EV3 compatibility transport, an OS-native Bluetooth Classic
adapter, and EV3 Direct Commands.

Python stdlib Bluetooth is not a macOS or Windows implementation path. macOS
and Windows support must stay unavailable until native adapter tests and real
official-firmware EV3 smoke evidence pass on that OS.

Native adapter ownership is documented in:

- `desktop/macos/native/README.md`
- `desktop/windows/native/README.md`

Both adapters must stay behind the WeisileLink
`NativeBluetoothAdapterProtocol` boundary.

## Install Smoke Evidence Gate

Official firmware Bluetooth compatibility can be marked available on an OS only
after the installed release artifact produces evidence with these fields:

```json
{
  "release_artifact_manifest": "desktop/release/<os>/WeisileLink-<os>-0.1.0-manifest.json",
  "installed_from_release_artifact": true,
  "started_after_reboot": true,
  "scratch_link_endpoint_ok": true,
  "official_firmware_bt_real_ev3_ok": true
}
```

The `release_artifact_manifest` must be the manifest generated for the
installed artifact. macOS manifests must record `signed: true` and
`notarized: true`; Windows manifests must record `signed: true`. All manifests
must record a bundled self-contained executable before the install smoke gate
can accept release-artifact evidence.

Run:

```bash
python scripts/run_desktop_install_smoke.py \
  --evidence docs/desktop/evidence/<os>-install-smoke.json \
  --report docs/desktop/evidence/<os>-install-smoke.md
```

The runner exits non-zero when any field is missing, false, or when the evidence
declares a developer-checkout or localhost-only run. That prevents a local
development smoke from being mistaken for release support.

## Sensor Freshness

Compatibility mode updates the same `SensorCache` shape as full VSLE mode, but
the freshness target is lower. Full VSLE WiFi mode targets 50Hz and a 200ms
stale threshold. Official firmware Bluetooth compatibility targets 6-10Hz and a
500ms stale threshold. Scratch reporter and Boolean blocks must still read from
cache synchronously.

## Safety Behavior

WeisileLink must clamp unsafe motor, sound, and duration values before Direct
Command encoding. Transport loss must trigger the safest available stop behavior
and return Scratch-visible JSON-RPC errors rather than silently pretending the
EV3 is still connected.
