# VSLE Bluetooth Sensor Freshness Diagnosis

Date: 2026-05-29

## Context

The full `vsle-bluetooth` command-group smoke now observes the real S1 touch
sensor and all command groups pass, but classroom readiness is still blocked by
the 25ms freshness gate. The latest smoke evidence recorded:

- `sensor_freshness_ms_max`: `2549.83`
- `sensor_updates_observed`: `72`
- `command_groups.sensor`: `true`
- `sensor_ports_observed`: `S1`
- `sensor_types_observed.S1`: `touch`

## Layered Findings

The S1 touch sensor is physically healthy. ev3dev sysfs reported
`driver=lego-ev3-touch` on `ev3-ports:in1`, and manual press/release sampling
observed `0->1->0`.

The EV3-local VSLE WebSocket stream is slower than the 50Hz target even before
macOS Bluetooth is involved. A 6 second local `ws://127.0.0.1:8765` sample on
the EV3 observed 44 updates, with average gap `138.141ms` and max gap
`195.354ms`.

Direct EV3 hardware reads also exceed the 20ms loop budget when all roots are
read every tick. `EV3DevHardware.read_all()` over 40 samples averaged
`89.566ms`, with max `160.133ms`.

Component timing shows the high-frequency S1 sensor read is not the primary
blocker:

| Component | Average | Max | Note |
|---|---:|---:|---|
| S1 sensor read | `14.734ms` | `26.783ms` | Close to the 20-25ms target |
| Motor root read | `35.355ms` | `88.009ms` | Includes PID reads |
| System root read | `36.336ms` | `47.135ms` | Includes EV3 button polling |
| Motor PID read | `26.571ms` | `62.727ms` | Too slow for every 20ms tick |
| EV3 buttons read | `28.591ms` | `38.472ms` | Too slow for every 20ms tick |

A proposed fast path that reads S1 plus motor position/speed/running, while
omitting high-frequency PID and system button reads, averaged `25.378ms` with a
median of `23.855ms`, but still had a max of `57.706ms`.

## Root Cause

The freshness failure is rooted on the EV3 hardware read path, not only on the
macOS native Bluetooth adapter. The current 50Hz loop attempts to read sensors,
motors, motor PID, battery, and buttons every tick. On real ev3dev hardware,
motor PID and button reads alone can exceed the entire 25ms freshness budget.

## Next Step

Implement a cache-tiered EV3 snapshot path:

- Keep sensor reads on the high-frequency path.
- Keep motor position/speed/running on a medium-frequency path if needed.
- Move motor PID, battery, and EV3 button reads to low-frequency cached paths.
- Keep outgoing payload shape stable by merging cached slow fields into each
  broadcast.
- Add tests proving the high-frequency snapshot path avoids slow PID/button
  reads while preserving reporter-visible cache keys.
