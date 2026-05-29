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

## High-Frequency Path Split Probe

A follow-up probe split the remaining high-frequency path while keeping the EV3,
A-port motor, and S1 touch sensor connected. The service was paused during the
probe so no concurrent server reads interfered, and it was restarted
immediately afterward. No motor-run commands were sent.

| Component | Average | Max | Samples | Observed payload |
|---|---:|---:|---:|---|
| S1 sensor only | `7.025ms` | `13.653ms` | `190` | `S1 type=touch` |
| Motor A basics only | `5.185ms` | `12.964ms` | `191` | `position`, `running`, `speed` |
| Combined `read_all()` hot path | `12.853ms` | `19.761ms` | `191` | S1 + motor A basics + cached PID/system |

This run did not implicate motor basics as the remaining source of spikes:
sensor-only, motor-basic-only, and combined hot-path measurements all stayed
under the `25ms` freshness budget. The earlier `59.465ms` max now looks more
like occasional EV3 scheduling jitter or measurement-window variance than a
consistently slow motor-basic read. A medium-frequency motor-basic cache should
therefore wait until repeated probes show motor basics exceeding the budget.

## Next Step

Rerun the full `vsle-bluetooth` freshness evidence path now that the direct
high-frequency hot path can stay below 25ms in isolation. If Bluetooth evidence
still exceeds the gate, profile the bridge/native-adapter receive path and EV3
server WebSocket broadcast loop rather than adding motor-basic caching first.

## Full Bluetooth Rerun and RFCOMM Boundary Probe

The full command-group smoke was rerun after the hot-path split probe. The
current evidence improved from the earlier multi-second outliers, and all real
command groups still passed with the A-port motor and S1 touch sensor attached,
but the strict classroom freshness gate remained blocked:

| Metric | Observed |
|---|---:|
| `sensor_freshness_ms_max` | `499.251ms` |
| `sensor_freshness_ms_avg_observed` | `106.065ms` |
| `sensor_freshness_ms_p95_observed` | `246.559ms` |
| `sensor_updates_observed` | `86` |
| `ev3_payload_gap_ms_max` | `506.438ms` |
| `ev3_payload_gap_ms_avg` | `106.202ms` |
| `ev3_payload_gap_ms_p95` | `227.281ms` |

Two focused fixes were then tested against the real paired EV3:

1. The macOS native adapter receive poll interval was reduced from `50ms` to
   `5ms`. This removes a host-side latency floor in the IOBluetooth adapter
   loop.
2. EV3 Bluetooth broadcasts now use a compact high-frequency payload that keeps
   `sensors`, motor `position` / `speed` / `running`, and an empty `system`
   root while omitting low-frequency PID, battery, and button fields from every
   RFCOMM frame. WiFi/WebSocket clients still receive the full payload.

After rebuilding the macOS adapter bundle, deploying the compact EV3 server to
the brick, restarting `vsle-ev3-server`, and sampling the workspace
WeisileLink on a private `20211` port for 6 seconds, the decoded Bluetooth
payloads were compact (`S1` touch plus motor A basics, no PID/system slow
fields), but the real link still did not meet the 25ms gate:

| Metric | Observed |
|---|---:|
| Sensor notifications | `87` |
| Local receive gap average | `68.754ms` |
| Local receive gap max | `193.083ms` |
| Local receive gap p95 | `119.641ms` |
| EV3 payload timestamp gap average | `68.543ms` |
| EV3 payload timestamp gap max | `176.675ms` |
| EV3 payload timestamp gap p95 | `101.696ms` |

The compact payload result is important: the stream no longer includes the
previously slow PID, battery, or button fields, yet both local receive gaps and
EV3 payload timestamp gaps remain clustered around a roughly `60ms` cadence.
That points to the EV3 RFCOMM send / macOS IOBluetooth delivery boundary rather
than the Python hardware snapshot path.

## Current Decision Point

The 25ms full-Bluetooth freshness gate remains unmet. After multiple EV3-side
cache fixes, native-adapter polling reduction, and compact RFCOMM payloads, the
remaining behavior looks like a transport cadence limit for this EV3/macOS
Bluetooth Classic path.

Do not mark full VSLE Bluetooth classroom-ready from this evidence. The WiFi
path remains the intended 50Hz classroom transport. Before more Bluetooth fixes,
decide whether to:

- keep full VSLE Bluetooth as a non-classroom diagnostic/fallback mode with an
  explicit lower freshness expectation; or
- redesign the Bluetooth stream around a different native adapter/protocol
  strategy and collect new real-EV3 evidence.
