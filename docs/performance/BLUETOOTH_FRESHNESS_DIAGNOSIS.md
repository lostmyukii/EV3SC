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

## Post-Fix Deployment Probe

After deploying commit `39229ff` to `/home/robot/vsle_ev3_server.py` and
restarting `vsle-ev3-server.service`, an EV3-local direct `read_all()` probe was
run with the service paused so the hardware path could be measured without
WebSocket, Bluetooth, or concurrent service reads. The EV3, A-port motor, and S1
touch sensor remained connected and no motor-run commands were sent.

The tiered snapshot cache improved the steady-state path substantially:

| Metric | Before cache | After cache |
|---|---:|---:|
| Direct `read_all()` average | `89.566ms` | `14.009ms` |
| Direct `read_all()` max | `160.133ms` | `76.289ms` |
| Reads over timed probe | `40` samples | `272` reads over `6.0s` |

Observed post-fix topology stayed correct: `S1` reported `type=touch`, motor
`A` stayed present, cached PID remained present in motor `A`, and cached
`battery_pct` plus `buttons` remained present in `system`.

The remaining max spike indicated that slow snapshot refresh still happened
inline inside `read_all()` once the low-frequency cache expired. That was much
better than reading slow fields every tick, but it could still violate the
strict `sensor_freshness_ms_max <= 25` gate during a refresh tick.

## Off-Hot-Path Slow Refresh Probe

After deploying commit `39bca9e`, `read_all()` was changed to only merge the
last completed slow cache, while `slow_snapshot_loop()` refreshes motor PID,
battery, and EV3 button data outside the hot path. A no-motor direct hot-path
probe was run with the service paused, one slow cache refresh completed before
the timed loop, and then only `read_all()` measured for `6.0s`.

| Metric | Inline slow refresh | Off-hot-path refresh |
|---|---:|---:|
| Direct `read_all()` average | `14.009ms` | `14.731ms` |
| Direct `read_all()` max | `76.289ms` | `59.465ms` |
| Reads over timed probe | `272` reads over `6.0s` | `268` reads over `6.0s` |

The probe preserved payload shape after the completed slow cache was merged:
`S1` reported `type=touch`, motor `A` stayed present with cached PID, and
`system` kept cached `battery_pct` plus `buttons`. No motor-run commands were
sent during the deployment or probe.

The strict max gate is still not met. Because slow refresh no longer runs in
`read_all()`, the remaining spikes are now isolated to the high-frequency
sensor and motor-basic path or EV3 scheduling jitter.

## Next Step

Profile the remaining high-frequency path with TDD-backed probes that split S1
sensor reads from motor position/speed/running reads. If motor basics are still
responsible for the max spikes, move them to a medium-frequency cache while
keeping S1 sensor reads on the 50Hz path.
